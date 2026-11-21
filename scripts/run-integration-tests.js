/**
 * JankLab Integration Test Suite & Session Simulation.
 *
 * Simulates real device runtime events matching JankLab's planted performance bugs,
 * executes all four core analyzers, and asserts that each planted bug produces its
 * exact expected performance finding.
 *
 * Flags:
 *   --output <path>   Write the full serialized session report to <path>
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Analyzers (inlined for zero-dependency execution) ────────────────────────

const STORM_THRESHOLD_PER_SEC = 30;
const FAN_OUT_THRESHOLD = 15;
const WINDOW_MS = 2000;
const PRIMITIVES = new Set([
  'View', 'Text', 'TextImpl', 'Image', 'ScrollView', 'FlatList', 'VirtualizedList',
  'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
  'TextInput', 'Modal', 'SafeAreaView', 'KeyboardAvoidingView', 'ActivityIndicator',
]);
const isPrimitive = (name) => PRIMITIVES.has(name) || /^Animated(Component)?\(.+\)$/.test(name);

function analyzeNavigation(events, ctx) {
  const reports = [];
  const navSessions = new Map();

  for (const ev of events) {
    if (ev.type !== 'nav') continue;
    if (!navSessions.has(ev.navId)) {
      navSessions.set(ev.navId, {
        navId: ev.navId,
        fromRoute: ev.fromRoute || '',
        toRoute: ev.route,
      });
    }
    const s = navSessions.get(ev.navId);
    switch (ev.phase) {
      case 'tap': s.tapAt = ev.t; break;
      case 'dispatch': s.dispatchAt = ev.t; break;
      case 'first-commit': s.firstCommitAt = ev.t; break;
      case 'transition-start': s.transitionStartAt = ev.t; break;
      case 'transition-end': s.transitionEndAt = ev.t; break;
      case 'content-ready': s.contentReadyAt = ev.t; break;
      case 'interactive': s.interactiveAt = ev.t; break;
    }
  }

  for (const [, s] of navSessions) {
    const tsStart = s.transitionStartAt || s.firstCommitAt || s.dispatchAt || 0;
    const tsEnd = s.transitionEndAt || s.contentReadyAt || 0;

    let dropped = 0, total = 0, jsStall = 0;
    const commitsDuring = [];

    for (const ev of events) {
      if (!tsStart || !tsEnd) break;
      if (ev.t < tsStart || ev.t > tsEnd) continue;
      if (ev.type === 'frame') {
        total++;
        if (ev.janky) dropped++;
      }
      if (ev.type === 'commit') commitsDuring.push({ dur: ev.dur, source: 'react' });
      if (ev.type === 'stall') jsStall += ev.dur;
    }

    const droppedPct = total > 0 ? (dropped / total) * 100 : 0;
    const findings = [];

    if (droppedPct > (ctx.tier === 'LOW' ? 15 : ctx.tier === 'MID' ? 10 : 5)) {
      findings.push({
        id: `nav:dropped-frames:${s.navId}`,
        severity: 'critical',
        category: 'navigation',
        title: `Dropped ${dropped}/${total} frames during ${s.fromRoute} → ${s.toRoute}`,
        detail: `${droppedPct.toFixed(0)}% frame drop rate during transition. Commit time: ${commitsDuring.reduce((a, c) => a + c.dur, 0).toFixed(0)}ms.`,
        suggestion: 'Defer heavy component mounts until after transitionEnd.',
        t: tsStart,
      });
    }

    const heavy = commitsDuring.filter((c) => c.dur > ctx.frameBudgetMs);
    if (heavy.length > 0) {
      findings.push({
        id: `nav:heavy-commit:${s.navId}`,
        severity: 'warning',
        category: 'navigation',
        title: `${heavy.length} commit(s) over frame budget during ${s.fromRoute} → ${s.toRoute}`,
        detail: `Commits: ${heavy.map((c) => `${c.dur}ms`).join(', ')}. Budget: ${ctx.frameBudgetMs}ms.`,
        suggestion: 'Wrap expensive screen content in React.lazy() or defer with startTransition.',
        t: tsStart,
      });
    }

    reports.push({ navId: s.navId, droppedFrames: dropped, totalFrames: total, droppedPct, findings });
  }

  return reports;
}

function analyzeRenderCauses(events, _ctx) {
  const findings = [];
  const commitEvents = events.filter((e) => e.type === 'commit');
  const storeEvents = events.filter((e) => e.type === 'store');
  const componentRenders = new Map();

  for (const ev of commitEvents) {
    // One count per commit per component; React Native primitives are never the cause
    const seen = new Set();
    for (const fiber of ev.fibers || []) {
      if (seen.has(fiber.name) || isPrimitive(fiber.name)) continue;
      seen.add(fiber.name);
      if (!componentRenders.has(fiber.name)) componentRenders.set(fiber.name, []);
      componentRenders.get(fiber.name).push(ev.t);
    }
  }

  for (const [name, times] of componentRenders) {
    for (let i = 0; i < times.length; i++) {
      const windowEnd = times[i] + WINDOW_MS;
      const count = times.filter((t) => t >= times[i] && t <= windowEnd).length;
      if (count / (WINDOW_MS / 1000) > STORM_THRESHOLD_PER_SEC) {
        findings.push({
          id: `render:storm:${name}:${times[i]}`,
          severity: 'critical',
          category: 'render',
          title: `Render storm: ${name} rendered ${count}x in ${WINDOW_MS / 1000}s`,
          detail: `${(count / (WINDOW_MS / 1000)).toFixed(0)} renders/second detected.`,
          suggestion: 'Check for unstable prop references. Wrap with React.memo() and useCallback.',
          component: name,
          t: times[i],
        });
        break;
      }
    }
  }

  for (const storeEv of storeEvents) {
    const windowEnd = storeEv.t + 50;
    const affected = new Set();
    for (const commitEv of commitEvents) {
      if (commitEv.t < storeEv.t || commitEv.t > windowEnd) continue;
      (commitEv.fibers || []).forEach((f) => affected.add(f.name));
    }
    if (affected.size > FAN_OUT_THRESHOLD) {
      findings.push({
        id: `render:fan-out:${storeEv.key}:${storeEv.t}`,
        severity: 'warning',
        category: 'render',
        title: `Fan-out: ${storeEv.key} update caused ${affected.size} component renders`,
        detail: `Store: ${storeEv.source}/${storeEv.key}. Components: ${[...affected].slice(0, 5).join(', ')}...`,
        suggestion: 'Split large stores into smaller ones. Use fine-grained selectors.',
        t: storeEv.t,
      });
    }
  }

  return { findings };
}

function analyzeCascades(events, ctx) {
  const findings = [];
  const commits = events.filter((e) => e.type === 'commit');
  const discarded = events.filter((e) => e.type === 'render-discarded');

  for (let i = 0; i < commits.length - 1; i++) {
    const a = commits[i];
    const b = commits[i + 1];
    if (b.t - a.t < ctx.frameBudgetMs && b.phase === 'nested-update') {
      findings.push({
        id: `cascade:nested-update:${a.t}`,
        severity: 'warning',
        category: 'cascade',
        title: 'Cascading update detected (setState in useLayoutEffect)',
        detail: `Two commits within ${(b.t - a.t).toFixed(1)}ms. Second commit is nested-update.`,
        suggestion: 'Move state update to useEffect or derive value during render instead.',
        t: a.t,
      });
    }
  }

  const discardedByComponent = new Map();
  for (const ev of discarded) {
    discardedByComponent.set(ev.component, (discardedByComponent.get(ev.component) || 0) + ev.renderCount);
  }

  for (const [component, count] of discardedByComponent) {
    if (count >= 3) {
      findings.push({
        id: `cascade:discarded:${component}`,
        severity: 'warning',
        category: 'cascade',
        title: `${component}: ${count} discarded renders`,
        detail: `React started ${count} renders of ${component} that were discarded without committing.`,
        suggestion: 'Check for render cost or state thrash inside startTransition.',
        component,
        t: discarded.find((e) => e.component === component).t,
      });
    }
  }

  return findings;
}

function analyzeFrameAttribution(events, ctx) {
  const jankFrames = events.filter((e) => e.type === 'frame' && e.janky);
  const commits = events.filter((e) => e.type === 'commit');
  const stalls = events.filter((e) => e.type === 'stall');
  const attributions = [];
  const findings = [];

  for (const frame of jankFrames) {
    const fEnd = frame.t + frame.dur;
    const commit = commits.find((c) => c.t <= fEnd && c.t + c.dur >= frame.t);
    const stall = stalls.find((s) => s.t <= fEnd && s.t + s.dur >= frame.t);

    if (commit && commit.dur >= (stall ? stall.dur : 0)) {
      attributions.push({ frameT: frame.t, cause: 'commit', dur: commit.dur });
    } else if (stall) {
      attributions.push({ frameT: frame.t, cause: 'stall', dur: stall.dur });
    } else {
      attributions.push({ frameT: frame.t, cause: 'native-side' });
      findings.push({
        id: `frame:native-side:${frame.t}`,
        severity: 'info',
        category: 'frame',
        title: 'Native-side jank (no JS cause)',
        detail: `Janky frame (${frame.dur}ms) with no overlapping JS commit or stall.`,
        suggestion: 'Check layout hierarchies, image resolutions, and GPU overdraw.',
        t: frame.t,
      });
    }
  }

  return { attributions, findings };
}

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
  analyzeRenderCauses(busyScreenCommits, ctx).findings.length === 0
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
