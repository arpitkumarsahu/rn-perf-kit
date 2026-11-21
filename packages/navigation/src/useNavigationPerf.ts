/**
 * Hook that connects navigation screen lifecycle events to the timeline.
 */
import { useFocusEffect, useRoute } from '@react-navigation/core';
import { timeline } from '@rn-perf-kit/core';
import { recordNavPhase, getActiveNavSession } from './nav-state';

export function useNavigationPerf(screenName?: string): void {
  const route = useRoute();
  const name = screenName ?? route.name;

  useFocusEffect(() => {
    const session = getActiveNavSession();
    if (session && session.toRoute === name) {
      recordNavPhase('transition-end');
    }
    return () => { timeline.mark(`screen:blur:${name}`); };
  });
}
