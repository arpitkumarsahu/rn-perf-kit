/**
 * Navigation Analyzer
 * Correlates nav phase events, commits, frames, stalls into per-navigation reports.
 */
import type { PerfEvent } from '@rn-perf-kit/core';
import type { Finding, AnalyzerContext } from './types';

interface NavPhaseTimings {
  navId: string;
  fromRoute: string;
  toRoute: string;
  tapAt?: number;
  dispatchAt?: number;
  firstCommitAt?: number;
  transitionStartAt?: number;
  transitionEndAt?: number;
  contentReadyAt?: number;
  interactiveAt?: number;
}

export interface NavigationReport {
  navId: string;
  route: string;
  fromRoute: string;
  phases: Partial<Record<string, number>>;
  durations: {
    tapToDispatch?: number;
    dispatchToFirstCommit?: number;
    transition?: number;
    toContentReady?: number;
    toInteractive?: number;
  };
  droppedFrames: number;
  totalFrames: number;
  droppedPct: number;
  commitsDuringTransition: Array<{ dur: number; source: string }>;
  jsDuringTransition: number;
  findings: Finding[];
}

export function analyzeNavigation(events: PerfEvent[], ctx: AnalyzerContext): NavigationReport[] {
  const reports: NavigationReport[] = [];
  const navSessions = new Map<string, NavPhaseTimings>();

  for (const ev of events) {
    if (ev.type !== 'nav') continue;
    if (!navSessions.has(ev.navId)) {
      navSessions.set(ev.navId, { navId: ev.navId, fromRoute: ev.fromRoute ?? '', toRoute: ev.route });
    }
    const s = navSessions.get(ev.navId)!;
    switch (ev.phase) {
      case 'tap': s.tapAt = ev.t; break;
      case 'dispatch': s.dispatchAt = ev.t; break;
      case 'first-commit': s.firstCommitAt = ev.t; break;
      case 'transition-start': s.transitionStartAt = ev.t; break;
      case 'transition-end': s.transitionEndAt = ev.t; break;
      case 'content-ready': s.contentReadyAt = ev.t; break;
      case 'interactive': s.interactiveAt = ev.t; break;
    }
  }

  for (const [_navId, s] of navSessions) {
    if (!s.fromRoute) s.fromRoute = '(app start)';
    const { fromRoute, toRoute, tapAt, dispatchAt, firstCommitAt, transitionStartAt, transitionEndAt, contentReadyAt, interactiveAt } = s;
    const tsStart = transitionStartAt ?? firstCommitAt ?? dispatchAt ?? 0;
    // Tabs/drawers report no transition: judge the window up to `interactive` instead
    const tsEnd = transitionEndAt ?? interactiveAt ?? contentReadyAt ?? 0;

    let dropped = 0, total = 0, jsStall = 0;
    const commitsDuring: Array<{ dur: number; source: string }> = [];

    for (const ev of events) {
      if (!tsStart || !tsEnd) break;
      if (ev.t < tsStart || ev.t > tsEnd) continue;
      if (ev.type === 'frame') { total++; if (ev.janky) dropped++; }
      if (ev.type === 'commit') commitsDuring.push({ dur: ev.dur, source: 'react' });
      if (ev.type === 'stall') jsStall += ev.dur;
    }

    const droppedPct = total > 0 ? (dropped / total) * 100 : 0;
    const findings: Finding[] = [];

    if (droppedPct > (ctx.tier === 'LOW' ? 15 : ctx.tier === 'MID' ? 10 : 5)) {
      findings.push({
        id: `nav:dropped-frames:${s.navId}`,
        severity: 'critical',
        category: 'navigation',
        title: `Dropped ${dropped}/${total} frames during ${fromRoute} → ${toRoute}`,
        detail: `${droppedPct.toFixed(0)}% drop rate. Commit time: ${commitsDuring.reduce((a, c) => a + c.dur, 0).toFixed(0)}ms. JS stall: ${jsStall.toFixed(0)}ms.`,
        suggestion: 'Defer heavy component mounts until after transitionEnd. Use native-stack.',
        route: `${fromRoute} → ${toRoute}`,
        t: tsStart,
        meta: { dropped, total, commitsDuring },
      });
    }

    const heavy = commitsDuring.filter((c) => c.dur > ctx.frameBudgetMs);
    if (heavy.length > 0) {
      findings.push({
        id: `nav:heavy-commit:${s.navId}`,
        severity: 'warning',
        category: 'navigation',
        title: `${heavy.length} commit(s) over frame budget during ${fromRoute} → ${toRoute}`,
        detail: `Commits: ${heavy.map((c) => `${c.dur.toFixed(0)}ms`).join(', ')}. Budget: ${ctx.frameBudgetMs}ms.`,
        suggestion: 'Wrap expensive screen content in React.lazy() or defer with startTransition.',
        route: `${fromRoute} → ${toRoute}`,
        t: tsStart,
      });
    }

    reports.push({
      navId: s.navId,
      route: toRoute,
      fromRoute,
      phases: { tap: tapAt, dispatch: dispatchAt, firstCommit: firstCommitAt, transitionStart: transitionStartAt, transitionEnd: transitionEndAt, contentReady: contentReadyAt, interactive: interactiveAt },
      durations: {
        tapToDispatch: tapAt && dispatchAt ? dispatchAt - tapAt : undefined,
        dispatchToFirstCommit: dispatchAt && firstCommitAt ? firstCommitAt - dispatchAt : undefined,
        transition: tsStart && tsEnd ? tsEnd - tsStart : undefined,
        toContentReady: dispatchAt && contentReadyAt ? contentReadyAt - dispatchAt : undefined,
        toInteractive: dispatchAt && interactiveAt ? interactiveAt - dispatchAt : undefined,
      },
      droppedFrames: dropped,
      totalFrames: total,
      droppedPct,
      commitsDuringTransition: commitsDuring,
      jsDuringTransition: jsStall,
      findings,
    });
  }

  return reports;
}
