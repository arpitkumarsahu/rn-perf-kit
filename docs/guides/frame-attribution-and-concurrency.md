# Interrupted Renders, Cascades & Frame Attribution

In React Native's New Architecture (Fabric + Concurrent React), performance issues are not limited to long JavaScript renders. Work can be **interrupted, thrown away, or triggered synchronously before paint**, competing with native drawing.

This guide explains how `rn-perf-kit` detects discarded renders, cascading effect chains, and attributes dropped frames to JS vs. native-side bottlenecks.

---

## 1. Discarded Renders in Concurrent React

### How It Works
With features like `startTransition`, `useDeferredValue`, and Suspense, React can start rendering a component tree, yield execution to a higher-priority task (like user input), and **discard the previous render work without committing it to the screen**.

While this prevents input lag, on low-end multi-core devices it burns valuable CPU cycles.

```
Keystroke 1 ──► Render SearchResults (interrupted!) ──► DISCARDED
Keystroke 2 ──► Render SearchResults (interrupted!) ──► DISCARDED
Keystroke 3 ──► Render SearchResults (committed)   ──► PAINT
```

### How `rn-perf-kit` Detects It
`rn-perf-kit` registers a token during the component's render phase and checks for its resolution in `useLayoutEffect` (which only runs if committed). Stale tokens that never commit are recorded as discarded renders.

### The Finding from `rn-perf-kit`
```
[WARNING] SearchResults: 4 discarded renders
  React started 4 renders of SearchResults that were discarded without committing.
  💡 Check for expensive operations or heavy subtrees inside startTransition.
```

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

When Android `FrameMetrics` or iOS `CADisplayLink` reports that a frame took > 16.6ms (at 60 Hz), `rn-perf-kit` checks the timeline for overlapping JS thread activity:

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
