/**
 * JankLab Integration Test Suite & Session Simulation.
 *
 * Simulates real device runtime events matching JankLab's planted performance bugs,
 * runs the four analyzers from packages/analyzers (the real source, not a copy), and
 * asserts that each planted bug produces its expected finding.
 *
 * Flags:
 *   --output <path>   Write the full serialized session report to <path>
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Analyzers: the real package sources (transpiled on load) ────────────────

require('./ts-test-loader');
const {
  analyzeNavigation,
  analyzeRenderCauses,
  analyzeCascades,
  analyzeFrameAttribution,
} = require('@rn-perf-kit/analyzers');

// ── Planted Bug Timeline Simulation ─────────────────────────────────────────

const ctx = { tier: 'LOW', refreshRateHz: 60, frameBudgetMs: 16.6 };
const simulatedEvents = [];

// Bug 1: Home -> ProductDetail navigation dropped frames due to ReviewsList mount (121ms)
simulatedEvents.push({ type: 'nav', t: 1000, phase: 'dispatch', route: 'ProductDetail', fromRoute: 'Home', navId: 'nav-1' });
simulatedEvents.push({ type: 'nav', t: 1050, phase: 'transition-start', route: 'ProductDetail', fromRoute: 'Home', navId: 'nav-1' });

// 25 frames during transition, 18 of them janky
for (let i = 0; i < 25; i++) {
  const t = 1050 + i * 16.6;
  const janky = i >= 3 && i <= 20; // 18 janky frames
  simulatedEvents.push({ type: 'frame', t, dur: janky ? 35 : 16.6, janky });
}

// Heavy ReviewsList commit inside transition
simulatedEvents.push({
  type: 'commit',
  t: 1100,
  dur: 121,
  phase: 'mount',
  fibers: [{ name: 'ReviewsList', cause: 'prop-change', actualDuration: 121, wasted: false }],
});

simulatedEvents.push({ type: 'nav', t: 1465, phase: 'transition-end', route: 'ProductDetail', fromRoute: 'Home', navId: 'nav-1' });

// Bug 2: Render Storm on ProductCard (80 renders in 1500ms -> >50 renders/sec)
for (let i = 0; i < 80; i++) {
  simulatedEvents.push({
    type: 'commit',
    t: 2000 + i * 18,
    dur: 2,
    phase: 'update',
    fibers: [{ name: 'ProductCard', cause: 'unstable-reference', actualDuration: 2, wasted: true }],
  });
}

// Bug 3: Store Fan-out (cart update -> 20 component renders)
simulatedEvents.push({ type: 'store', t: 3000, source: 'zustand', key: 'items' });
const fanOutFibers = [];
for (let i = 0; i < 20; i++) {
  fanOutFibers.push({ name: `ConsumerComponent_${i}`, cause: 'store-subscription', actualDuration: 1, wasted: false });
}
simulatedEvents.push({ type: 'commit', t: 3010, dur: 22, phase: 'update', fibers: fanOutFibers });

// Bug 4: Cascading update (setState in useLayoutEffect)
simulatedEvents.push({ type: 'commit', t: 4000, dur: 8, phase: 'update', fibers: [{ name: 'ProductDetailScreen', cause: 'prop-change', actualDuration: 8, wasted: false }] });
simulatedEvents.push({ type: 'commit', t: 4008, dur: 6, phase: 'nested-update', fibers: [{ name: 'ProductDetailScreen', cause: 'state-change', actualDuration: 6, wasted: false }] });

// Bug 5: Discarded renders on SearchResults (4 discarded renders)
simulatedEvents.push({ type: 'render-discarded', t: 5000, component: 'SearchResults', renderCount: 4 });

// Bug 6: Native-side jank (frame took 75ms with no JS commit or stall)
simulatedEvents.push({ type: 'frame', t: 6000, dur: 75, janky: true });

// ── Run Analyzers and Verify Expected Findings ──────────────────────────────

console.log('Running JankLab Integration Verification:\n');

let passed = 0;
let failed = 0;

function assertFinding(name, condition) {
  try {
    assert.ok(condition);
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

// 1. Navigation analysis
const navReports = analyzeNavigation(simulatedEvents, ctx);
const navFindings = navReports.flatMap((r) => r.findings);

assertFinding(
  'Planted Bug 1: Detects dropped frames during Home → ProductDetail transition',
  navFindings.some((f) => f.id.startsWith('nav:dropped-frames'))
);

assertFinding(
  'Planted Bug 1: Detects commit over frame budget during transition (ReviewsList 121ms)',
  navFindings.some((f) => f.id.startsWith('nav:heavy-commit'))
);

// 2. Render cause analysis
const renderReport = analyzeRenderCauses(simulatedEvents, ctx);

assertFinding(
  'Planted Bug 2: Detects render storm for ProductCard (unstable reference)',
  renderReport.findings.some((f) => f.id.includes('render:storm:ProductCard'))
);

// Regression: many instances of a primitive in ordinary commits is not a storm
// (0.1.2 reported "Render storm: View rendered 68x in 2s" on a real app at startup).
const busyScreenCommits = [];
for (let c = 0; c < 20; c++) {
  const fibers = [{ name: 'HomeScreen', cause: 'state-change', actualDuration: 3, wasted: false }];
  for (let i = 0; i < 68; i++) fibers.push({ name: 'View', cause: 'parent-rerender', actualDuration: 0.1, wasted: true });
  busyScreenCommits.push({ type: 'commit', t: 10000 + c * 100, dur: 5, phase: 'update', fibers });
}
assertFinding(
  'No false render storm from many View instances in one commit',
  !analyzeRenderCauses(busyScreenCommits, ctx).findings.some((f) => f.id.startsWith('render:storm'))
);

assertFinding(
  'Planted Bug 3: Detects store fan-out for cartStore.items',
  renderReport.findings.some((f) => f.id.includes('render:fan-out:items'))
);

// 3. Cascade analysis
const cascadeFindings = analyzeCascades(simulatedEvents, ctx);

assertFinding(
  'Planted Bug 4: Detects cascading update from setState in useLayoutEffect',
  cascadeFindings.some((f) => f.id.startsWith('cascade:nested-update'))
);

assertFinding(
  'Planted Bug 5: Detects discarded renders for SearchResults in concurrent mode',
  cascadeFindings.some((f) => f.id.includes('cascade:discarded:SearchResults'))
);

// 4. Frame attribution analysis
const frameReport = analyzeFrameAttribution(simulatedEvents, ctx);

assertFinding(
  'Planted Bug 6: Attributes janky frame without JS activity as native-side jank',
  frameReport.findings.some((f) => f.id.startsWith('frame:native-side'))
);

const allFindings = [
  ...navFindings,
  ...renderReport.findings,
  ...cascadeFindings,
  ...frameReport.findings,
];

console.log(`\nJankLab Verification Results: ${passed} passed, ${failed} failed.`);

// ── Optional Output Generation ──────────────────────────────────────────────

const outputIdx = process.argv.indexOf('--output');
if (outputIdx !== -1 && process.argv[outputIdx + 1]) {
  const outputPath = path.resolve(process.cwd(), process.argv[outputIdx + 1]);
  const sessionReport = {
    version: '1',
    capturedAt: new Date().toISOString(),
    durationMs: 7000,
    device: {
      tier: 'LOW',
      os: 'android',
      osVersion: '14',
      totalRamMb: 2048,
      refreshRateHz: 60,
    },
    build: {
      rnVersion: '0.76.5',
      reactVersion: '18.3.2',
      isDebug: false,
    },
    events: simulatedEvents,
    findings: allFindings,
    summary: {
      totalFrames: simulatedEvents.filter((e) => e.type === 'frame').length,
      jankFrames: simulatedEvents.filter((e) => e.type === 'frame' && e.janky).length,
      jankPct: 70.3,
      totalCommits: simulatedEvents.filter((e) => e.type === 'commit').length,
      jsStalls: simulatedEvents.filter((e) => e.type === 'stall').length,
      navigations: 1,
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(sessionReport, null, 2));
  console.log(`\nSession report exported to: ${outputPath}`);
}

process.exit(failed > 0 ? 1 : 0);
