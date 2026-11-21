import os
import shutil

# 1. perf-provider gets the full root README.md
shutil.copy("README.md", "packages/perf-provider/README.md")
print("Wrote packages/perf-provider/README.md")

# 2. Write package specific READMEs
PACKAGE_READMES = {
  "core": """# @rn-perf-kit/core

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/core.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Core timeline, high-throughput ring buffer, unified event model, monotonic clock synchronization, and tier-aware budget engine for **rn-perf-kit**.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Installation

```sh
npm install @rn-perf-kit/core
```

## Features

- **Timeline & RingBuffer**: Pre-allocated fixed-capacity buffer that records up to 10,000 events with zero GC pressure on the hot path.
- **Monotonic Clock Sync**: Math that maps native nanosecond timestamps (from Android Choreographer and iOS CADisplayLink) onto JavaScript `performance.now()` with sub-millisecond precision.
- **Unified Event Model**: Typed unions covering renders, commits, frame metrics, stalls, layout effects, store actions, network requests, and route changes.
- **Budget Engine**: Evaluates metrics against hardware capability tiers (`LOW`, `MID`, `HIGH`).

## Documentation

Full guides and API reference are available at [github.com/arpitkumarsahu/rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit#readme).
""",

  "native": """# @rn-perf-kit/native

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/native.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/native)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Native TurboModule bridge for **rn-perf-kit**: frame timing, memory sampling, thermal state, and device tier classification.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Installation

```sh
npm install @rn-perf-kit/native
```

### Expo Config Plugin
In `app.json`:
```json
{
  "expo": {
    "plugins": ["@rn-perf-kit/native"]
  }
}
```

## Platform Architecture

- **Android**: Implements AndroidX `JankStats` and `Window.OnFrameMetricsAvailableListener` on API 24+ for frame-by-frame breakdown (UI duration, layout, draw, vsync delay).
- **iOS**: Uses `CADisplayLink` timestamp tracking, `mach_task_basic_info` memory stats, and `NSProcessInfo.thermalState`.
- **Hardware Tiering**: Automatically classifies device into `LOW`, `MID`, or `HIGH` based on RAM and CPU core count.
""",

  "react": """# @rn-perf-kit/react

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/react.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> React fiber hook adapter, `<PerfTrace>` component, and render/commit tracker for **rn-perf-kit**.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Installation

```sh
npm install @rn-perf-kit/react
```

## Key APIs

- **`installFiberHook()`**: Connects to `__REACT_DEVTOOLS_GLOBAL_HOOK__` on application launch.
- **`<PerfTrace id="...">`**: Wraps suspect subtrees to measure render duration and wasted renders.
- **`usePerfScreen(name)`**: Marks time-to-content-ready (`markReady()`).
- **`useDiscardedRenderTracker()`**: Detects aborted/interrupted renders during Concurrent Mode transitions.
""",

  "navigation": """# @rn-perf-kit/navigation

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/navigation.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/navigation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> 6-phase React Navigation and Expo Router performance instrumentation for **rn-perf-kit**.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Installation

```sh
npm install @rn-perf-kit/navigation
```

## Navigation Lifecycle Phases

Instruments the full 6-phase navigation timeline:
`tap` -> `dispatch` -> `first-commit` -> `transition-start` -> `transition-end` -> `content-ready` -> `interactive`

## Usage

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { withNavigationPerf } from '@rn-perf-kit/navigation';

export function App() {
  const navRef = useRef(null);
  return (
    <NavigationContainer ref={withNavigationPerf(navRef)}>
      {/* ... */}
    </NavigationContainer>
  );
}
```
""",

  "adapters": """# @rn-perf-kit/adapters

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/adapters.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/adapters)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Store and network performance adapters for **rn-perf-kit**: Redux Toolkit, Zustand, TanStack Query, and fetch/XHR.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Installation

```sh
npm install @rn-perf-kit/adapters
```

## Features

- **Redux Middleware**: Captures action types, dispatch timestamp, and execution duration.
- **Zustand Wrapper**: Tracks state slice mutations.
- **TanStack Query Plugin**: Records query cache events and data arrivals.
- **Fetch/XHR Interceptor**: Measures request latency with automatic PII / query-param redaction.
""",

  "analyzers": """# @rn-perf-kit/analyzers

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/analyzers.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/analyzers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Intelligent performance correlation analyzers for **rn-perf-kit**: navigation drop rates, render storms, and frame attribution.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Key Analyzers

1. **Navigation Analyzer**: Identifies heavy components mounting during screen transition animations.
2. **Render Cause Analyzer**: Flags render storms (>30 renders/sec) and wide fan-outs (>15 components).
3. **Frame Attribution Analyzer**: Directly links dropped UI frames to long JS commits vs. native GPU stalls.
4. **Cascade Analyzer**: Catches nested `setState` calls inside `useLayoutEffect` and discarded Concurrent renders.
""",

  "overlay": """# @rn-perf-kit/overlay

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/overlay.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/overlay)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> In-app floating performance HUD overlay for **rn-perf-kit** apps.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Usage

```tsx
import { PerfOverlay } from '@rn-perf-kit/overlay';

<PerfOverlay position="top-right" />
```

- Throttled to **2 Hz** to keep overhead < 0.5% CPU.
- Displays live UI FPS, JS FPS, long commits, stalls, and active screen.
""",

  "reporters": """# @rn-perf-kit/reporters

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/reporters.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/reporters)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Session exporters for **rn-perf-kit**: JSON serializer, Perfetto/Chrome Trace Event exporter, and standalone HTML dashboard generator.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Usage

```ts
import { exportJsonSession, exportPerfettoTrace, generateHtmlReport } from '@rn-perf-kit/reporters';
```
""",

  "cli": """# @rn-perf-kit/cli

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/cli.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> CLI tool for **rn-perf-kit**: compare profiling sessions, check budgets in CI, and generate interactive HTML dashboards.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Installation

```sh
npm install -g @rn-perf-kit/cli
# or run via npx
npx rn-perf --help
```

## Commands

```sh
# Compare PR session against baseline
rn-perf compare base.json pr.json

# Check session against tier-aware budgets (exits code 1 on violation)
rn-perf check --budgets perf.config.ts --report session.json

# Generate standalone HTML dashboard
rn-perf html session.json --output report.html
```
"""
}

for name, content in PACKAGE_READMES.items():
    p = f"packages/{name}/README.md"
    with open(p, "w") as f:
        f.write(content.strip() + "\n")
    print(f"Wrote {p}")
