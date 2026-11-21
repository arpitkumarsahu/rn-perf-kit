# @rn-perf-kit/adapters

[![npm version](https://img.shields.io/npm/v/@rn-perf-kit/adapters.svg?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@rn-perf-kit/adapters)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> Store and network performance adapters for **rn-perf-kit**: Redux Toolkit, Zustand, TanStack Query, and fetch/XHR.

Part of the [rn-perf-kit](https://github.com/arpitkumarsahu/rn-perf-kit) monorepo.

## Installation

```sh
npm install @rn-perf-kit/adapters
```

## Features

- **Redux Middleware**: Captures action types, dispatch timestamp, and execution duration.
- **Zustand Wrapper**: Tracks state slice mutations.
- **TanStack Query Plugin**: Records query cache events and data arrivals.
- **Fetch/XHR Interceptor**: Measures request latency with automatic PII / query-param redaction.
