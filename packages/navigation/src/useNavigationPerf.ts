/**
 * Optional per-screen hook.
 *
 * With React Navigation 7 / Expo Router, installNavigationListeners() (used by
 * withNavigationPerf and useExpoRouterPerf) already records every phase from the
 * container. This hook adds the screen's own transitionEnd for React Navigation 6, which
 * has no container-level event stream, and a `screen:blur:<name>` mark.
 */
import { useCallback, useEffect } from 'react';
import { timeline } from '@rn-perf-kit/core';
import { noteTransition } from './nav-state';

// Metro's module-scoped require. Optional peer: loaded lazily so `rn-perf-kit` can be
// imported by apps that don't use React Navigation at all (Metro skips unresolvable
// requires inside try/catch).
declare const require: (id: string) => any;
let navigationCore: any = null;
try {
  navigationCore = require('@react-navigation/core');
} catch {
  navigationCore = null;
}

export function useNavigationPerf(screenName?: string): void {
  if (!navigationCore) {
    throw new Error('[rn-perf-kit] useNavigationPerf() requires @react-navigation/core.');
  }
  const { useFocusEffect, useNavigation, useRoute } = navigationCore;
  const route = useRoute();
  const navigation = useNavigation();
  const name: string = screenName ?? route.name;
  const key: string = route.key;

  // useFocusEffect re-runs whenever its callback changes identity: keep it stable so the
  // blur mark is recorded once per blur, not on every re-render of a focused screen.
  useFocusEffect(
    useCallback(() => () => timeline.mark(`screen:blur:${name}`), [name])
  );

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return undefined;
    const offStart = navigation.addListener('transitionStart', (e: any) => {
      if (!e?.data?.closing) noteTransition('transitionStart', key);
    });
    const offEnd = navigation.addListener('transitionEnd', (e: any) => {
      if (!e?.data?.closing) noteTransition('transitionEnd', key);
    });
    return () => {
      offStart?.();
      offEnd?.();
    };
  }, [navigation, key]);
}
