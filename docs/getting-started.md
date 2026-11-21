# Getting Started with rn-perf-kit

[![npm version](https://img.shields.io/npm/v/rn-perf-kit.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/rn-perf-kit)
[![npm downloads](https://img.shields.io/npm/dm/rn-perf-kit.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/rn-perf-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

This guide walks you through setting up `rn-perf-kit` in your React Native or Expo application in under 5 minutes.

📦 **NPM Package**: [npmjs.com/package/rn-perf-kit](https://www.npmjs.com/package/rn-perf-kit)  
🐙 **GitHub Repository**: [github.com/arpitkumarsahu/rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit)

---

## 1. Installation

Install the top-level package into your project:

```bash
# Using npm
npm install rn-perf-kit

# Using pnpm
pnpm add rn-perf-kit

# Using yarn
yarn add rn-perf-kit
```

### React Native & Expo Autolinking

`rn-perf-kit` ships its native TurboModule (`RnPerfKit`) directly inside the package:
- **React Native 0.76+**: Autolinking automatically discovers and links the native code for Android (`AndroidX JankStats`) and iOS (`CADisplayLink`). No manual `pod install` edits or Gradle modifications needed.
- **Expo SDK 52+ / 53+**: Autolinked out-of-the-box via Expo Prebuild / Continuous Native Generation (`npx expo run:android` or `npx expo run:ios`). No custom config plugin required in `app.json`.

---

## 2. Register the React Fiber Hook (Crucial Step)

To capture accurate React commit times, component names, and re-render causes, `rn-perf-kit/install` **must be the very first import** in your application entry point before `react` or `react-native` are loaded.

### Bare React Native
```javascript
// index.js (Bare React Native) — MUST BE LINE 1
import 'rn-perf-kit/install';

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
```

### Expo Router
For Expo Router apps, create a root `index.js` and set `"main": "index.js"` in `package.json`:
```javascript
// index.js (Expo Router) — MUST BE LINE 1
import 'rn-perf-kit/install';
import 'expo-router/entry';
```

> **Why?** React checks for `__REACT_DEVTOOLS_GLOBAL_HOOK__` at module initialization time. Importing this first registers the hook before React creates its internal Fiber renderer. In dev builds, `rn-perf-kit` safely chains onto any existing DevTools hook.

---

## 3. Wrap Your Root Component

### Option A: Standard React Navigation (`@react-navigation/native`)

Wrap your navigation container with `<PerfProvider>`. Pass `navigationRef` to `withNavigationPerf` — it returns a cached callback ref that automatically binds listeners when the container mounts:

```tsx
import React, { useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PerfProvider, PerfOverlay } from 'rn-perf-kit';
import { withNavigationPerf } from 'rn-perf-kit/navigation';

const Stack = createNativeStackNavigator();

export default function App() {
  const navigationRef = useRef(null);

  return (
    <PerfProvider
      enabled={__DEV__ || Boolean(process.env.IS_QA_BUILD)}
      mode="light" // or "deep" for full fiber prop diffing
      budgets={{
        startup: { LOW: 3000, MID: 2000, HIGH: 1500 },
        screens: { Home: 800, ProductDetail: 600 },
        minFps: 55,
      }}
      onViolation={(violation) => {
        console.warn('[perf:violation]', violation.message);
      }}
    >
      <NavigationContainer ref={withNavigationPerf(navigationRef)}>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
        </Stack.Navigator>
      </NavigationContainer>

      {/* Floating HUD showing live JS/UI FPS, stalls, and active route */}
      <PerfOverlay position="top-right" />
    </PerfProvider>
  );
}
```

### Option B: Expo Router (`expo-router`)

In Expo Router projects, use the `useExpoRouterPerf()` hook inside your root layout:

```tsx
// app/_layout.tsx
import React from 'react';
import { Stack } from 'expo-router';
import { PerfProvider, PerfOverlay } from 'rn-perf-kit';
import { useExpoRouterPerf } from 'rn-perf-kit/expo-router';

function AppLayout() {
  useExpoRouterPerf(); // Automatically attaches listeners to Expo Router container
  return <Stack />;
}

export default function RootLayout() {
  return (
    <PerfProvider enabled={__DEV__}>
      <AppLayout />
      <PerfOverlay position="top-right" />
    </PerfProvider>
  );
}
```

---

## 4. Instrumenting Screens and Subtrees

### Tracking Screen Readiness (`usePerfScreen`)
Use `usePerfScreen` to mark when a screen has finished loading its essential content:

```tsx
import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { usePerfScreen } from 'rn-perf-kit';

export function ProductDetailScreen({ route }) {
  const { markReady } = usePerfScreen('ProductDetail');
  const { data, isLoading } = useProductQuery(route.params.id);

  useEffect(() => {
    if (!isLoading && data) {
      markReady(); // Measures Time-To-Content-Ready (screen:ready:ProductDetail)
    }
  }, [isLoading, data, markReady]);

  return <View>...</View>;
}
```

### Wrapping Expensive Subtrees (`<PerfTrace>`)
Wrap suspect components to record render duration:

```tsx
import { PerfTrace } from 'rn-perf-kit';

<PerfTrace id="ReviewsSection">
  <ReviewsList productId={id} />
</PerfTrace>
```

---

## 5. Hooking Up Store & Network Adapters

### Automatic Network Interception (Axios & Fetch)
`PerfProvider` automatically installs a unified `XMLHttpRequest` interceptor upon mounting when enabled. This covers both `axios` and native `fetch` requests with automatic query string redaction (stripping API keys and sensitive tokens) and response size tracking:

```ts
// Manual control if using outside PerfProvider:
import { installNetworkInterceptor, uninstallNetworkInterceptor } from 'rn-perf-kit/adapters';

installNetworkInterceptor();
```

### State Store Adapters
Link your state stores so analyzers can pinpoint which action or state key triggered a re-render cascade:

```typescript
// Redux Toolkit
import { reduxPerfMiddleware } from 'rn-perf-kit/adapters';

const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().concat(reduxPerfMiddleware),
});

// Zustand
import { zustandPerf } from 'rn-perf-kit/adapters';

const useCartStore = create(
  zustandPerf('cart', (set) => ({
    items: [],
    addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  }))
);

// TanStack Query
import { queryPerf } from 'rn-perf-kit/adapters';

queryPerf(queryClient); // Uses WeakMap object tracking and detects identical refetches
```

---

## 6. Production & Profiling Builds

### Zero Overhead in Production
When `<PerfProvider enabled={false}>` is set, the timeline ring buffer is dormant (`enabled: false`) and 0 events are recorded. For absolute tree-shaking in production:

```tsx
const Perf = __DEV__ || process.env.EXPO_PUBLIC_PERF === '1' ? require('rn-perf-kit') : null;
```

### QA Profiling Builds (React Fabric)
On React 18.3+ and React 19, commit durations and `actualDuration` profiling require a profiling build of React Native. In Expo / Metro, you can opt in via a Metro alias:

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

if (process.env.PERF_PROFILING === '1') {
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const name = moduleName.endsWith('/ReactFabric-prod')
      ? moduleName.replace(/-prod$/, '-profiling')
      : moduleName;
    return (upstream ?? context.resolveRequest)(context, name, platform);
  };
}
module.exports = config;
```
