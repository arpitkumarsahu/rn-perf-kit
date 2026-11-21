# Getting Started with rn-perf-kit

This guide walks you through setting up `rn-perf-kit` in your React Native or Expo application in under 5 minutes.

---

## 1. Installation

Install the package into your project:

```bash
# Using npm
npm install rn-perf-kit

# Using pnpm
pnpm add rn-perf-kit

# Using yarn
yarn add rn-perf-kit
```

### Expo Projects
If you use Expo, the included Config Plugin automatically configures Android and iOS build settings:

```json
// app.json
{
  "expo": {
    "plugins": ["@rn-perf-kit/native"]
  }
}
```

---

## 2. Install the React Fiber Hook (Crucial Step)

To capture React commit times, component names, and re-render causes, `rn-perf-kit/install` **must be the very first import** in your application entry point before `react` or `react-native` are loaded.

```javascript
// index.js (Bare React Native) or index.ts (Expo)
import 'rn-perf-kit/install'; // <--- MUST BE LINE 1

import { registerRootComponent } from 'expo';
import App from './src/App';

registerRootComponent(App);
```

> **Why?** React checks for `__REACT_DEVTOOLS_GLOBAL_HOOK__` at module initialization time. Importing this first registers the hook before React creates its internal Fiber renderer.

---

## 3. Wrap Your Root Component

In your root `App.tsx`, wrap your navigation tree with `<PerfProvider>`:

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
        droppedFramesPct: { LOW: 15, MID: 5, HIGH: 2 },
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
      markReady(); // Measures Time-To-Content-Ready
    }
  }, [isLoading, data, markReady]);

  return <View>...</View>;
}
```

### Wrapping Expensive Subtrees (`<PerfTrace>`)
Wrap suspect components to record render duration without fiber-hook overhead:

```tsx
import { PerfTrace } from 'rn-perf-kit';

<PerfTrace id="ReviewsSection">
  <ReviewsList productId={id} />
</PerfTrace>
```

---

## 5. Hooking Up Store Adapters

Link your state stores so the analyzer can pinpoint which action or state key triggered a re-render cascade:

```typescript
// Redux Toolkit
import { reduxPerfMiddleware } from 'rn-perf-kit/adapters';

const store = configureStore({
  reducer,
  middleware: (getDefault) => getDefault().concat(reduxPerfMiddleware),
});

// Zustand
import { zustandPerf } from 'rn-perf-kit/adapters';

export const useCartStore = create(
  zustandPerf('cart', (set) => ({
    items: [],
    addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  }))
);

// TanStack Query
import { queryPerf } from 'rn-perf-kit/adapters';

queryPerf(queryClient);
```

---

## Next Steps
- Learn how to diagnose navigation stutter in [**Diagnosing & Fixing Navigation Jank**](./guides/navigation-profiling.md).
- Understand why components re-render in [**Eliminating Render Storms**](./guides/re-render-analysis.md).
