# @rn-perf-kit/navigation

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
