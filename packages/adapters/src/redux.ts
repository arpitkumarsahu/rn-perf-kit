/**
 * Redux middleware for rn-perf-kit.
 * Records every dispatched action as a 'store' event on the timeline.
 *
 * Usage:
 *   const store = configureStore({
 *     reducer,
 *     middleware: (getDefault) => getDefault().concat(reduxPerfMiddleware),
 *   });
 */
import { timeline } from '@rn-perf-kit/core';

type Action = { type: string; [key: string]: unknown };
type Dispatch = (action: Action) => Action;
type MiddlewareAPI = { getState: () => unknown; dispatch: Dispatch };
type Middleware = (api: MiddlewareAPI) => (next: Dispatch) => (action: Action) => Action;

export const reduxPerfMiddleware: Middleware =
  (_api) => (next) => (action) => {
    const t = timeline.now();
    const result = next(action);
    timeline.add({ type: 'store', t, source: 'redux', key: action.type ?? 'UNKNOWN' });
    return result;
  };
