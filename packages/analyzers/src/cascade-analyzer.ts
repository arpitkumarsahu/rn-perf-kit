/**
 * Cascade & Interruption Analyzer
 * Detects cascading updates and discarded renders.
 */
import type { PerfEvent } from '@rn-perf-kit/core';
import type { Finding, AnalyzerContext } from './types';

export function analyzeCascades(events: PerfEvent[], ctx: AnalyzerContext): Finding[] {
  const findings: Finding[] = [];
  const commits = events.filter((e) => e.type === 'commit') as Extract<PerfEvent, { type: 'commit' }>[];
  const discarded = events.filter((e) => e.type === 'render-discarded') as Extract<PerfEvent, { type: 'render-discarded' }>[];

  for (let i = 0; i < commits.length - 1; i++) {
    const a = commits[i];
    const b = commits[i + 1];
    if (b.t - a.t < ctx.frameBudgetMs && b.phase === 'nested-update') {
      findings.push({
        id: `cascade:nested-update:${a.t}`,
        severity: 'warning',
        category: 'cascade',
        title: 'Cascading update detected (setState in useLayoutEffect)',
        detail: `Two commits within ${(b.t - a.t).toFixed(1)}ms. Second commit is nested-update.`,
        suggestion: 'Move state update to useEffect or derive value during render instead.',
        t: a.t,
      });
    }
  }

  const discardedByComponent = new Map<string, number>();
  for (const ev of discarded) {
    discardedByComponent.set(ev.component, (discardedByComponent.get(ev.component) ?? 0) + ev.renderCount);
  }

  for (const [component, count] of discardedByComponent) {
    if (count >= 3) {
      findings.push({
        id: `cascade:discarded:${component}`,
        severity: 'warning',
        category: 'cascade',
        title: `${component}: ${count} discarded renders`,
        detail: `React started ${count} renders of ${component} that were thrown away without committing.`,
        suggestion: 'If using startTransition, check render cost. If not, check for state thrash.',
        component,
        t: discarded.find((e) => e.component === component)?.t ?? 0,
      });
    }
  }

  // Suspense thrash: a boundary falling back to its loading state again and again
  const fallbacks = new Map<string, number[]>();
  for (const ev of events) {
    if (ev.type !== 'suspense' || !ev.showingFallback) continue;
    if (!fallbacks.has(ev.boundary)) fallbacks.set(ev.boundary, []);
    fallbacks.get(ev.boundary)!.push(ev.t);
  }
  for (const [boundary, times] of fallbacks) {
    for (let i = 0; i + SUSPENSE_THRASH_COUNT - 1 < times.length; i++) {
      if (times[i + SUSPENSE_THRASH_COUNT - 1] - times[i] > SUSPENSE_THRASH_WINDOW_MS) continue;
      const count = times.filter((t) => t >= times[i] && t <= times[i] + SUSPENSE_THRASH_WINDOW_MS).length;
      findings.push({
        id: `cascade:suspense-thrash:${boundary}`,
        severity: 'warning',
        category: 'cascade',
        title: `Suspense thrash: ${boundary} showed its fallback ${count}x in ${SUSPENSE_THRASH_WINDOW_MS / 1000}s`,
        detail: 'The boundary kept switching between its loading fallback and content.',
        suggestion: 'Wrap the update that suspends in startTransition (keeps old content on screen), or cache the data so it does not re-suspend.',
        component: boundary,
        t: times[i],
      });
      break;
    }
  }

  return findings;
}

const SUSPENSE_THRASH_COUNT = 3;
const SUSPENSE_THRASH_WINDOW_MS = 2000;
