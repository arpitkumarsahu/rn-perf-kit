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
| **Tap → Dispatch** | Time between touch event and navigation action trigger | Intercepts `__unsafe_action__` on `navigationRef` |
| **Dispatch → First Commit** | Time taken for React to mount the root container of the new route | Fiber commit hook detects first commit containing new route |
| **Transition Start → End** | The native/JS slide or fade animation duration | Screen focus / transition listeners (`transitionStart`, `transitionEnd`) |
| **Content Ready** | When primary data/UI has loaded | Triggered when `markReady()` is called from `usePerfScreen` |
| **Interactive** | Screen is stable with no frames dropped or JS stalls for 300ms | Timeline analyzer evaluates frame rate & stall sentinel |

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
