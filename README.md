# rn-perf-kit

[![npm version](https://img.shields.io/npm/v/rn-perf-kit.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/rn-perf-kit)
[![npm downloads](https://img.shields.io/npm/dm/rn-perf-kit.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/rn-perf-kit)
[![CI](https://github.com/arpitkumarsahu/rn-perf-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/arpitkumarsahu/rn-perf-kit/actions)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-0284c7?style=flat-square)](https://arpitkumarsahu.github.io/rn-perf-kit/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
![Platforms](https://img.shields.io/badge/Platforms-Android%20%7C%20iOS%20%7C%20Expo-61DAFB?style=flat-square)

> A drop-in performance profiling toolkit for React Native apps — tells you **what** is slow, **why**, and **what to change**. Focused on budget Android devices.

🌐 **Documentation Site**: [arpitkumarsahu.github.io/rn-perf-kit](https://arpitkumarsahu.github.io/rn-perf-kit/)  
📦 **NPM Registry**: [npmjs.com/package/rn-perf-kit](https://www.npmjs.com/package/rn-perf-kit)  
🐙 **GitHub Repository**: [github.com/arpitkumarsahu/rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit)  
📖 **Guides & Docs**: [Documentation Suite](./docs/README.md)  
🧪 **Demo App**: [JankLab Playground](./example/README.md)

---

## Why?

React Native apps often feel smooth on a developer's flagship phone, then lag and stutter on the budget Android devices many real users have. When this happens, developers struggle to answer basic questions:

- Is **navigation** slow? Which phase: tap, mount, transition, or data loading?
- Which **data changes** cause **re-renders**, and how many are wasted?
- Are **render cycles being interrupted, discarded, or cascading** — and are they **blocking frames**?

**rn-perf-kit** collects signals from both the JavaScript side (React commits, navigation, state stores, network) and the native side (frame timing, memory, thermal state) onto **one synchronized timeline**, then runs **analyzers** that produce plain-language findings like:

> "Home → ProductDetail dropped 18 of 25 frames during the transition because `ReviewsList` mounted during the animation (121 ms commit), triggered by the React Query update `['reviews', id]`. Defer it until `transitionEnd`."

---

## Features

- 📍 **Navigation profiling** — phase-by-phase breakdown: tap → dispatch → first commit → transition start/end → content ready → interactive, recorded automatically from the navigation container (React Navigation 7 / Expo Router)
- 🔁 **Re-render analysis** — wasted renders, unstable props, store fan-outs, selector instability (`deep` mode)
- ⚡ **Interruption detection** — cascading updates, long commits, Suspense thrash (`deep` mode), discarded renders (`useDiscardedRenderTracker`)
- 🖥️ **Frame attribution** — every dropped frame linked to a JS cause, or labeled native-side
- 📱 **Device-tier-aware** — LOW / MID / HIGH classification with tier-specific budgets
- 🔧 **Low overhead** — light mode runs in QA/release builds at under 2% CPU
- 📊 **Multiple outputs** — in-app overlay, JSON, Perfetto/Chrome trace, CLI for CI

---

## Quick Start

Install the package from npm:

```sh
# npm
npm install rn-perf-kit

# pnpm
pnpm add rn-perf-kit

# yarn
yarn add rn-perf-kit
```

### 1. Register the Fiber hook

```tsx
// index.js — MUST be line 1 before react or react-native
import 'rn-perf-kit/install';
```

**Expo Router apps** have no `index.js` by default (`"main": "expo-router/entry"`), and `app/_layout.tsx` loads *after* React. Add a two-line entry file and point `main` at it:

```js
// index.js
import 'rn-perf-kit/install';
import 'expo-router/entry';
```

```json
// package.json
"main": "index.js"
```

In debug builds React Native pre-installs the DevTools hook, so rn-perf-kit can attach to it from anywhere. **Release and QA builds have no such hook**: if `rn-perf-kit/install` isn't the first import, React never reports commits and render data stays empty.

### 2. Wrap your app

#### Standard React Navigation:
```tsx
// App.tsx
import React, { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { PerfProvider, PerfOverlay } from 'rn-perf-kit';
import { withNavigationPerf } from 'rn-perf-kit/navigation';

export default function App() {
  const navigationRef = useRef(null);

  return (
    <PerfProvider
      enabled={__DEV__ || Boolean(process.env.IS_QA_BUILD)}
      mode="light" // or "deep" for detailed prop diffing
      budgets={{
        startup: { LOW: 3000, MID: 2000, HIGH: 1500 },
        screens: { Home: 800, ProductDetail: 600 },
        minFps: 55,
      }}
      onViolation={(v) => console.warn('[perf]', v)}
    >
      <NavigationContainer ref={withNavigationPerf(navigationRef)}>
        <RootStack />
      </NavigationContainer>

      {/* Floating HUD showing live JS/UI FPS, stalls, and active screen */}
      <PerfOverlay position="top-right" />
    </PerfProvider>
  );
}
```

#### Expo Router:
```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PerfProvider, PerfOverlay } from 'rn-perf-kit';
import { useExpoRouterPerf } from 'rn-perf-kit/expo-router';

function AppLayout() {
  useExpoRouterPerf(); // Automatically attaches listeners to Expo Router container

  return <Stack />;
}

export default function Root() {
  return (
    <PerfProvider enabled={__DEV__}>
      <AppLayout />
      <PerfOverlay position="top-right" insets={useSafeAreaInsets()} />
    </PerfProvider>
  );
}
```

`useExpoRouterPerf()` / `withNavigationPerf()` record every navigation phase from the container; no per-screen hook is needed. Stack navigators report transition start/end; tabs and drawers have no transition, so their navigations end at `interactive` (no React commits for 250 ms). On React Navigation 6, add `useNavigationPerf()` to screens to get transition timings.

Remember the `index.js` entry from step 1 — `import 'rn-perf-kit/install'` at the top of `_layout.tsx` is too late for release builds.

### 3. Mark screen readiness

```tsx
import { usePerfScreen, PerfTrace } from 'rn-perf-kit';

function HomeScreen() {
  // Use the route name, so this also becomes the navigation's "content ready" phase
  const { markReady } = usePerfScreen('Home');
  const { data } = useFeed();

  useEffect(() => {
    if (data) markReady(); // Records time to content ready
  }, [data]);

  return (
    <PerfTrace id="FeedList">
      <FeedList data={data} />
    </PerfTrace>
  );
}
```

### 4. Store adapters

```ts
import { reduxPerfMiddleware, zustandPerf, queryPerf } from 'rn-perf-kit/adapters';

// Redux
const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().concat(reduxPerfMiddleware),
});

// Zustand
const useCart = create(zustandPerf('cart', (set) => ({ items: [] })));

// TanStack Query. Keys are recorded as 'portfolio(+2)' by default: query keys often
// hold user data (ids, phone numbers). Pass { formatKey: (q) => q.queryHash } for full keys.
queryPerf(queryClient);
```

Network requests are recorded automatically. Query strings and id-like path segments (long numbers, UUIDs, tokens, emails) are replaced before they reach the timeline: `/users/9876543210/orders?x=1` → `/users/:id/orders?[redacted]`.

### 5. Custom traces

```ts
import { perf } from 'rn-perf-kit';

const t = perf.start('parse-catalog');
parseCatalog(json);
t.end(); // appears as a slice in the JSON report and the Perfetto trace
```

### Budgets: what each one measures

| Budget | Measured as | Needs |
|---|---|---|
| `startup` | Process start → the first `usePerfScreen().markReady()` | `markReady()` on your first screen |
| `screens[name]` | Screen mount → its `markReady()` | `usePerfScreen(name)` |
| `navigation['From→To']` | Tap (or dispatch) → interactive | Navigation listeners (step 2) |
| `minFps` | UI fps per second that drew frames (idle seconds are skipped) | Native module |
| `droppedFramesPct` | Dropped frames ÷ refresh rate, per active second | Native module |
| `maxCommitDuration` | Each React commit's duration | Dev or profiling build |

Budgets are values or `{ LOW, MID, HIGH }` by device tier. Violations go to `onViolation` in the app, and `rn-perf check` applies the same budgets to a saved session in CI.

---

## Packages (Monorepo)

Published packages on npm under the [`@rn-perf-kit`](https://www.npmjs.com/org/rn-perf-kit) organization:

| Package | Version / Registry Link | Source Path | Description |
|---|---|---|---|
| **`rn-perf-kit`** | [![npm](https://img.shields.io/npm/v/rn-perf-kit.svg?style=flat-square)](https://www.npmjs.com/package/rn-perf-kit) | [`packages/perf-provider`](./packages/perf-provider) | Main drop-in package: `<PerfProvider>`, `<PerfOverlay>`, `/install`, `/navigation`, `/adapters` |
| **`@rn-perf-kit/core`** | [![npm](https://img.shields.io/npm/v/@rn-perf-kit/core.svg?style=flat-square)](https://www.npmjs.com/package/@rn-perf-kit/core) | [`packages/core`](./packages/core) | Timeline, ring buffer, event model, monotonic clock sync, tier budgets |
| **`@rn-perf-kit/native`** | [![npm](https://img.shields.io/npm/v/@rn-perf-kit/native.svg?style=flat-square)](https://www.npmjs.com/package/@rn-perf-kit/native) | [`packages/native`](./packages/native) | TurboModule: `nativeNow()`, AndroidX FrameMetrics, iOS CADisplayLink, memory, thermal, device tier |
| **`@rn-perf-kit/react`** | [![npm](https://img.shields.io/npm/v/@rn-perf-kit/react.svg?style=flat-square)](https://www.npmjs.com/package/@rn-perf-kit/react) | [`packages/react`](./packages/react) | Versioned fiber hook adapter (`__REACT_DEVTOOLS_GLOBAL_HOOK__`), `<PerfTrace>`, `usePerfScreen` |
| **`@rn-perf-kit/navigation`** | [![npm](https://img.shields.io/npm/v/@rn-perf-kit/navigation.svg?style=flat-square)](https://www.npmjs.com/package/@rn-perf-kit/navigation) | [`packages/navigation`](./packages/navigation) | 6-phase React Navigation + Expo Router adapter (`withNavigationPerf`) |
| **`@rn-perf-kit/adapters`** | [![npm](https://img.shields.io/npm/v/@rn-perf-kit/adapters.svg?style=flat-square)](https://www.npmjs.com/package/@rn-perf-kit/adapters) | [`packages/adapters`](./packages/adapters) | Middleware for Redux Toolkit, Zustand, TanStack Query, and fetch/XHR interceptor |
| **`@rn-perf-kit/analyzers`** | [![npm](https://img.shields.io/npm/v/@rn-perf-kit/analyzers.svg?style=flat-square)](https://www.npmjs.com/package/@rn-perf-kit/analyzers) | [`packages/analyzers`](./packages/analyzers) | Navigation drop-rate, render storm/fan-out, cascade, and frame attribution analyzers |
| **`@rn-perf-kit/overlay`** | [![npm](https://img.shields.io/npm/v/@rn-perf-kit/overlay.svg?style=flat-square)](https://www.npmjs.com/package/@rn-perf-kit/overlay) | [`packages/overlay`](./packages/overlay) | In-app 2 Hz floating performance HUD overlay (`PerfOverlay`) |
| **`@rn-perf-kit/reporters`** | [![npm](https://img.shields.io/npm/v/@rn-perf-kit/reporters.svg?style=flat-square)](https://www.npmjs.com/package/@rn-perf-kit/reporters) | [`packages/reporters`](./packages/reporters) | JSON session exporter, Perfetto/Chrome trace exporter, standalone HTML report generator |
| **`@rn-perf-kit/cli`** | [![npm](https://img.shields.io/npm/v/@rn-perf-kit/cli.svg?style=flat-square)](https://www.npmjs.com/package/@rn-perf-kit/cli) | [`packages/cli`](./packages/cli) | CLI binary (`rn-perf`): `compare`, `check` (CI budgets), and `html` report generation |

---

## CLI & CI Integration

```sh
# Compare PR session against baseline. Exits 1 on new critical/warning findings or if
# jank % rises by more than --max-jank-increase points (default 2). --report-only never fails.
rn-perf compare base-session.json pr-session.json

# Apply the budgets in perf.config.ts (.ts, .js or .json) to a session.
# Exits 1 on any budget violation or critical finding.
rn-perf check --budgets perf.config.ts --report session.json

# Generate a standalone HTML dashboard
rn-perf html session.json --output report.html
```

A session file is the JSON from `serializeReport(generateJsonReport({ device: getDeviceReportInfo() }))` (all exported from `rn-perf-kit`), saved or uploaded by your app or test run.

---

## Documentation Guides

- [**Getting Started**](./docs/getting-started.md) — 5-minute setup in bare React Native and Expo apps
- [**Diagnosing & Fixing Navigation Jank**](./docs/guides/navigation-profiling.md) — 6-phase breakdown and mount deferral
- [**Eliminating Render Storms & Wasted Re-renders**](./docs/guides/re-render-analysis.md) — Causes, unstable hooks, and selector leaks
- [**Interrupted Renders & Frame Attribution**](./docs/guides/frame-attribution-and-concurrency.md) — Discarded renders and layout effect cascades
- [**CI Performance Budgets & Regressions**](./docs/guides/ci-performance-budgets.md) — Automated PR enforcement with GitHub Actions
- [**Full API Reference**](./docs/guides/api-reference.md) — Complete parameter and hook reference

---

## Modes

| Mode | Overhead | Use case |
|---|---|---|
| `disabled` | Zero (dormant timeline, 0 events recorded) | Production builds |
| `light` | < 1–2% CPU | QA, dogfood, internal releases |
| `deep` | Measurable, time-boxed | Local dev, targeted debugging. Needed for render causes, wasted renders, selector instability and Suspense thrash |

### Production Recommendation
While `<PerfProvider enabled={false}>` keeps all hooks dormant, in production builds you can bypass importing:
```tsx
const Perf = __DEV__ || process.env.EXPO_PUBLIC_PERF === '1' ? require('rn-perf-kit') : null;
```

For QA profiling builds, render timing (`PerfTrace`, commit durations) requires a dev or profiling build of React Native. For Expo and React Native, you can alias to React Fabric's profiling bundle:
```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

if (process.env.PERF_PROFILING === '1') {
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const name = moduleName.endsWith('/ReactFabric-prod')
      ? moduleName.replace(/-prod$/, '-profiling')
      : moduleName;
    return (upstream ?? context.resolveRequest)(context, name, platform);
  };
}
module.exports = config;
```

---

## Requirements

- React Native 0.76+ (New Architecture enabled)
- React 18.3+ or React 19+
- Android API 24+ (AndroidX JankStats & FrameMetrics support)
- iOS 13.4+ (`CADisplayLink`, `NSProcessInfo.thermalState`)
- Expo SDK 52+ / 53+ (Autolinked automatically without extra plugins)

---

## License

[MIT](./LICENSE) © [Arpit Kumar Sahu](https://github.com/arpitkumarsahu)
