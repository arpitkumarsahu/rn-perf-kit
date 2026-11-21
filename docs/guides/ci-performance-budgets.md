# Enforcing Performance Budgets in CI

Performance regressions usually happen gradually — a slow import here, an un-memoized component there — until users on budget Android devices begin reporting severe lag.

`rn-perf-kit` provides a dedicated CLI tool to enforce **hardware-tier-aware performance budgets** directly in your Continuous Integration (CI) pipeline.

---

## 1. Device Tiers (LOW / MID / HIGH)

A budget that makes sense on a modern iPhone 16 Pro will fail on a $90 Android Go device. `rn-perf-kit` automatically classifies devices at startup based on hardware telemetry:

| Device Tier | Criteria | Frame Budget (60Hz) |
|---|---|:---:|
| **`LOW`** | Low-RAM flag active (`isLowRamDevice`), or RAM < 3 GB, or CPU cores ≤ 4 | 16.6 ms |
| **`MID`** | 3 GB – 6 GB RAM, 6–8 CPU cores (Android) / RAM < 5.8 GB (iOS) | 16.6 ms |
| **`HIGH`** | RAM ≥ 6 GB, 8+ CPU cores, MediaPerformanceClass ≥ 31 (Android) / RAM ≥ 5.8 GB (iOS) | 16.6 ms / 8.3 ms (120Hz) |

---

## 2. Defining `perf.config.ts`

Create a `perf.config.ts` file in the root of your project:

```typescript
import type { BudgetConfig } from 'rn-perf-kit';

const config: BudgetConfig = {
  // Process start -> first usePerfScreen().markReady() (ms)
  startup: {
    LOW: 3000,
    MID: 2000,
    HIGH: 1500,
  },

  // Per-screen content-ready time (ms)
  screens: {
    Home: { LOW: 1200, MID: 800, HIGH: 500 },
    ProductDetail: { LOW: 900, MID: 600, HIGH: 400 },
  },

  // Transition duration by route pair (ms)
  navigation: {
    'Home→ProductDetail': { LOW: 600, MID: 350, HIGH: 250 },
  },

  // Health budgets
  minFps: { LOW: 45, MID: 55, HIGH: 58 },
  droppedFramesPct: { LOW: 15, MID: 5, HIGH: 2 },
  maxCommitDuration: { LOW: 32, MID: 16, HIGH: 11 },
};

export default config;
```

---

## 3. Using the CLI

### Budget Checking (`rn-perf check`)
Applies the budgets in your config (`.ts`, `.js` or `.json`, default export) to a recorded session, using the session's device tier. Any budget violation or **critical finding** exits with code `1`, failing the CI step:

```bash
# In CI:
rn-perf check --budgets perf.config.ts --report session.json
```

**Example Failure Output:**
```
🔍 rn-perf budget check
Budgets: perf.config.ts

Device tier: LOW

❌ 2 budget violation(s):

  [fps] 42fps < budget 45fps (tier: LOW)
  [screen] ProductDetail 940ms > budget 900ms (tier: LOW)

❌ 2 critical finding(s):

  [navigation] Dropped 18/25 frames during Home → ProductDetail
    72% drop rate. Commit time: 121ms. JS stall: 0ms.
    💡 Defer heavy component mounts until after transitionEnd.

  [render] Render storm: ProductCard rendered 80x in 2s
    40 renders/second detected.
    💡 Check for unstable prop references. Wrap with React.memo() and useCallback.
```

### PR Regression Comparison (`rn-perf compare`)
Compares performance metrics between the base branch and the current PR branch. Exits `1` when the PR adds critical/warning findings or raises jank % by more than `--max-jank-increase` points (default 2); add `--report-only` to only print. Findings are matched without their timestamps, so the same problem in both sessions is not reported as new:

```bash
rn-perf compare base-session.json pr-session.json
```

**Example Comparison Output:**
```
📊 rn-perf session comparison

Base: base-session.json
PR:   pr-session.json

  Jank %               base=4.2%   pr=18.5%  (+14.3%)
  JS Stalls            base=0.0    pr=3.0    (+3.0)
  Total Commits        base=12.0   pr=45.0   (+33.0)
  Navigations          base=1.0    pr=1.0    (0.0)

⚠️  1 new finding(s) in PR:
  [CRITICAL] Dropped 18/25 frames during Home → ProductDetail
```

---

## 4. GitHub Actions Workflow Integration

Add `.github/workflows/perf-check.yml` to run automated Maestro flows and budget checks on every PR:

```yaml
name: Performance Budget Check

on:
  pull_request:
    branches: [main]

jobs:
  perf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18

      # 1. Run Maestro E2E test to simulate user flow
      - name: Run E2E Performance Flow
        run: maestro test .maestro/janklab-flow.yaml

      # 2. Enforce budgets
      - name: Check Performance Budgets
        run: npx rn-perf check --budgets perf.config.ts --report session.json
```
