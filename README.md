# rn-perf-kit

> A drop-in performance profiling toolkit for React Native apps — tells you **what** is slow, **why**, and **what to change**. Focused on low-end Android devices.

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

- 📍 **Navigation profiling** — phase-by-phase breakdown: tap → dispatch → first commit → transition → content ready → interactive
- 🔁 **Re-render analysis** — detects wasted renders, unstable references, fan-outs, selector instability
- ⚡ **Interruption detection** — discarded renders, cascading updates, Suspense thrash, long commits
- 🖥️ **Frame attribution** — every dropped frame linked to a JS cause, or labeled native-side
- 📱 **Device-tier-aware** — LOW / MID / HIGH classification with tier-specific budgets
- 🔧 **Low overhead** — light mode runs in QA/release builds at under 2% CPU
- 📊 **Multiple outputs** — in-app overlay, JSON, Perfetto/Chrome trace, CLI for CI

---

## Quick Start

```sh
npm install rn-perf-kit
# or
yarn add rn-perf-kit
```

```tsx
// index.js — must be the FIRST import
import 'rn-perf-kit/install';

// App.tsx
import { PerfProvider, PerfOverlay } from 'rn-perf-kit';
import { withNavigationPerf } from 'rn-perf-kit/navigation';

export default function App() {
  return (
    <PerfProvider
      enabled={__DEV__ || isQABuild}
      mode="light" // or "deep"
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
      <PerfOverlay position="top-right" />
    </PerfProvider>
  );
}
```

### Mark a screen ready

```tsx
import { usePerfScreen, PerfTrace } from 'rn-perf-kit';

function HomeScreen() {
  const { markReady } = usePerfScreen('Home');
  const { data } = useFeed();

  useEffect(() => { if (data) markReady(); }, [data]);

  return (
    <PerfTrace id="FeedList">
      <FeedList data={data} />
    </PerfTrace>
  );
}
```

### Store adapters

```ts
import { reduxPerfMiddleware, zustandPerf, queryPerf } from 'rn-perf-kit/adapters';

const store = configureStore({ reducer, middleware: (g) => g().concat(reduxPerfMiddleware) });
const useCart = create(zustandPerf('cart', (set) => ({ /* ... */ })));
queryPerf(queryClient);
```

### Custom traces

```ts
import { perf } from 'rn-perf-kit';

const t = perf.start('parse-catalog');
parseCatalog(json);
t.end();
```

---

## Packages (Monorepo)

| Package | Description |
|---|---|
| `core` | Timeline, ring buffer, event types, clock sync, budgets |
| `native` | TurboModule: `nativeNow()`, FrameMetrics, CADisplayLink, memory, thermal, device tier |
| `react` | Versioned fiber hook adapter, `<PerfTrace>`, render/commit tracker |
| `navigation` | React Navigation + Expo Router adapter |
| `adapters` | Redux, Zustand, TanStack Query, fetch/XHR |
| `analyzers` | Navigation, render-cause, cascade/interruption, frame attribution, memory |
| `overlay` | In-app HUD |
| `reporters` | JSON, Perfetto/Chrome trace |
| `cli` | `compare`, `check`, HTML report |

---

## CLI / CI

```sh
# Compare two sessions
rn-perf compare base.json pr.json

# Check against budgets (non-zero exit on violations)
rn-perf check --budgets perf.config.ts
```

---

## Modes

| Mode | Overhead | Use case |
|---|---|---|
| `disabled` | Zero (tree-shakeable) | Production (default off) |
| `light` | < 1–2% CPU | QA, release builds |
| `deep` | Measurable, time-boxed | Dev, recorded sessions |

---

## Roadmap

| Version | Contents |
|---|---|
| v0.1 | Foundation: frames, stalls, FPS overlay, JSON export |
| v0.2 | Navigation phase profiling |
| v0.3 | Re-render engine + store adapters |
| v0.4 | Interruptions + frame attribution |
| v0.5 | Low-end device focus + CI pipeline |
| v1.0 | iOS parity + production sampling mode |

---

## Requirements

- React Native 0.73+
- New Architecture (Fabric + TurboModules) recommended
- Android API 24+ for full FrameMetrics support
- Expo SDK 50+ (config plugin included)

---

## License

MIT
