/**
 * Fixed-capacity ring buffer for PerfEvents.
 * When full, oldest events are overwritten (FIFO eviction).
 */

import type { PerfEvent } from './events';

export interface RingBufferOptions {
  capacity?: number;
  windowMs?: number;
}

export class RingBuffer {
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly buffer: Array<PerfEvent | undefined>;
  private head = 0;
  private count = 0;
  private evictedCount = 0;

  constructor(options: RingBufferOptions = {}) {
    // A 120 Hz device emits 7,200 frame events per minute on its own; 20k keeps a full
    // 60 s report window in deep mode on most devices.
    this.capacity = options.capacity ?? 20_000;
    this.windowMs = options.windowMs ?? 60_000;
    this.buffer = new Array(this.capacity);
  }

  push(event: PerfEvent): void {
    if (this.count === this.capacity) this.evictedCount++;
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  query(fromT?: number, toT?: number): PerfEvent[] {
    const results: PerfEvent[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      const ev = this.buffer[idx];
      if (!ev) continue;
      if (fromT !== undefined && ev.t < fromT) continue;
      if (toT !== undefined && ev.t > toT) continue;
      results.push(ev);
    }
    return results;
  }

  recent(now: number): PerfEvent[] {
    return this.query(now - this.windowMs, now);
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.evictedCount = 0;
    this.buffer.fill(undefined);
  }

  get size(): number {
    return this.count;
  }

  get maxSize(): number {
    return this.capacity;
  }

  /** Events overwritten because the buffer was full (oldest-first). */
  get evicted(): number {
    return this.evictedCount;
  }
}
