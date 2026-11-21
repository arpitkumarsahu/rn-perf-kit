/**
 * Clock synchronization between JS (performance.now) and native clocks.
 *
 * Strategy:
 *   js1 -> nativeNow() -> js2
 *   offset = native - (js1 + js2) / 2
 */

export interface NativeNowFn {
  (): number;
}

export interface ClockSync {
  offset: number;
  errorMargin: number;
  sampledAt: number;
}

export class PerfClock {
  private syncState: ClockSync | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private nativeNow: NativeNowFn | null = null;

  install(nativeNow: NativeNowFn, resyncIntervalMs = 30_000): void {
    this.nativeNow = nativeNow;
    this.sync();
    this.syncInterval = setInterval(() => this.sync(), resyncIntervalMs);
  }

  uninstall(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.nativeNow = null;
    this.syncState = null;
  }

  sync(): void {
    if (!this.nativeNow) return;
    const js1 = this.jsNow();
    const native = this.nativeNow();
    const js2 = this.jsNow();
    const jsMid = (js1 + js2) / 2;
    this.syncState = {
      offset: native - jsMid,
      errorMargin: (js2 - js1) / 2,
      sampledAt: js2,
    };
  }

  jsNow(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  nativeToJs(nativeMs: number): number {
    if (!this.syncState) return nativeMs;
    return nativeMs - this.syncState.offset;
  }

  get syncInfo(): ClockSync | null {
    return this.syncState;
  }
}

export const perfClock = new PerfClock();
