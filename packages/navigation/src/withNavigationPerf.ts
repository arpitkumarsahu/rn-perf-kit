/**
 * withNavigationPerf(navigationRef)
 * Wraps a React Navigation ref to intercept navigation events.
 *
 * Usage:
 *   <NavigationContainer ref={withNavigationPerf(navigationRef)}>
 */
import type { NavigationContainerRef, ParamListBase } from '@react-navigation/core';
import { startNavSession, notePendingTap } from './nav-state';

type NavRef = NavigationContainerRef<ParamListBase>;
const cache = new WeakMap<object, (instance: NavRef | null) => void>();

export function withNavigationPerf(ref: { current: NavRef | null }) {
  const existing = cache.get(ref);
  if (existing) return existing;
  let cleanup: (() => void) | undefined;
  const callbackRef = (instance: NavRef | null) => {
    ref.current = instance;
    cleanup?.();
    cleanup = instance ? installNavigationListeners(instance) : undefined;
  };
  cache.set(ref, callbackRef);
  return callbackRef;
}

export function installNavigationListeners(nav: NavRef): () => void {
  let currentRoute = '';

  const unsubscribeState = nav.addListener('state', () => {
    const route = nav.getCurrentRoute()?.name ?? '';
    if (route && route !== currentRoute) {
      startNavSession(currentRoute, route);
      currentRoute = route;
    }
  });

  // Fires before the state change; startNavSession() attaches it to the new session
  const unsubscribeAction = nav.addListener('__unsafe_action__' as any, () => {
    notePendingTap();
  });

  return () => {
    unsubscribeState();
    unsubscribeAction();
  };
}
