/**
 * JS thread stall detector.
 * Posts a sentinel task to the JS message queue every POLL_MS.
 * If late by STALL_THRESHOLD_MS -> emit 'stall' event.
 */
import { timeline } from '@rn-perf-kit/core';

const POLL_MS = 50;
const STALL_THRESHOLD_MS = 50;

let timer: ReturnType<typeof setTimeout> | null = null;
let lastScheduled = 0;

function tick(): void {
  const now = performance.now();
  const delay = now - lastScheduled - POLL_MS;
  if (delay > STALL_THRESHOLD_MS) {
    timeline.add({ type: 'stall', t: lastScheduled, dur: delay });
  }
  lastScheduled = now;
  timer = setTimeout(tick, POLL_MS);
}

export function startStallDetector(): void {
  if (timer !== null) return;
  lastScheduled = performance.now();
  timer = setTimeout(tick, POLL_MS);
}

export function stopStallDetector(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}
