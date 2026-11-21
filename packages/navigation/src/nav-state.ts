/**
 * Navigation session state manager.
 *
 * One session per navigation, identified by the destination route KEY (so pushing the
 * same screen with new params is a new navigation). Phases are recorded automatically:
 *
 *   tap               navigation action dispatched (container __unsafe_action__)
 *   dispatch          navigation state changed to the new route
 *   first-commit      first React commit after dispatch
 *   transition-start  navigator reported the screen transition starting (native/JS stack)
 *   transition-end    ...and finishing
 *   content-ready     usePerfScreen(<route name>).markReady() on the destination
 *   interactive       transition done and no React commits for SETTLE_MS
 *
 * Navigators without transition events (tabs, drawers) skip transition-*; the session
 * then settles on commits alone. recordNavPhase() can still set any phase manually.
 */
import { timeline, type PerfEvent } from '@rn-perf-kit/core';

export interface NavSession {
  navId: string;
  fromRoute: string;
  toRoute: string;
  fromKey?: string;
  toKey?: string;
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

type NavPhase =
  | 'tap'
  | 'dispatch'
  | 'first-commit'
  | 'transition-start'
  | 'transition-end'
  | 'content-ready'
  | 'interactive';

/** Quiet period (no React commits) after which a navigation counts as interactive. */
const SETTLE_MS = 250;
/**
 * Stack navigators start the native transition after React commits the new screen; on
 * slow devices that can be later than SETTLE_MS. Until this long after dispatch, a session
 * without transition events keeps waiting for one (tabs/drawers just close a bit later;
 * their `interactive` time is unaffected).
 */
const TRANSITION_GRACE_MS = 2000;
/** A navigation that never settles (e.g. a screen animating forever) is closed here. */
const MAX_SESSION_MS = 5000;
/** A navigation action older than this is not attached to the next state change. */
const PENDING_TAP_MAX_AGE_MS = 1000;

let sessionCounter = 0;
let activeSession: NavSession | null = null;
let pendingTapAt: number | null = null;
let lastWorkEnd = 0;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
let subscribed = false;

function clearTimers(): void {
  if (settleTimer !== null) clearTimeout(settleTimer);
  if (maxTimer !== null) clearTimeout(maxTimer);
  settleTimer = maxTimer = null;
}

function armSettle(): void {
  if (settleTimer !== null) clearTimeout(settleTimer);
  settleTimer = setTimeout(trySettle, SETTLE_MS);
}

function trySettle(): void {
  settleTimer = null;
  const s = activeSession;
  if (!s) return;
  // A transition was announced but hasn't finished: wait for transition-end
  if (s.transitionStartAt !== undefined && s.transitionEndAt === undefined) {
    armSettle();
    return;
  }
  // No transition yet: give a stack navigator time to start one
  if (s.transitionStartAt === undefined && timeline.now() - (s.dispatchAt ?? 0) < TRANSITION_GRACE_MS) {
    armSettle();
    return;
  }
  finishSession();
}

function finishSession(): void {
  const s = activeSession;
  clearTimers();
  if (!s) return;
  if (s.interactiveAt === undefined) {
    const at = Math.max(lastWorkEnd, s.transitionEndAt ?? 0, s.firstCommitAt ?? 0, s.dispatchAt ?? 0);
    recordNavPhase('interactive', at);
  }
  activeSession = null;
}

function ensureSubscriptions(): void {
  if (subscribed) return;
  subscribed = true;
  timeline.on('commit', (e: PerfEvent) => {
    const s = activeSession;
    if (!s || e.type !== 'commit' || e.t < (s.dispatchAt ?? 0)) return;
    if (s.firstCommitAt === undefined) recordNavPhase('first-commit', e.t);
    lastWorkEnd = Math.max(lastWorkEnd, e.t + Math.max(e.dur, 0));
    armSettle();
  });
  timeline.on('mark', (e: PerfEvent) => {
    const s = activeSession;
    if (!s || e.type !== 'mark' || s.contentReadyAt !== undefined) return;
    if (e.name === `screen:ready:${s.toRoute}`) recordNavPhase('content-ready', e.t);
  });
}

export function notePendingTap(t?: number): void {
  pendingTapAt = t ?? timeline.now();
}

export function startNavSession(
  fromRoute: string,
  toRoute: string,
  keys: { fromKey?: string; toKey?: string } = {}
): NavSession {
  if (activeSession) finishSession();
  ensureSubscriptions();
  const navId = String(++sessionCounter);
  const now = timeline.now();
  activeSession = {
    navId,
    fromRoute,
    toRoute,
    ...keys,
    droppedFrames: 0,
    totalFrames: 0,
    commitsDuringTransition: [],
  };
  if (pendingTapAt !== null && now - pendingTapAt <= PENDING_TAP_MAX_AGE_MS) {
    activeSession.tapAt = pendingTapAt;
    timeline.add({ type: 'nav', t: pendingTapAt, phase: 'tap', route: toRoute, fromRoute, navId });
  }
  pendingTapAt = null;
  activeSession.dispatchAt = now;
  lastWorkEnd = now;
  timeline.add({ type: 'nav', t: now, phase: 'dispatch', route: toRoute, fromRoute, navId });
  armSettle();
  maxTimer = setTimeout(finishSession, MAX_SESSION_MS);
  return activeSession;
}

/**
 * A navigator transition event. Only the destination screen's events count
 * (`target` = its route key); the screen being covered or popped is ignored.
 */
export function noteTransition(type: 'transitionStart' | 'transitionEnd', targetKey?: string): void {
  const s = activeSession;
  if (!s || !targetKey || targetKey !== s.toKey) return;
  if (type === 'transitionStart') {
    if (s.transitionStartAt === undefined) recordNavPhase('transition-start');
  } else if (s.transitionEndAt === undefined) {
    recordNavPhase('transition-end');
    armSettle();
  }
}

export function getActiveNavSession(): NavSession | null {
  return activeSession;
}

/** Ends the active session now (recording `interactive` if it wasn't yet). */
export function endNavSession(): NavSession | null {
  const s = activeSession;
  finishSession();
  return s;
}

export function recordNavPhase(phase: NavPhase, t?: number): void {
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
