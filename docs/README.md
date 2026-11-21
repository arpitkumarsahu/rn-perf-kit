# rn-perf-kit Documentation

[![npm version](https://img.shields.io/npm/v/rn-perf-kit.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/rn-perf-kit)
[![npm downloads](https://img.shields.io/npm/dm/rn-perf-kit.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/rn-perf-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Deep performance profiling toolkit for React Native apps — tells you **what** is slow, **why**, and **what to change**. Focused on low-end Android devices.

- **NPM Package**: [`rn-perf-kit` on npm](https://www.npmjs.com/package/rn-perf-kit)
- **GitHub**: [github.com/arpitkumarsahu/rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit)

---

## Table of Contents

### 1. Getting Started
- [**Quick Start Guide**](./getting-started.md) — 5-minute setup in bare React Native and Expo apps.

### 2. Deep Dive Guides
- [**Diagnosing & Fixing Navigation Jank**](./guides/navigation-profiling.md) — Phase-by-phase routing analysis, mount-during-transition detection, and deferral patterns.
- [**Eliminating Render Storms & Wasted Re-renders**](./guides/re-render-analysis.md) — Fiber hook cause classification, reference stability, Context fan-outs, and store selector optimization.
- [**Interrupted Renders & Frame Attribution**](./guides/frame-attribution-and-concurrency.md) — Discarded renders in Concurrent React, cascading `useLayoutEffect` updates, and JS vs. native-side jank attribution.
- [**CI Performance Budgets & Regressions**](./guides/ci-performance-budgets.md) — Tier-aware budgets (LOW / MID / HIGH), CLI checks, and automated GitHub Actions PR enforcement.

### 3. Reference
- [**Full API Reference**](./guides/api-reference.md) — Complete documentation for all exports, hooks, components, adapters, and CLI commands.

---

## Architectural Principles

1. **Correlation Over Collection:** A dropped frame or slow commit alone doesn't explain *why* it happened. rn-perf-kit synchronizes native frame timestamps with JS commits, store updates, and navigation lifecycle events onto a single unified timeline.
2. **Minimal Overhead:** Light mode operates with < 2% CPU overhead by keeping prop diffing off the hot path and throttling HUD updates to 2 Hz.
3. **Hardware Context:** A 400ms transition may be acceptable on a budget Android phone ($100 device with 2GB RAM) but unacceptable on a flagship phone. All metrics are tagged with device capability tiers (`LOW`, `MID`, `HIGH`).

---

## Packages

| Package | NPM Link | Description |
|---|---|---|
| `rn-perf-kit` | [npm/rn-perf-kit](https://www.npmjs.com/package/rn-perf-kit) | Top-level provider bundle |
| `@rn-perf-kit/core` | [npm/@rn-perf-kit/core](https://www.npmjs.com/package/@rn-perf-kit/core) | Timeline, ring buffer, clock sync, budgets |
| `@rn-perf-kit/native` | [npm/@rn-perf-kit/native](https://www.npmjs.com/package/@rn-perf-kit/native) | TurboModule native bridge (AndroidX FrameMetrics, CADisplayLink) |
| `@rn-perf-kit/react` | [npm/@rn-perf-kit/react](https://www.npmjs.com/package/@rn-perf-kit/react) | Fiber hook adapter, `<PerfTrace>`, `usePerfScreen` |
| `@rn-perf-kit/navigation` | [npm/@rn-perf-kit/navigation](https://www.npmjs.com/package/@rn-perf-kit/navigation) | 6-phase React Navigation + Expo Router adapter |
| `@rn-perf-kit/adapters` | [npm/@rn-perf-kit/adapters](https://www.npmjs.com/package/@rn-perf-kit/adapters) | Redux, Zustand, React Query, fetch adapters |
| `@rn-perf-kit/analyzers` | [npm/@rn-perf-kit/analyzers](https://www.npmjs.com/package/@rn-perf-kit/analyzers) | Navigation, render storms, frame attribution |
| `@rn-perf-kit/overlay` | [npm/@rn-perf-kit/overlay](https://www.npmjs.com/package/@rn-perf-kit/overlay) | In-app 2 Hz floating HUD overlay |
| `@rn-perf-kit/reporters` | [npm/@rn-perf-kit/reporters](https://www.npmjs.com/package/@rn-perf-kit/reporters) | JSON, Perfetto trace, standalone HTML report |
| `@rn-perf-kit/cli` | [npm/@rn-perf-kit/cli](https://www.npmjs.com/package/@rn-perf-kit/cli) | CLI: `compare`, `check`, `html` |
