/**
 * Render-Cause Analyzer
 * Detects render storms, fan-outs, selector instability.
 */
import type { PerfEvent } from '@rn-perf-kit/core';
import type { Finding, AnalyzerContext } from './types';

const STORM_THRESHOLD_PER_SEC = 30;
const FAN_OUT_THRESHOLD = 15;
const WINDOW_MS = 2000;
/** Report wasted renders when at least this many happened and they're this share of all. */
const WASTED_MIN_COUNT = 50;
const WASTED_MIN_PCT = 25;
/** Per component: renders caused only by re-created props / selector results. */
const UNSTABLE_REF_MIN = 10;
const UNSTABLE_SELECTOR_MIN = 3;
const STORE_CAUSES: ReadonlySet<string> = new Set(['store-subscription', 'unstable-selector']);

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
  const wastedByName = new Map<string, number>();
  const unstableRefByName = new Map<string, number>();
  const unstableSelectorByName = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const ev of commitEvents) {
    // Count commits, not fibers: 60 Views rendering in ONE commit is not 60 renders of "View".
    const seen = new Set<string>();
    for (const fiber of ev.fibers) {
      totalFibers++;
      if (fiber.wasted) wastedFibers++;
      if (!isPrimitive(fiber.name)) {
        if (fiber.wasted) bump(wastedByName, fiber.name);
        if (fiber.cause === 'unstable-reference') bump(unstableRefByName, fiber.name);
        if (fiber.cause === 'unstable-selector') bump(unstableSelectorByName, fiber.name);
      }
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
    // Prefer renders the fiber hook attributed to a store subscription; commits within
    // 50 ms also contain unrelated renders. Older data without store causes falls back
    // to every component in those commits.
    const subscribed = new Set<string>();
    const all = new Set<string>();
    for (const commitEv of commitEvents) {
      if (commitEv.t < storeEv.t || commitEv.t > windowEnd) continue;
      for (const f of commitEv.fibers) {
        if (isPrimitive(f.name)) continue;
        all.add(f.name);
        if (STORE_CAUSES.has(f.cause)) subscribed.add(f.name);
      }
    }
    const affected = subscribed.size > 0 ? subscribed : all;
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

  const wastedPct = totalFibers > 0 ? (wastedFibers / totalFibers) * 100 : 0;
  const firstT = commitEvents[0]?.t ?? 0;
  if (wastedFibers >= WASTED_MIN_COUNT && wastedPct >= WASTED_MIN_PCT) {
    findings.push({
      id: 'render:wasted',
      severity: 'warning',
      category: 'render',
      title: `Wasted renders: ${wastedPct.toFixed(0)}% of component renders changed nothing`,
      detail: `${wastedFibers} of ${totalFibers} renders had no prop, state or context change. Most: ${topList(wastedByName)}.`,
      suggestion: 'Wrap the listed components in React.memo() and keep their props stable with useCallback/useMemo.',
      t: firstT,
      meta: { wastedFibers, totalFibers, byComponent: Object.fromEntries(wastedByName) },
    });
  }
  for (const [name, count] of top(unstableRefByName, 3)) {
    if (count < UNSTABLE_REF_MIN) break;
    findings.push({
      id: `render:unstable-reference:${name}`,
      severity: 'warning',
      category: 'render',
      title: `Unstable props: ${name} re-rendered ${count}x because props were re-created`,
      detail: `The new props had the same contents as the old ones (new object/array/function each render).`,
      suggestion: 'Memoize the props passed to it (useMemo/useCallback, or hoist constants) and wrap it in React.memo().',
      component: name,
      t: firstT,
    });
  }
  for (const [name, count] of top(unstableSelectorByName, 3)) {
    if (count < UNSTABLE_SELECTOR_MIN) break;
    findings.push({
      id: `render:selector-instability:${name}`,
      severity: 'warning',
      category: 'render',
      title: `Selector instability: ${name} re-rendered ${count}x for an unchanged store value`,
      detail: 'A store selector returned a new object/array with the same contents, so every store update re-rendered it.',
      suggestion: 'Return primitives or stable references from selectors, use a memoized selector (reselect), or pass shallowEqual / useShallow.',
      component: name,
      t: firstT,
    });
  }

  return {
    findings,
    stats: { totalCommits: commitEvents.length, totalFibers, wastedFibers, wastedPct },
  };
}

function top(m: Map<string, number>, n: number): Array<[string, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function topList(m: Map<string, number>): string {
  const list = top(m, 5).map(([name, count]) => `${name} (${count})`);
  return list.length > 0 ? list.join(', ') : 'React Native primitives only';
}
