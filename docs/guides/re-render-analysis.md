# Eliminating Render Storms & Unstable References

React's render cycle is fast, but on budget Android devices with 2–4 GB RAM and limited CPU clocks, excessive re-renders degrade responsiveness, induce scroll stutter, and drain battery life.

This guide explains how `rn-perf-kit` classifies why components re-render, how it distinguishes between **wasted** and **genuine** renders, and how to fix common pitfalls.

---

## 1. Render Cause Classification

`rn-perf-kit` inspects fiber commits via the versioned React DevTools hook. In `deep` mode, it traverses rendered fibers using a memory-safe **iterative stack** (capped at 300 fibers per commit) that skips bailed-out subtrees where React did not render (`prev && prev.child === fiber.child`).

| Cause | Classification Criteria | Is It Wasted? |
|---|---|:---:|
| `parent-rerender` | Props shallow-equal, state unchanged, no context dependency | **YES** |
| `unstable-reference` | Same keys and shape, but reference is new (`() => {}`, `[]`, `{}`) | **YES** |
| `state-change` | Stateful hook update (`useState`, `useReducer`, `useSyncExternalStore`) | No |
| `context-change` | Component context dependency value changed | Depends |
| `store-subscription` | `useSyncExternalStore` emitted an update | Depends |
| `prop-change` | Props genuinely differ in value or key count | No |

### Accurate Hook State Diffing
React clones the internal hook linked list on every render. To avoid falsely classifying every hook-based component as a `state-change`, `rn-perf-kit` specifically compares stateful hooks that maintain an update `queue` (`h.queue != null`), accurately pinpointing actual state updates.

---

## 2. Common Pitfall: Unstable Inline Callbacks

### The Problem
Passing an inline arrow function or newly constructed object/array to a memoized child component breaks `React.memo`, forcing a full re-render every time the parent renders.

```tsx
// ❌ BAD: New function reference created on every render
<ProductCard
  item={item}
  onPress={() => navigation.navigate('Detail', { id: item.id })}
/>
```

### The Finding from `rn-perf-kit`
```
[CRITICAL] Render storm: ProductCard rendered 80x in 2s (40 renders/second)
  92% wasted renders detected.
  Unstable reference detected: onPress
  💡 Wrap with React.memo() and stabilize callbacks with useCallback().
```

### The Fix: `useCallback`
Stabilize the callback reference:

```tsx
// ✅ GOOD: Stable function reference across parent renders
const handlePress = useCallback((id: string) => {
  navigation.navigate('Detail', { id });
}, [navigation]);

<ProductCard item={item} onPress={handlePress} />
```

---

## 3. Common Pitfall: Context Fan-Out

### The Problem
Storing frequently updating state (like a shopping cart or user activity status) in a top-level React Context causes **every consumer of that context to re-render**, even if they only read a static field.

```tsx
// ❌ BAD: Modifying cart.items re-renders UserAvatar, ThemeToggle, and Feed
const AppContext = createContext<{ user: User; cart: Cart; theme: string }>(...);
```

### The Finding from `rn-perf-kit`
```
[WARNING] Fan-out: cart update caused 21 component renders
  Store: context/cart
  Components: ProductCard, ConsumerComponent_0, ConsumerComponent_1, HeaderBadge...
  💡 Split large contexts into smaller ones. Use fine-grained selectors.
```

### The Fix: Context Splitting or Zustand Selectors
Split the Context into separate providers, or switch to a selector-based store like Zustand:

```typescript
// ✅ GOOD: Only components subscribing to `items` will re-render
export const useCartStore = create((set) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
}));

// In CartBadge:
function CartBadge() {
  const itemCount = useCartStore((state) => state.items.length);
  return <Text>{itemCount}</Text>;
}
```

---

## 4. Common Pitfall: Selector Instability

### The Problem
Returning a new object or filtered array directly inside a Zustand or Redux selector causes `useSyncExternalStore` to receive a new reference on every store update:

```tsx
// ❌ BAD: [item1, item2] is a brand new array reference every time
const activeItems = useCartStore((state) => state.items.filter((i) => i.active));
```

### The Fix: `useShallow` or Memoized Selectors
```tsx
import { useShallow } from 'zustand/react/shallow';

// ✅ GOOD: Performs shallow comparison on the resulting array
const activeItems = useCartStore(
  useShallow((state) => state.items.filter((i) => i.active))
);
```

---

## 5. TanStack Query Identical Refetches

When a query refetches data from the network but receives identical payload contents, re-rendering the screen is wasteful. `rn-perf-kit/adapters` tracks queries via a `WeakMap<object, unknown>`. With TanStack Query's default `structuralSharing: true`, reference equality (`prevData === nextData`) proves the data didn't change:

```ts
import { queryPerf } from 'rn-perf-kit/adapters';

queryPerf(queryClient);
```

When an identical payload is detected, it logs `[identical-refetch]` on the timeline so the analyzer can alert you to increase `staleTime`.
