# @rn-perf-kit/react

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
