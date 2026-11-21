/**
 * PerfTrace — wraps React Profiler for Level 1 render measurement.
 */
import React, { type ReactNode, Profiler, type ProfilerOnRenderCallback } from 'react';
import { timeline } from '@rn-perf-kit/core';

interface PerfTraceProps {
  id: string;
  children: ReactNode;
  disabled?: boolean;
}

// The fiber hook already records every commit, so a traced subtree is recorded as a
// separate 'trace' event (named by `id`) instead of a second, duplicate commit.
const onRenderCallback: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  _baseDuration,
  _startTime,
  commitTime
) => {
  timeline.add({
    type: 'trace',
    t: commitTime,
    dur: actualDuration,
    id,
    phase: phase === 'mount' ? 'mount' : phase === 'nested-update' ? 'nested-update' : 'update',
  });
};

export function PerfTrace({ id, children, disabled = false }: PerfTraceProps): React.JSX.Element {
  if (disabled) return <>{children}</>;
  return (
    <Profiler id={id} onRender={onRenderCallback}>
      {children}
    </Profiler>
  );
}
