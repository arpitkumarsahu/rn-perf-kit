/**
 * Budget model and violation tracking.
 * Budgets are tier-aware: LOW / MID / HIGH device classifications.
 */

import { perfClock } from './clock';

export type DeviceTier = 'LOW' | 'MID' | 'HIGH';

export interface TieredBudget {
  LOW: number;
  MID: number;
  HIGH: number;
}

export interface BudgetConfig {
  startup?: TieredBudget | number;
  screens?: Record<string, TieredBudget | number>;
  navigation?: Record<string, TieredBudget | number>;
  minFps?: TieredBudget | number;
  droppedFramesPct?: TieredBudget | number;
  maxCommitDuration?: TieredBudget | number;
}

export interface BudgetViolation {
  type: 'startup' | 'screen' | 'navigation' | 'fps' | 'dropped-frames' | 'commit';
  budget: number;
  actual: number;
  tier: DeviceTier;
  route?: string;
  message: string;
  t: number;
}

const MAX_VIOLATIONS = 500;

export function resolveBudget(
  budget: TieredBudget | number | undefined,
  tier: DeviceTier
): number | undefined {
  if (budget === undefined) return undefined;
  if (typeof budget === 'number') return budget;
  return budget[tier];
}

export class BudgetEngine {
  private config: BudgetConfig;
  private tier: DeviceTier;
  private violations: BudgetViolation[] = [];
  private onViolation?: (v: BudgetViolation) => void;

  constructor(
    config: BudgetConfig,
    tier: DeviceTier,
    onViolation?: (v: BudgetViolation) => void
  ) {
    this.config = config;
    this.tier = tier;
    this.onViolation = onViolation;
  }

  check(
    type: BudgetViolation['type'],
    actual: number,
    budgetKey?: string,
    t?: number
  ): BudgetViolation | null {
    let budget: number | undefined;
    switch (type) {
      case 'startup':
        budget = resolveBudget(this.config.startup, this.tier);
        break;
      case 'screen':
        budget = budgetKey ? resolveBudget(this.config.screens?.[budgetKey], this.tier) : undefined;
        break;
      case 'navigation':
        budget = budgetKey ? resolveBudget(this.config.navigation?.[budgetKey], this.tier) : undefined;
        break;
      case 'fps':
        budget = resolveBudget(this.config.minFps, this.tier);
        if (budget !== undefined && actual >= budget) return null;
        break;
      case 'dropped-frames':
        budget = resolveBudget(this.config.droppedFramesPct, this.tier);
        break;
      case 'commit':
        budget = resolveBudget(this.config.maxCommitDuration, this.tier);
        break;
    }
    if (budget === undefined) return null;
    if (type !== 'fps' && actual <= budget) return null;

    const unit = type === 'fps' ? 'fps' : type === 'dropped-frames' ? '%' : 'ms';
    const op = type === 'fps' ? '<' : '>';
    const violation: BudgetViolation = {
      type,
      budget,
      actual,
      tier: this.tier,
      route: budgetKey,
      message: `[${type}]${budgetKey ? ` ${budgetKey}` : ''} ${actual.toFixed(0)}${unit} ${op} budget ${budget}${unit} (tier: ${this.tier})`,
      t: t ?? perfClock.jsNow(),
    };
    this.violations.push(violation);
    // Long sessions must not grow without bound
    if (this.violations.length > MAX_VIOLATIONS) this.violations.shift();
    this.onViolation?.(violation);
    return violation;
  }

  getViolations(): BudgetViolation[] {
    return [...this.violations];
  }

  clearViolations(): void {
    this.violations = [];
  }

  updateTier(tier: DeviceTier): void {
    this.tier = tier;
  }
}
