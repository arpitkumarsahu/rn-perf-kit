# rn-perf-kit API Reference

Complete reference for all components, hooks, utilities, and CLI commands provided by `rn-perf-kit`.

---

## Table of Contents
1. [`rn-perf-kit/install`](#1-rn-perf-kitinstall)
2. [`<PerfProvider>`](#2-perfprovider)
3. [`<PerfOverlay>`](#3-perfoverlay)
4. [`<PerfTrace>`](#4-perftrace)
5. [`usePerfScreen`](#5-useperfscreen)
6. [`useDiscardedRenderTracker`](#6-usediscardedrendertracker)
7. [`withNavigationPerf`](#7-withnavigationperf)
8. [`perf` Tracing Utility](#8-perf-tracing-utility)
9. [Store Adapters](#9-store-adapters)
10. [CLI Commands](#10-cli-commands)

---

## 1. `rn-perf-kit/install`

Installs the React DevTools Fiber hook before React loads. **Must be the very first line of your entry point.**

```typescript
import 'rn-perf-kit/install';
```

---

## 2. `<PerfProvider>`

Top-level context provider that configures and manages the lifecycle of the timeline, stall detectors, and fiber hooks.

```tsx
<PerfProvider
  enabled={boolean}
  mode="light" | "deep"
  budgets={BudgetConfig}
  onViolation={(violation: BudgetViolation) => void}
  deviceTier="LOW" | "MID" | "HIGH"
>
  {children}
</PerfProvider>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enables/disables all monitoring. Tree-shakeable when `false`. |
| `mode` | `'light' \| 'deep'` | `'light'` | `'light'` (<2% CPU, frames/stalls/sampled commits); `'deep'` (full fiber walk & prop diffing). |
| `budgets` | `BudgetConfig` | `undefined` | Hardware-tier aware budget thresholds. |
| `onViolation`| `(v) => void` | `undefined` | Callback fired when a budget violation is detected. |
| `deviceTier` | `'LOW' \| 'MID' \| 'HIGH'` | Auto | Overrides device tier classification for testing. |

---

## 3. `<PerfOverlay>`

Floating, on-device HUD displaying live performance statistics.

```tsx
<PerfOverlay position="top-right" disabled={false} />
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `position` | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` | `'top-right'` | Screen corner placement. |
| `disabled` | `boolean` | `false` | Hides the HUD. |

---

## 4. `<PerfTrace>`

Lightweight wrapper around React's `<Profiler>` for targeted subtree measurement.

```tsx
<PerfTrace id="ReviewsList" disabled={false}>
  <ReviewsList productId={id} />
</PerfTrace>
```

---

## 5. `usePerfScreen`

Hook for tracking screen readiness and Time-To-Content-Ready.

```tsx
const { markReady } = usePerfScreen(screenName: string);
```

- **`markReady()`**: Call when primary data and UI elements have completed loading.

---

## 6. `useDiscardedRenderTracker`

Detects interim renders that were started by Concurrent React but discarded without committing.

```tsx
useDiscardedRenderTracker(componentName: string);
```

---

## 7. `withNavigationPerf`

Wraps a React Navigation container reference to instrument routing lifecycle events.

```tsx
import { withNavigationPerf } from 'rn-perf-kit/navigation';

<NavigationContainer ref={withNavigationPerf(navigationRef)}>
  ...
</NavigationContainer>
```

---

## 8. `perf` Tracing Utility

Manual tracing API for custom asynchronous or synchronous tasks:

```typescript
import { perf } from 'rn-perf-kit';

const trace = perf.start('parse-catalog', { items: 1000 });
// ... work ...
trace.end({ success: true });

// Instant timestamp mark
perf.mark('checkpoint-reached');
```

---

## 9. Store Adapters

Import from `rn-perf-kit/adapters`:

```typescript
import {
  reduxPerfMiddleware,
  zustandPerf,
  queryPerf,
  installFetchInterceptor
} from 'rn-perf-kit/adapters';
```

- **`reduxPerfMiddleware`**: Dispatches Redux action types to timeline.
- **`zustandPerf(name, creator)`**: Records changed store keys.
- **`queryPerf(queryClient)`**: Subscribes to TanStack QueryCache and flags identical refetches.
- **`installFetchInterceptor()`**: Intercepts `global.fetch` with automatic URL parameter redaction.

---

## 10. CLI Commands

Executed via `npx rn-perf` or `node packages/cli/dist/cli.js`:

```bash
# 1. Compare two session reports
rn-perf compare base.json pr.json

# 2. Check a session against performance budgets (exits 1 on critical violation)
rn-perf check --budgets perf.config.ts --report session.json

# 3. Generate interactive HTML performance report
rn-perf html session.json --output report.html
```
