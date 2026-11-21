# @rn-perf-kit/overlay

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
