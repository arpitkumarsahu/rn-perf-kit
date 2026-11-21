/**
 * withNavigationPerf(navigationRef)
 * Wraps a React Navigation ref to intercept navigation events.
 *
 * Usage:
 *   <NavigationContainer ref={withNavigationPerf(navigationRef)}>
 */
import type { NavigationContainerRef, ParamListBase } from '@react-navigation/core';
import { startNavSession, recordNavPhase, getActiveNavSession } from './nav-state';
import { timeline } from '@rn-perf-kit/core';

type NavRef = NavigationContainerRef<ParamListBase>;

export function withNavigationPerf(ref: React.RefObject<NavRef>): React.RefObject<NavRef> {
  return ref;
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

  const unsubscribeAction = nav.addListener('__unsafe_action__' as any, () => {
    recordNavPhase('tap');
  });

  return () => { unsubscribeState(); unsubscribeAction(); };
}
