import { RingBuffer } from '../ring-buffer';
import type { PerfEvent } from '../events';

function makeStall(t: number, dur = 10): PerfEvent {
  return { type: 'stall', t, dur };
}

describe('RingBuffer', () => {
  it('stores and returns events in order', () => {
    const buf = new RingBuffer({ capacity: 5 });
    buf.push(makeStall(100));
    buf.push(makeStall(200));
    buf.push(makeStall(300));
    const events = buf.query();
    expect(events).toHaveLength(3);
    expect(events[0].t).toBe(100);
    expect(events[2].t).toBe(300);
  });

  it('overwrites oldest events when full', () => {
    const buf = new RingBuffer({ capacity: 3 });
    buf.push(makeStall(1));
    buf.push(makeStall(2));
    buf.push(makeStall(3));
    buf.push(makeStall(4));
    const events = buf.query();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.t)).toEqual([2, 3, 4]);
  });

  it('filters by time range', () => {
    const buf = new RingBuffer({ capacity: 10 });
    for (let i = 0; i < 10; i++) buf.push(makeStall(i * 100));
    const slice = buf.query(200, 500);
    expect(slice.map((e) => e.t)).toEqual([200, 300, 400, 500]);
  });

  it('reports correct size', () => {
    const buf = new RingBuffer({ capacity: 5 });
    expect(buf.size).toBe(0);
    buf.push(makeStall(1));
    buf.push(makeStall(2));
    expect(buf.size).toBe(2);
  });
});
