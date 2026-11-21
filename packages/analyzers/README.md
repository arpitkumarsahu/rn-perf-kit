# @rn-perf-kit/analyzers

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/analyzers.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/analyzers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Intelligent performance correlation analyzers for **rn-perf-kit**: navigation drop rates, render storms, and frame attribution.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Key Analyzers

1. **Navigation Analyzer**: Identifies heavy components mounting during screen transition animations.
2. **Render Cause Analyzer**: Flags render storms (>30 renders/sec) and wide fan-outs (>15 components).
3. **Frame Attribution Analyzer**: Directly links dropped UI frames to long JS commits vs. native GPU stalls.
4. **Cascade Analyzer**: Catches nested `setState` calls inside `useLayoutEffect` and discarded Concurrent renders.
