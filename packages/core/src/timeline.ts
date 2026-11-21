/**
 * Global timeline singleton.
 * All collectors write here; all analyzers read from here.
 */

import type { PerfEvent, PerfEventType } from './events';
import { RingBuffer, type RingBufferOptions } from './ring-buffer';
import { perfClock } from './clock';

type EventListener = (event: PerfEvent) => void;

export interface TimelineOptions extends RingBufferOptions {
  enabled?: boolean;
}

class Timeline {
  private buffer: RingBuffer;
  private listeners = new Map<PerfEventType | '*', Set<EventListener>>();
  private _enabled = true;

  constructor(options: TimelineOptions = {}) {
    this.buffer = new RingBuffer(options);
    this._enabled = options.enabled ?? true;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

  now(): number {
    return perfClock.jsNow();
  }

  add(event: PerfEvent): void {
    if (!this._enabled) return;
    this.buffer.push(event);
    this.emit(event);
  }

  mark(name: string, data?: unknown): void {
    this.add({ type: 'mark', t: this.now(), name, data });
  }

  query(fromT?: number, toT?: number): PerfEvent[] {
    return this.buffer.query(fromT, toT);
  }

  recent(windowMs?: number): PerfEvent[] {
    const now = this.now();
    return this.buffer.query(now - (windowMs ?? 60_000), now);
  }

  on(eventType: PerfEventType | '*', listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
    return () => this.off(eventType, listener);
  }

  off(eventType: PerfEventType | '*', listener: EventListener): void {
    this.listeners.get(eventType)?.delete(listener);
  }

  private emit(event: PerfEvent): void {
    this.listeners.get(event.type)?.forEach((fn) => fn(event));
    this.listeners.get('*')?.forEach((fn) => fn(event));
  }

  clear(): void {
    this.buffer.clear();
  }

  get size(): number {
    return this.buffer.size;
  }
}

export const timeline = new Timeline();
export type { Timeline };
