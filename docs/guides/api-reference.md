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
7. [Navigation Hooks & Adapters](#7-navigation-hooks--adapters)
8. [`perf` Tracing Utility](#8-perf-tracing-utility)
9. [Store & Network Adapters](#9-store--network-adapters)
10. [Analyzers & Session Reports](#10-analyzers--session-reports)
11. [CLI Commands](#11-cli-commands)

---

## 1. `rn-perf-kit/install`

Installs the React DevTools Fiber hook before React initializes. **Must be the very first import in your application entry point.**

```typescript
import 'rn-perf-kit/install';
```

---

## 2. `<PerfProvider>`

Top-level context provider that manages timeline lifecycle, high-precision clock synchronization, frame listeners, and budget monitoring.

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
| `enabled` | `boolean` | `false` | Enables/disables all collectors. When `false`, the timeline stays dormant with 0 CPU overhead. |
| `mode` | `'light' \| 'deep'` | `'light'` | `'light'` (<2% CPU, frames/stalls/sampled commits); `'deep'` (bounded iterative fiber walking & prop diffing). |
| `budgets` | `BudgetConfig` | `undefined` | Hardware-tier aware budget thresholds. |
| `onViolation`| `(v) => void` | `undefined` | Callback fired when a budget violation is detected. |
| `deviceTier` | `'LOW' \| 'MID' \| 'HIGH'` | Auto | Overrides device hardware classification. |

---

## 3. `<PerfOverlay>`

Floating, on-device HUD displaying live JS FPS (via `requestAnimationFrame`), UI FPS (via native hardware frame emitter), JS thread stalls, and the active route.

```tsx
<PerfOverlay
  position="top-right"
  disabled={false}
  insets={{ top: 48, bottom: 34 }}
/>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `position` | `'top-right' \| 'top-left' \| 'bottom-right' \| 'bottom-left'` | `'top-right'` | Screen corner placement. |
| `disabled` | `boolean` | `false` | Hides HUD and halts all internal timers and animation frame loops. |
| `insets` | `{ top: number; bottom: number }` | Auto | Safe area insets (pass `useSafeAreaInsets()` from `react-native-safe-area-context`). Defaults to `StatusBar.currentHeight`. |

**UI FPS** is the refresh rate minus the rate of dropped frames, so an idle screen reads full FPS on both platforms (Android only reports frames it actually draws; iOS reports every vsync).

**The HUD does not measure itself.** Its own re-renders are excluded from commits, render causes and findings. To exclude your own debug UI the same way, set `MyDebugPanel.__rnPerfKitIgnore = true` (works through `memo()` and `forwardRef()`).

---

## 4. `<PerfTrace>`

Lightweight wrapper around React's `<Profiler>` for targeted subtree measurement. Each render of the subtree is recorded as a `trace` event named by `id` (shown as `trace:<id>` in Perfetto); it is not counted as an extra commit. Requires a dev or profiling build.

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

- **`markReady()`**: Call when primary data and UI elements have completed loading. Dispatches a `screen:ready:<screenName>` mark on the timeline.

---

## 6. `useDiscardedRenderTracker`

Detects renders started by Concurrent React that were discarded before committing to screen.

```tsx
useDiscardedRenderTracker(componentName: string);
```

---

## 7. Navigation Hooks & Adapters

### `withNavigationPerf(ref)` (React Navigation)
Wraps a `useRef` pointing to `NavigationContainer`. Returns a cached callback ref that automatically binds listeners when the container mounts:

```tsx
import { withNavigationPerf } from 'rn-perf-kit/navigation';

const navigationRef = useRef(null);
<NavigationContainer ref={withNavigationPerf(navigationRef)}>
```

### `useExpoRouterPerf()` (Expo Router)
Hook for Expo Router applications. Automatically attaches listeners to Expo Router's navigation container:

```tsx
// app/_layout.tsx
import { useExpoRouterPerf } from 'rn-perf-kit/expo-router';

export default function RootLayout() {
  useExpoRouterPerf();
  return <Stack />;
}
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

## 9. Store & Network Adapters

Import from `rn-perf-kit/adapters`:

```typescript
import {
  installNetworkInterceptor,
  uninstallNetworkInterceptor,
  reduxPerfMiddleware,
  zustandPerf,
  queryPerf,
} from 'rn-perf-kit/adapters';
```

- **`installNetworkInterceptor()`**: Unified `XMLHttpRequest` interceptor covering both `axios` and `fetch`. Records response size, and redacts query strings and id-like path segments (long numbers, UUIDs, tokens, emails become `:id`). `redactUrl(url)` is exported.
- **`uninstallNetworkInterceptor()`**: Safely removes network hooks if no newer wrapper is layered on top.
- **`reduxPerfMiddleware`**: Dispatches Redux action types to timeline.
- **`zustandPerf(name, creator)`**: Records changed store keys. Supports `set(state, true)` (replace).
- **`queryPerf(queryClient, { formatKey? })`**: Subscribes to TanStack QueryCache, flagging identical refetches with `[identical-refetch]`. Keys are recorded as `first-segment(+N)` by default because they often contain user data; pass `formatKey: (q) => q.queryHash` to record full keys.

---

## 10. Analyzers & Session Reports

Import from `rn-perf-kit`:

```typescript
import {
  generateJsonReport,
  generatePerfettoTrace,
  getDeviceReportInfo,
  analyzeNavigation,
  analyzeRenderCauses,
  analyzeFrameAttribution,
  analyzeCascades,
} from 'rn-perf-kit';
```

- **`generateJsonReport(options)`**: Generates complete session JSON and automatically populates `findings` using all 4 analyzers.
- **`generatePerfettoTrace()`**: Exports timeline events in Perfetto / Chrome Trace Event Format for viewing in `ui.perfetto.dev`.
- **`getDeviceReportInfo()`**: Helper retrieving classified tier, OS, and hardware metrics from native telemetry.

---

## 11. CLI Commands

Executed via `npx rn-perf` or `node packages/cli/dist/cli.js`:

```bash
# 1. Compare two session reports (exits 1 on new findings or a jank regression)
rn-perf compare base.json pr.json [--max-jank-increase 2] [--report-only]

# 2. Apply perf.config budgets to a session (exits 1 on any violation or critical finding)
rn-perf check --budgets perf.config.ts --report session.json

# 3. Generate interactive HTML performance report
rn-perf html session.json --output report.html
```
