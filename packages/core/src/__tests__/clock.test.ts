import { PerfClock } from '../clock';

describe('PerfClock', () => {
  it('converts native timestamps to JS timeline', () => {
    const clock = new PerfClock();
    let callCount = 0;
    jest.spyOn(clock as any, 'jsNow').mockImplementation(() => {
      return callCount++ === 0 ? 100 : 102;
    });
    clock.install(() => 200, 999_999);
    const result = clock.nativeToJs(300);
    // offset = 200 - 101 = 99, so 300 - 99 = 201
    expect(result).toBeCloseTo(201, 0);
    clock.uninstall();
  });

  it('falls back gracefully before first sync', () => {
    const clock = new PerfClock();
    expect(clock.nativeToJs(500)).toBe(500);
  });
});
