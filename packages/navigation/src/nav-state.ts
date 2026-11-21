/**
 * Navigation session state manager.
 * Tracks per-navigation timing data as it flows through phases.
 */
import { timeline } from '@rn-perf-kit/core';

export interface NavSession {
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
  droppedFrames: number;
  totalFrames: number;
  commitsDuringTransition: Array<{ t: number; dur: number; source: string }>;
}

let sessionCounter = 0;
let activeSession: NavSession | null = null;

export function startNavSession(fromRoute: string, toRoute: string): NavSession {
  const navId = String(++sessionCounter);
  activeSession = { navId, fromRoute, toRoute, droppedFrames: 0, totalFrames: 0, commitsDuringTransition: [] };
  timeline.add({ type: 'nav', t: timeline.now(), phase: 'dispatch', route: toRoute, fromRoute, navId });
  return activeSession;
}

export function getActiveNavSession(): NavSession | null { return activeSession; }
export function endNavSession(): NavSession | null {
  const s = activeSession;
  activeSession = null;
  return s;
}

export function recordNavPhase(
  phase: 'tap' | 'dispatch' | 'first-commit' | 'transition-start' | 'transition-end' | 'content-ready' | 'interactive',
  t?: number
): void {
  if (!activeSession) return;
  const now = t ?? timeline.now();
  switch (phase) {
    case 'tap': activeSession.tapAt = now; break;
    case 'dispatch': activeSession.dispatchAt = now; break;
    case 'first-commit': activeSession.firstCommitAt = now; break;
    case 'transition-start': activeSession.transitionStartAt = now; break;
    case 'transition-end': activeSession.transitionEndAt = now; break;
    case 'content-ready': activeSession.contentReadyAt = now; break;
    case 'interactive': activeSession.interactiveAt = now; break;
  }
  timeline.add({ type: 'nav', t: now, phase, route: activeSession.toRoute, fromRoute: activeSession.fromRoute, navId: activeSession.navId });
}
