# @rn-perf-kit/cli

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/cli.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> CLI tool for **rn-perf-kit**: compare profiling sessions, check budgets in CI, and generate interactive HTML dashboards.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Installation

```sh
npm install -g @rn-perf-kit/cli
# or run via npx
npx rn-perf --help
```

## Commands

```sh
# Compare PR session against baseline
rn-perf compare base.json pr.json

# Check session against tier-aware budgets (exits code 1 on violation)
rn-perf check --budgets perf.config.ts --report session.json

# Generate standalone HTML dashboard
rn-perf html session.json --output report.html
```
