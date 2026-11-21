/**
 * Manual tracing API.
 *
 * Usage:
 *   import { perf } from 'rn-perf-kit';
 *   const t = perf.start('parse-catalog');
 *   parseCatalog(json);
 *   t.end();
 */
import { timeline } from '@rn-perf-kit/core';

interface TraceHandle { end: (data?: unknown) => void }

export const perf = {
  start(name: string, data?: unknown): TraceHandle {
    const startT = timeline.now();
    timeline.mark(`${name}:start`, data);
    return {
      end(endData?: unknown) {
        timeline.mark(`${name}:end`, { ...((endData as object) ?? {}), dur: timeline.now() - startT });
      },
    };
  },
  mark(name: string, data?: unknown): void {
    timeline.mark(name, data);
  },
};
