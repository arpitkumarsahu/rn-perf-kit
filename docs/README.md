# rn-perf-kit Documentation

> Deep performance profiling toolkit for React Native apps — tells you **what** is slow, **why**, and **what to change**. Focused on low-end Android devices.

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
