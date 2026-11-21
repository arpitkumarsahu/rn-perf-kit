# @rn-perf-kit/native

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
