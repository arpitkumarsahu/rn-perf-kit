/**
 * Zustand middleware for rn-perf-kit.
 * Records state changes with their changed keys.
 *
 * Usage:
 *   const useCart = create(zustandPerf('cart', (set) => ({ ... })));
 */
import { timeline } from '@rn-perf-kit/core';

type SetState<T> = (partial: T | Partial<T> | ((state: T) => T | Partial<T>), replace?: boolean) => void;
type StateCreator<T> = (
  set: SetState<T>,
  get: () => T,
  api: unknown
) => T;

export function zustandPerf<T extends object>(
  storeName: string,
  creator: StateCreator<T>
): StateCreator<T> {
  return (set, get, api) => {
    // Forward `replace`: set(state, true) swaps the whole state instead of merging
    const patchedSet: SetState<T> = (partial, replace) => {
      const prevState = get();
      set(partial, replace);
      const nextState = get();
      const keys = new Set([...Object.keys(prevState), ...Object.keys(nextState)]) as Set<keyof T>;
      const changedKeys = [...keys].filter((k) => prevState[k] !== nextState[k]).map(String);
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
