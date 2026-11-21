# Interrupted Renders, Cascades & Frame Attribution

In React Native's New Architecture (Fabric + Concurrent React), performance issues are not limited to long JavaScript renders. Work can be **interrupted, thrown away, or triggered synchronously before paint**, competing with native drawing.

This guide explains how `rn-perf-kit` detects discarded renders, cascading effect chains, and attributes dropped frames to JS vs. native-side bottlenecks.

---

## 1. Discarded Renders in Concurrent React

### How It Works
With features like `startTransition`, `useDeferredValue`, and Suspense, React can start rendering a component tree, yield execution to a higher-priority task (like user input), and **discard the previous render work without committing it to the screen**.

While this prevents input lag, on low-end multi-core devices it burns valuable CPU cycles:

```
Keystroke 1 ──► Render SearchResults (interrupted!) ──► DISCARDED
Keystroke 2 ──► Render SearchResults (interrupted!) ──► DISCARDED
Keystroke 3 ──► Render SearchResults (committed)   ──► PAINT
```

### How `rn-perf-kit` Detects It
`rn-perf-kit` provides `useDiscardedRenderTracker(componentName)`:
1. Each render generates an incremental token recorded in a pending map.
2. If the render commits to screen, its layout effect immediately resolves and removes the token.
3. If the render was interrupted or discarded, its token remains unresolved. A low-overhead 200ms sweep aggregates stale tokens by component name and automatically halts once no pending tokens remain.

```tsx
import { useDiscardedRenderTracker } from 'rn-perf-kit';

export function SearchResults({ query }) {
  useDiscardedRenderTracker('SearchResults');
  // ... render ...
}
```

> **Note on React StrictMode:** In development builds, React StrictMode renders components twice and commits once, which creates one artificial discard. `rn-perf-kit` suppresses duplicate pairs under 2ms.

---

## 2. Cascading Updates (`useLayoutEffect` vs `useEffect`)

### Synchronous Nested Commits (`useLayoutEffect`)
Calling `setState` inside `useLayoutEffect` forces React to run a second, synchronous re-render **before the browser/native paint occurs**:

```tsx
// ❌ BAD: Forces an immediate synchronous second commit
useLayoutEffect(() => {
  setTitle(`Product ${productId}`);
}, [productId]);
```

`rn-perf-kit` flags this as `phase: 'nested-update'`.

### The Finding from `rn-perf-kit`
```
[WARNING] Cascading update detected (setState in useLayoutEffect)
  Two commits within 8.0ms. Second commit is nested-update.
  💡 Move state update to useEffect or derive value during render instead.
```

### The Solution: Derive During Render
If a value can be derived from props or state, compute it directly during render without calling `setState`:

```tsx
// ✅ GOOD: Zero extra commit overhead
const title = `Product ${productId}`;
```

---

## 3. Frame Attribution (JS vs. Native-Side Jank)

### High-Precision Monotonic Clock Synchronization
To correlate native frame drops with JavaScript commits, both runtimes must share a precise time reference:
- **Android**: Collects hardware frame metrics via **AndroidX JankStats** on the `System.nanoTime()` clock.
- **iOS**: Samples display refresh via **`CADisplayLink`** on the `CACurrentMediaTime()` clock.
- **Clock Sync Engine**: `perfClock` establishes monotonic offset alignment upon app initialization, converting native frame timestamps to the JavaScript timeline.

```
Timeline:
[ Frame #812 (94ms) ───────────────────────────── ]
    └── [ Commit: ReviewsList (88ms) ]  <-- JS Caused!
```

If a janky frame has **no overlapping JS commit, stall, or GC event**, `rn-perf-kit` classifies it as **`native-side` jank**.

### Typical Causes of Native-Side Jank:
1. **Large Image Decoding:** Loading unscaled 4K images into small 80x80 thumbnails on the UI thread.
2. **Deep Layout Hierarchies:** Over-nested `View` hierarchies causing costly measure/layout passes in Yoga.
3. **Overdraw:** Multiple opaque full-screen backgrounds drawn on top of each other.
