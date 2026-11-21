/**
 * Zustand middleware for rn-perf-kit.
 * Records state changes with their changed keys.
 *
 * Usage:
 *   const useCart = create(zustandPerf('cart', (set) => ({ ... })));
 */
import { timeline } from '@rn-perf-kit/core';

type StateCreator<T> = (
  set: (partial: Partial<T> | ((state: T) => Partial<T>)) => void,
  get: () => T,
  api: unknown
) => T;

export function zustandPerf<T extends object>(
  storeName: string,
  creator: StateCreator<T>
): StateCreator<T> {
  return (set, get, api) => {
    const patchedSet = (partial: Partial<T> | ((state: T) => Partial<T>)): void => {
      const prevState = get();
      set(partial);
      const nextState = get();
      const changedKeys = (Object.keys(nextState) as Array<keyof T>)
        .filter((k) => prevState[k] !== nextState[k])
        .map(String);
      if (changedKeys.length > 0) {
        timeline.add({
          type: 'store',
          t: timeline.now(),
          source: 'zustand',
          key: changedKeys.join(','),
          storeName,
        });
      }
    };
    return creator(patchedSet, get, api);
  };
}
