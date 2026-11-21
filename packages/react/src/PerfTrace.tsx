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

const onRenderCallback: ProfilerOnRenderCallback = (
  _id,
  phase,
  actualDuration,
  _baseDuration,
  _startTime,
  commitTime
) => {
  timeline.add({
    type: 'commit',
    t: commitTime,
    dur: actualDuration,
    phase: phase === 'mount' ? 'mount' : phase === 'nested-update' ? 'nested-update' : 'update',
    fibers: [],
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
