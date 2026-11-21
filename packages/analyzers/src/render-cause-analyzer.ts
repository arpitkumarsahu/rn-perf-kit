/**
 * Render-Cause Analyzer
 * Detects render storms, fan-outs, selector instability.
 */
import type { PerfEvent } from '@rn-perf-kit/core';
import type { Finding, AnalyzerContext } from './types';

const STORM_THRESHOLD_PER_SEC = 30;
const FAN_OUT_THRESHOLD = 15;
const WINDOW_MS = 2000;

// React Native building blocks. They re-render whenever their parent does, so a "storm"
// on View/Text is always a symptom; the component that owns them is the finding.
const PRIMITIVES: ReadonlySet<string> = new Set([
  'View', 'Text', 'TextImpl', 'Image', 'ScrollView', 'FlatList', 'VirtualizedList',
  'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
  'TextInput', 'Modal', 'SafeAreaView', 'KeyboardAvoidingView', 'ActivityIndicator',
]);

function isPrimitive(name: string): boolean {
  return PRIMITIVES.has(name) || /^Animated(Component)?\(.+\)$/.test(name);
}

export interface RenderCauseReport {
  findings: Finding[];
  stats: { totalCommits: number; totalFibers: number; wastedFibers: number; wastedPct: number };
}

export function analyzeRenderCauses(events: PerfEvent[], _ctx: AnalyzerContext): RenderCauseReport {
  const findings: Finding[] = [];
  const commitEvents = events.filter((e) => e.type === 'commit') as Extract<PerfEvent, { type: 'commit' }>[];
  const storeEvents = events.filter((e) => e.type === 'store') as Extract<PerfEvent, { type: 'store' }>[];

  let totalFibers = 0, wastedFibers = 0;
  const componentRenders = new Map<string, number[]>();

  for (const ev of commitEvents) {
    // Count commits, not fibers: 60 Views rendering in ONE commit is not 60 renders of "View".
    const seen = new Set<string>();
    for (const fiber of ev.fibers) {
      totalFibers++;
      if (fiber.wasted) wastedFibers++;
      if (seen.has(fiber.name) || isPrimitive(fiber.name)) continue;
      seen.add(fiber.name);
      if (!componentRenders.has(fiber.name)) componentRenders.set(fiber.name, []);
      componentRenders.get(fiber.name)!.push(ev.t);
    }
  }

  for (const [name, times] of componentRenders) {
    for (let i = 0; i < times.length; i++) {
      const windowEnd = times[i] + WINDOW_MS;
      const count = times.filter((t) => t >= times[i] && t <= windowEnd).length;
      if ((count / (WINDOW_MS / 1000)) > STORM_THRESHOLD_PER_SEC) {
        findings.push({
          id: `render:storm:${name}:${times[i]}`,
          severity: 'critical',
          category: 'render',
          title: `Render storm: ${name} rendered ${count}x in ${WINDOW_MS / 1000}s`,
          detail: `${(count / (WINDOW_MS / 1000)).toFixed(0)} renders/second.`,
          suggestion: 'Check for unstable prop references. Wrap with React.memo() and useCallback().',
          component: name,
          t: times[i],
        });
        break;
      }
    }
  }

  for (const storeEv of storeEvents) {
    const windowEnd = storeEv.t + 50;
    const affected = new Set<string>();
    for (const commitEv of commitEvents) {
      if (commitEv.t < storeEv.t || commitEv.t > windowEnd) continue;
      commitEv.fibers.forEach((f) => affected.add(f.name));
    }
    if (affected.size > FAN_OUT_THRESHOLD) {
      findings.push({
        id: `render:fan-out:${storeEv.key}:${storeEv.t}`,
        severity: 'warning',
        category: 'render',
        title: `Fan-out: ${storeEv.key} update caused ${affected.size} component renders`,
        detail: `Store: ${storeEv.source}/${storeEv.key}. Components: ${[...affected].slice(0, 5).join(', ')}${affected.size > 5 ? ` +${affected.size - 5} more` : ''}.`,
        suggestion: 'Split large stores. Use fine-grained selectors. Consider Context splitting.',
        t: storeEv.t,
      });
    }
  }

  return {
    findings,
    stats: { totalCommits: commitEvents.length, totalFibers, wastedFibers, wastedPct: totalFibers > 0 ? (wastedFibers / totalFibers) * 100 : 0 },
  };
}
