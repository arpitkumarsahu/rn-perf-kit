# @rn-perf-kit/core

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
