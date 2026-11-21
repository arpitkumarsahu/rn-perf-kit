import { useEffect } from 'react';
import { installNavigationListeners } from './withNavigationPerf';

export function useExpoRouterPerf(): void {
  let ref: any = null;
  try {
    // Dynamically load expo-router so standard React Navigation apps don't crash
    const { useNavigationContainerRef } = require('expo-router');
    ref = useNavigationContainerRef();
  } catch {
    // expo-router not installed or not in an Expo Router app
  }
  useEffect(() => (ref ? installNavigationListeners(ref as any) : undefined), [ref]);
}
