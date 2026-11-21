/**
 * JS thread stall detector.
 * Posts a sentinel task to the JS message queue every POLL_MS.
 * If late by STALL_THRESHOLD_MS -> emit 'stall' event.
 *
 * React Native pauses JS timers while the app is in the background, so the first tick
 * after resuming would be "late" by the whole time spent in the background. The detector
 * stops on background and restarts with a fresh baseline on foreground.
 */
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { timeline } from '@rn-perf-kit/core';

const POLL_MS = 50;
const STALL_THRESHOLD_MS = 50;

let timer: ReturnType<typeof setTimeout> | null = null;
let lastScheduled = 0;
let running = false;
let appStateSub: NativeEventSubscription | null = null;

function tick(): void {
  const now = performance.now();
  const delay = now - lastScheduled - POLL_MS;
  if (delay > STALL_THRESHOLD_MS) {
    timeline.add({ type: 'stall', t: lastScheduled, dur: delay });
  }
  lastScheduled = now;
  timer = setTimeout(tick, POLL_MS);
}

function schedule(): void {
  if (timer !== null) return;
  lastScheduled = performance.now();
  timer = setTimeout(tick, POLL_MS);
}

function unschedule(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

function onAppStateChange(state: AppStateStatus): void {
  if (!running) return;
  if (state === 'active') schedule();
  else unschedule();
}

export function startStallDetector(): void {
  if (running) return;
  running = true;
  appStateSub = AppState.addEventListener('change', onAppStateChange);
  if (AppState.currentState !== 'background') schedule();
}

export function stopStallDetector(): void {
  running = false;
  appStateSub?.remove();
  appStateSub = null;
  unschedule();
}
