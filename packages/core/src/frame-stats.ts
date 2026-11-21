/**
 * Frame statistics shared by the overlay, the fps budget and reports.
 *
 * UI fps is derived from DROPPED frames, not from the number of frame events:
 *   - Android (JankStats) only reports frames it actually draws, so an idle screen
 *     produces ~0 events even though nothing is wrong.
 *   - iOS (CADisplayLink) reports every vsync, idle or not.
 * Counting events made idle Android screens read "1fps" while iOS read "60fps".
 * Counting dropped frames gives the same answer on both: an idle screen drops nothing.
 */
import type { PerfEvent } from './events';

type FrameEvent = Extract<PerfEvent, { type: 'frame' }>;

export interface FrameStats {
  /** Frame events in the window. 0 means the UI was idle (nothing drawn on Android). */
  frames: number;
  jankFrames: number;
  /** Estimated vsyncs missed because a frame ran long. */
  droppedFrames: number;
  /** refreshRateHz minus the dropped-frame rate, clamped to [0, refreshRateHz]. */
  uiFps: number;
  /** false when no frame events arrived, i.e. the screen was idle. */
  active: boolean;
}

/** Vsyncs a single janky frame cost. Non-janky frames cost nothing. */
export function droppedFramesFor(frame: { dur: number; janky: boolean }, frameBudgetMs: number): number {
  if (!frame.janky) return 0;
  return Math.max(1, Math.round(frame.dur / frameBudgetMs) - 1);
}

export function computeFrameStats(
  events: readonly PerfEvent[],
  windowMs: number,
  refreshRateHz: number
): FrameStats {
  const hz = refreshRateHz > 0 ? refreshRateHz : 60;
  const budget = 1000 / hz;
  let frames = 0;
  let jankFrames = 0;
  let droppedFrames = 0;
  for (const e of events) {
    if (e.type !== 'frame') continue;
    const f = e as FrameEvent;
    frames++;
    if (f.janky) jankFrames++;
    droppedFrames += droppedFramesFor(f, budget);
  }
  const droppedPerSec = windowMs > 0 ? (droppedFrames * 1000) / windowMs : 0;
  const uiFps = Math.max(0, Math.min(hz, Math.round(hz - droppedPerSec)));
  return { frames, jankFrames, droppedFrames, uiFps, active: frames > 0 };
}
