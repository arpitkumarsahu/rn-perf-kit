/**
 * withNavigationPerf(navigationRef)
 * Wraps a React Navigation ref to intercept navigation events.
 *
 * Usage:
 *   <NavigationContainer ref={withNavigationPerf(navigationRef)}>
 */
import type { NavigationContainerRef, ParamListBase } from '@react-navigation/core';
import { timeline } from '@rn-perf-kit/core';
import { startNavSession, notePendingTap, noteTransition } from './nav-state';

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
  let currentKey: string | undefined;
  let currentName = '';

  // Sessions are keyed by route KEY: pushing the same screen with new params
  // (fund A -> fund B) is a new navigation even though the route name is unchanged.
  const unsubscribeState = nav.addListener('state', () => {
    const route = nav.getCurrentRoute();
    if (!route || route.key === currentKey) return;
    const fromKey = currentKey;
    const fromName = currentName;
    currentKey = route.key;
    currentName = route.name;
    // Off (PerfProvider disabled): track position only, start no sessions or timers
    if (!timeline.enabled) return;
    startNavSession(fromName, route.name, { fromKey, toKey: route.key });
  });

  // Fires before the state change; startNavSession() attaches it to the new session
  const unsubscribeAction = nav.addListener('__unsafe_action__' as any, () => {
    if (timeline.enabled) notePendingTap();
  });

  // React Navigation 7 re-emits every navigator event here, including the stack
  // navigators' transitionStart / transitionEnd (target = route key). On v6 this event
  // doesn't exist and the listener is simply never called; use useNavigationPerf().
  const unsubscribeEvent = nav.addListener('__unsafe_event__' as any, (e: any) => {
    const type = e?.data?.type;
    if (type === 'transitionStart' || type === 'transitionEnd') noteTransition(type, e.data.target);
  });

  return () => {
    unsubscribeState();
    unsubscribeAction();
    unsubscribeEvent();
  };
}
