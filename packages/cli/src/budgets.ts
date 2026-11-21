/**
 * Evaluates a session report against a perf.config budget file.
 * Uses @rn-perf-kit/core's own resolveBudget/computeFrameStats (loaded at runtime via the
 * TypeScript require hook), so the CLI and the in-app BudgetEngine agree.
 */
type Tier = 'LOW' | 'MID' | 'HIGH';
type Tiered = number | { LOW: number; MID: number; HIGH: number };

export interface BudgetConfig {
  startup?: Tiered;
  screens?: Record<string, Tiered>;
  navigation?: Record<string, Tiered>;
  minFps?: Tiered;
  droppedFramesPct?: Tiered;
  maxCommitDuration?: Tiered;
}

export interface CliViolation {
  type: 'startup' | 'screen' | 'navigation' | 'fps' | 'dropped-frames' | 'commit';
  key?: string;
  budget: number;
  actual: number;
  message: string;
}

interface CoreApi {
  resolveBudget(budget: Tiered | undefined, tier: Tier): number | undefined;
  computeFrameStats(
    events: readonly any[],
    windowMs: number,
    refreshRateHz: number
  ): { frames: number; droppedFrames: number; uiFps: number; active: boolean };
}

export function evaluateBudgets(report: any, config: BudgetConfig): { tier: Tier; violations: CliViolation[] } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const core: CoreApi = require('@rn-perf-kit/core');
  const tierRaw = report?.device?.tier;
  const tier: Tier = tierRaw === 'LOW' || tierRaw === 'HIGH' ? tierRaw : 'MID';
  const hz: number = report?.device?.refreshRateHz > 0 ? report.device.refreshRateHz : 60;
  const events: any[] = Array.isArray(report?.events) ? report.events : [];
  const violations: CliViolation[] = [];
  const budgetFor = (b: Tiered | undefined) => core.resolveBudget(b, tier);
  const add = (v: Omit<CliViolation, 'message'>, unit: string, op: string) =>
    violations.push({ ...v, message: `[${v.type}]${v.key ? ` ${v.key}` : ''} ${v.actual.toFixed(0)}${unit} ${op} budget ${v.budget}${unit} (tier: ${tier})` });

  // Startup: the `startup` mark ({ durMs }) recorded by PerfProvider
  const startupBudget = budgetFor(config.startup);
  if (startupBudget !== undefined) {
    const mark = events.find((e) => e.type === 'mark' && e.name === 'startup');
    const dur = mark?.data?.durMs;
    if (typeof dur === 'number' && dur > startupBudget) add({ type: 'startup', budget: startupBudget, actual: dur }, 'ms', '>');
  }

  // Screens: usePerfScreen(name).markReady() -> `screen:ready:<name>` ({ ttfr })
  for (const e of events) {
    if (e.type !== 'mark' || typeof e.name !== 'string' || !e.name.startsWith('screen:ready:')) continue;
    const name = e.name.slice('screen:ready:'.length);
    const budget = budgetFor(config.screens?.[name]);
    const ttfr = e.data?.ttfr;
    if (budget !== undefined && typeof ttfr === 'number' && ttfr > budget) {
      add({ type: 'screen', key: name, budget, actual: ttfr }, 'ms', '>');
    }
  }

  // Navigation: tap (or dispatch) -> interactive, keyed "From→To"
  if (config.navigation) {
    const start = new Map<string, number>();
    for (const e of [...events].filter((x) => x.type === 'nav').sort((a, b) => a.t - b.t)) {
      if (e.phase === 'tap' || (e.phase === 'dispatch' && !start.has(e.navId))) start.set(e.navId, e.t);
      if (e.phase !== 'interactive' || !start.has(e.navId)) continue;
      const key = `${e.fromRoute ?? ''}→${e.route}`;
      const budget = budgetFor(config.navigation[key]);
      const dur = e.t - start.get(e.navId)!;
      if (budget !== undefined && dur > budget) add({ type: 'navigation', key, budget, actual: dur }, 'ms', '>');
    }
  }

  // Commits: report the worst one, with how many were over
  const commitBudget = budgetFor(config.maxCommitDuration);
  if (commitBudget !== undefined) {
    const over = events.filter((e) => e.type === 'commit' && e.dur > commitBudget);
    if (over.length > 0) {
      const worst = Math.max(...over.map((e) => e.dur));
      add({ type: 'commit', key: `${over.length} commit(s)`, budget: commitBudget, actual: worst }, 'ms', '>');
    }
  }

  // Frames: 1 s windows that drew anything (idle windows are not slow ones)
  const fpsBudget = budgetFor(config.minFps);
  const droppedBudget = budgetFor(config.droppedFramesPct);
  if (fpsBudget !== undefined || droppedBudget !== undefined) {
    const frames = events.filter((e) => e.type === 'frame');
    const buckets = new Map<number, any[]>();
    for (const f of frames) {
      const k = Math.floor(f.t / 1000);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(f);
    }
    let fpsSum = 0;
    let dropped = 0;
    let active = 0;
    for (const bucket of buckets.values()) {
      const s = core.computeFrameStats(bucket, 1000, hz);
      if (!s.active) continue;
      active++;
      fpsSum += s.uiFps;
      dropped += s.droppedFrames;
    }
    if (active > 0) {
      const avgFps = fpsSum / active;
      const droppedPct = (dropped / (active * hz)) * 100;
      if (fpsBudget !== undefined && avgFps < fpsBudget) add({ type: 'fps', budget: fpsBudget, actual: avgFps }, 'fps', '<');
      if (droppedBudget !== undefined && droppedPct > droppedBudget) {
        add({ type: 'dropped-frames', budget: droppedBudget, actual: droppedPct }, '%', '>');
      }
    }
  }

  return { tier, violations };
}
