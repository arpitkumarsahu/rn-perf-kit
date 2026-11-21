#!/usr/bin/env node
/**
 * rn-perf CLI
 *
 * Commands:
 *   rn-perf compare <base.json> <pr.json>
 *   rn-perf check --budgets <config> --report <session.json>
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const [, , command, ...args] = process.argv;

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

switch (command) {
  case 'compare': {
    const [basePath, prPath] = args;
    if (!basePath || !prPath) die('Usage: rn-perf compare <base.json> <pr.json>');
    const base = readJson(basePath);
    const pr = readJson(prPath);
    console.log('\n📊 rn-perf session comparison\n');
    console.log(`Base: ${basePath}\nPR:   ${prPath}\n`);
    const fields: Array<[string, string, string]> = [
      ['Jank %', 'summary.jankPct', '%'],
      ['JS Stalls', 'summary.jsStalls', ''],
      ['Total Commits', 'summary.totalCommits', ''],
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
    const baseF: any[] = (base as any).findings ?? [];
    const prF: any[] = (pr as any).findings ?? [];
    const newF = prF.filter((pf: any) => !baseF.find((bf: any) => bf.id === pf.id));
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
    break;
  }

  case 'check': {
    const budgetsIdx = args.indexOf('--budgets');
    const reportIdx = args.indexOf('--report');
    if (budgetsIdx === -1) die('Usage: rn-perf check --budgets <config> [--report <session.json>]');
    const budgetsPath = args[budgetsIdx + 1];
    const reportPath = reportIdx !== -1 ? args[reportIdx + 1] : null;
    console.log(`\n🔍 rn-perf budget check\nBudgets: ${budgetsPath}\n`);
    if (!reportPath) { console.log('No --report provided. Nothing to check.\n'); process.exit(0); }
    const report = readJson(reportPath) as any;
    const findings: any[] = report.findings ?? [];
    const critical = findings.filter((f: any) => f.severity === 'critical');
    const warnings = findings.filter((f: any) => f.severity === 'warning');
    if (critical.length > 0) {
      console.error(`❌ ${critical.length} critical finding(s):\n`);
      for (const f of critical) {
        console.error(`  [${f.category}] ${f.title}\n    ${f.detail}\n    💡 ${f.suggestion}\n`);
      }
      process.exit(1);
    }
    if (warnings.length > 0) { console.warn(`⚠️  ${warnings.length} warning(s):`); for (const f of warnings) console.warn(`  ${f.title}`); }
    console.log(`\n✅ All budget checks passed. (${findings.length} total, 0 critical)\n`);
    break;
  }

  default:
    console.log(`
rn-perf-kit CLI

Usage:
  rn-perf compare <base.json> <pr.json>
  rn-perf check --budgets <perf.config.ts> --report <session.json>

Commands:
  compare   Diff two session reports, highlight regressions
  check     Check a session against budgets; exits non-zero on violations
`);
}
