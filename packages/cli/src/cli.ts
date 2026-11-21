#!/usr/bin/env node
/**
 * rn-perf CLI
 *
 * Commands:
 *   rn-perf compare <base.json> <pr.json> [--max-jank-increase <points>] [--report-only]
 *   rn-perf check --budgets <perf.config.ts|js|json> --report <session.json>
 *   rn-perf html <session.json> [--output <report.html>]
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { registerTypeScript, loadModule } from './ts-require';
import type { BudgetConfig } from './budgets';

const [, , command, ...args] = process.argv;

const USAGE = `
rn-perf-kit CLI

Usage:
  rn-perf compare <base.json> <pr.json> [--max-jank-increase <points>] [--report-only]
  rn-perf check --budgets <perf.config.ts> --report <session.json>
  rn-perf html <session.json> [--output <report.html>]

Commands:
  compare   Diff two session reports; exits 1 on new findings or a jank regression
  check     Check a session against budgets; exits 1 on any violation or critical finding
  html      Generate a standalone HTML dashboard from a session report
`;

function die(msg: string): never {
  console.error(`[rn-perf] ${msg}`);
  process.exit(1);
}

function readJson(filePath: string): unknown {
  const abs = resolve(process.cwd(), filePath);
  if (!existsSync(abs)) die(`File not found: ${abs}`);
  return JSON.parse(readFileSync(abs, 'utf-8'));
}

function getPath(obj: unknown, path: string): number {
  return path.split('.').reduce((o: any, k) => o?.[k], obj) ?? 0;
}

function flagValue(name: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
}

/**
 * Finding ids end in a timestamp (e.g. `render:storm:ProductCard:2000`), which differs
 * between any two sessions. Compare on the id without it.
 */
function findingSignature(f: any): string {
  return String(f?.id ?? f?.title ?? '').replace(/:-?\d+(\.\d+)?$/, '');
}

switch (command) {
  case 'compare': {
    const valueFlags = new Set(['--max-jank-increase']);
    const [basePath, prPath] = args.filter((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1] ?? ''));
    if (!basePath || !prPath) die('Usage: rn-perf compare <base.json> <pr.json>');
    const maxJankIncrease = Number(flagValue('--max-jank-increase') ?? 2);
    const reportOnly = args.includes('--report-only');
    const base = readJson(basePath);
    const pr = readJson(prPath);
    console.log('\n📊 rn-perf session comparison\n');
    console.log(`Base: ${basePath}\nPR:   ${prPath}\n`);
    const fields: Array<[string, string, string]> = [
      ['Jank %', 'summary.jankPct', '%'],
      ['JS Stalls', 'summary.jsStalls', ''],
      ['Total Commits', 'summary.totalCommits', ''],
      ['Wasted renders', 'summary.wastedRenders', ''],
      ['Navigations', 'summary.navigations', ''],
    ];
    for (const [label, path, unit] of fields) {
      const bv = getPath(base, path);
      const pv = getPath(pr, path);
      const delta = pv - bv;
      const color = delta > 0 ? '\x1b[31m' : delta < 0 ? '\x1b[32m' : '\x1b[0m';
      const sign = delta > 0 ? '+' : '';
      console.log(`  ${label.padEnd(20)} base=${bv.toFixed(1)}${unit}  pr=${pv.toFixed(1)}${unit}  ${color}(${sign}${delta.toFixed(1)}${unit})\x1b[0m`);
    }
    const baseSigs = new Set(((base as any).findings ?? []).map(findingSignature));
    const prF: any[] = (pr as any).findings ?? [];
    const seen = new Set<string>();
    const newF = prF.filter((pf) => {
      const sig = findingSignature(pf);
      if (baseSigs.has(sig) || seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
    const regressions: string[] = [];
    const jankDelta = getPath(pr, 'summary.jankPct') - getPath(base, 'summary.jankPct');
    if (jankDelta > maxJankIncrease) regressions.push(`Jank % rose by ${jankDelta.toFixed(1)} points (allowed: ${maxJankIncrease})`);
    const blocking = newF.filter((f) => f.severity === 'critical' || f.severity === 'warning');
    if (blocking.length > 0) regressions.push(`${blocking.length} new critical/warning finding(s)`);

    if (newF.length > 0) {
      console.log(`\n⚠️  ${newF.length} new finding(s) in PR:\n`);
      for (const f of newF) {
        console.log(`  [${f.severity?.toUpperCase()}] ${f.title}`);
        console.log(`    ${f.detail}`);
        console.log(`    💡 ${f.suggestion}\n`);
      }
    } else {
      console.log('\n✅ No new findings in PR.\n');
    }
    if (regressions.length > 0) {
      console.error(`❌ Regression:\n${regressions.map((r) => `  - ${r}`).join('\n')}\n`);
      if (!reportOnly) process.exit(1);
    }
    break;
  }

  case 'check': {
    const budgetsPath = flagValue('--budgets');
    const reportPath = flagValue('--report');
    if (!budgetsPath) die('Usage: rn-perf check --budgets <config> [--report <session.json>]');
    console.log(`\n🔍 rn-perf budget check\nBudgets: ${budgetsPath}\n`);
    if (!reportPath) { console.log('No --report provided. Nothing to check.\n'); process.exit(0); }
    const budgetsAbs = resolve(process.cwd(), budgetsPath);
    if (!existsSync(budgetsAbs)) die(`File not found: ${budgetsAbs}`);
    let config: BudgetConfig;
    try {
      config = loadModule<BudgetConfig>(budgetsAbs);
    } catch (e: any) {
      die(`Could not load ${budgetsPath}: ${e?.message ?? e}`);
    }
    if (!config || typeof config !== 'object') die(`${budgetsPath} must export a budget config object (export default { ... }).`);
    const report = readJson(reportPath) as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { evaluateBudgets } = require('./budgets') as typeof import('./budgets');
    const { tier, violations } = evaluateBudgets(report, config);
    console.log(`Device tier: ${tier}\n`);

    const findings: any[] = report.findings ?? [];
    const critical = findings.filter((f: any) => f.severity === 'critical');
    const warnings = findings.filter((f: any) => f.severity === 'warning');
    if (violations.length > 0) {
      console.error(`❌ ${violations.length} budget violation(s):\n`);
      for (const v of violations) console.error(`  ${v.message}`);
      console.error('');
    }
    if (critical.length > 0) {
      console.error(`❌ ${critical.length} critical finding(s):\n`);
      for (const f of critical) {
        console.error(`  [${f.category}] ${f.title}\n    ${f.detail}\n    💡 ${f.suggestion}\n`);
      }
    }
    if (violations.length > 0 || critical.length > 0) process.exit(1);
    if (warnings.length > 0) { console.warn(`⚠️  ${warnings.length} warning(s):`); for (const f of warnings) console.warn(`  ${f.title}`); }
    console.log(`\n✅ All budget checks passed. (${findings.length} findings, 0 critical)\n`);
    break;
  }

  case 'html': {
    const sessionPath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--output');
    if (!sessionPath) die('Usage: rn-perf html <session.json> [--output <report.html>]');
    const outPath = resolve(process.cwd(), flagValue('--output') ?? 'rn-perf-report.html');
    const report = readJson(sessionPath);
    registerTypeScript();
    const reportersDir = dirname(require.resolve('@rn-perf-kit/reporters/package.json'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateHtmlReport } = require(resolve(reportersDir, 'src/html-reporter.ts'));
    writeFileSync(outPath, generateHtmlReport(report));
    console.log(`\n📄 HTML report written to ${outPath}\n`);
    break;
  }

  case undefined:
  case 'help':
  case '--help':
  case '-h':
    console.log(USAGE);
    break;

  default:
    console.error(`[rn-perf] Unknown command: ${command}`);
    console.log(USAGE);
    process.exit(1);
}
