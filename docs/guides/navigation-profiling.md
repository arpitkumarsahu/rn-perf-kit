# Diagnosing & Fixing Navigation Jank

Navigation is the most visible interaction in a mobile app. On low-end Android devices, screen transitions frequently suffer from stutter, frozen touch responses, and blank white screens.

This guide explains how `rn-perf-kit` measures navigation phases and how to eliminate the most common cause of transition jank: **heavy subtrees mounting during the transition animation**.

---

## The 6 Navigation Phases

When a user taps a button to open a new screen, the transition moves through six distinct phases:

```
[ tap ] ──► [ dispatch ] ──► [ first-commit ] ──► [ transition-start ] ──► [ transition-end ] ──► [ content-ready ] ──► [ interactive ]
```

| Phase | Description | How `rn-perf-kit` captures it |
|---|---|---|
| **Tap → Dispatch** | Time between the navigation action and the state change | Container `__unsafe_action__` listener (`withNavigationPerf` / `useExpoRouterPerf`) |
| **Dispatch → First Commit** | Time until React commits the new route | First React commit after the state change |
| **Transition Start → End** | The native/JS slide or fade animation duration | The destination screen's `transitionStart` / `transitionEnd`, read from the container on React Navigation 7 / Expo Router (stack navigators only; tabs and drawers have none) |
| **Content Ready** | When primary data/UI has loaded | `usePerfScreen(<route name>).markReady()` on the destination screen |
| **Interactive** | The transition has finished and React has been quiet (no commits) for 250ms | Recorded automatically; a navigation that never settles is closed after 5s |

Navigations are tracked by route **key**, so pushing the same screen with different params (product A → product B) counts as a new navigation.

---

## Setting Up Navigation Instrumentation

### Standard React Navigation

`withNavigationPerf(ref)` returns a cached callback ref that automatically binds all required state listeners when `<NavigationContainer>` mounts:

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { withNavigationPerf } from 'rn-perf-kit/navigation';

export function RootNavigator() {
  const navRef = useRef(null);

  return (
    <NavigationContainer ref={withNavigationPerf(navRef)}>
      {/* Screens */}
    </NavigationContainer>
  );
}
```

### Expo Router

In Expo Router apps, call `useExpoRouterPerf()` inside your root `_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { useExpoRouterPerf } from 'rn-perf-kit/expo-router';

export default function Layout() {
  useExpoRouterPerf(); // Listens to Expo Router navigation container: all phases, no per-screen hooks

  return <Stack />;
}
```

---

## Common Cause 1: Mounting Heavy Subtrees During Animation

### The Symptom
The screen slides in, freezes halfway across the screen for 200ms, and drops 15+ frames.

### The Finding from `rn-perf-kit`
```
[CRITICAL] Dropped 18/25 frames during Home → ProductDetail
  72% frame drop rate during transition.
  Commit: ReviewsList (121ms commit at +1100ms).
  💡 Defer heavy component mounts until after transitionEnd.
```

### The Solution: Defer Subtrees
Never mount heavy lists, charts, or below-the-fold content while the transition animation is running.

```tsx
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export function ProductDetailScreen({ route }) {
  const [transitionDone, setTransitionDone] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      // Defer heavy mounting until the screen animation finishes
      setTransitionDone(true);
    }, [])
  );

  return (
    <View style={{ flex: 1 }}>
      {/* 1. Fast, critical header mounts immediately */}
      <ProductHeader id={route.params.id} />

      {/* 2. Heavy list deferred until animation finishes */}
      {transitionDone ? (
        <ReviewsList productId={route.params.id} />
      ) : (
        <ReviewsPlaceholder />
      )}
    </View>
  );
}
```

---

## Common Cause 2: Blurred Screens Re-rendering in the Background

### The Symptom
While viewing `ProductDetail`, actions (like adding an item to the cart) cause dropped frames, even though the current screen's UI is simple.

### The Finding from `rn-perf-kit`
```
[WARNING] Background renders on blurred screen 'Home' (cartStore.items)
  Home rendered 4 times while hidden behind ProductDetail.
  💡 Enable freezeOnBlur in screen options or narrow store selectors.
```

### The Solution: `freezeOnBlur`
Ensure blurred screens are frozen so they do not execute render work while hidden in the stack:

```tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';

<Stack.Navigator
  screenOptions={{
    // Freezes unmounted/blurred screen hierarchies (requires react-native-screens)
    freezeOnBlur: true,
  }}
>
  ...
</Stack.Navigator>
```

---

## Common Cause 3: JS Stack vs. Native Stack Transitions

In React Navigation, the JavaScript-driven `@react-navigation/stack` runs animations on the JS thread. If any React render or data parsing occurs during the transition, the animation stutters.

### Recommendation
Always use `@react-navigation/native-stack` (backed by `react-native-screens`). It executes transitions using native Android fragments and iOS view controllers, isolating animation smoothness from JS thread load.
