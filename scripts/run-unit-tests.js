/**
 * Unit tests against the REAL package sources (see ts-test-loader.js).
 * Run: node scripts/run-unit-tests.js   (build the CLI first for the CLI section:
 *      pnpm --filter @rn-perf-kit/cli build)
 */
const { ROOT, reactNativeStub } = require('./ts-test-loader');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const core = require('@rn-perf-kit/core');
const analyzers = require('@rn-perf-kit/analyzers');
const nav = require('@rn-perf-kit/navigation/src/nav-state');
const { installNavigationListeners } = require('@rn-perf-kit/navigation/src/withNavigationPerf');
const fh = require('@rn-perf-kit/react/src/fiber-hook');
const adapters = require('@rn-perf-kit/adapters');
const reporters = require('@rn-perf-kit/reporters');
const stall = require('@rn-perf-kit/native/src/stall-detector');

const { timeline, computeFrameStats, BudgetEngine } = core;
const ctx = { tier: 'MID', refreshRateHz: 60, frameBudgetMs: 16.7 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const fiberEv = (name, cause = 'parent-rerender', wasted = cause === 'parent-rerender') => ({ name, cause, actualDuration: 1, wasted });

// ── core ─────────────────────────────────────────────────────────────────────
test('frame stats: idle window reads full fps and is inactive', () => {
  const s = computeFrameStats([], 1000, 60);
  assert.deepStrictEqual([s.uiFps, s.active], [60, false]);
});
test('frame stats: 10 janky 50 ms frames at 60 Hz = 20 dropped, 40 fps', () => {
  const ev = Array.from({ length: 10 }, (_, i) => ({ type: 'frame', t: i * 50, dur: 50, janky: true }));
  const s = computeFrameStats(ev, 1000, 60);
  assert.deepStrictEqual([s.droppedFrames, s.uiFps], [20, 40]);
});
test('budget engine caps stored violations at 500', () => {
  const e = new BudgetEngine({ maxCommitDuration: 1 }, 'MID');
  for (let i = 0; i < 700; i++) e.check('commit', 5);
  assert.strictEqual(e.getViolations().length, 500);
});
test('timeline counts evicted events and can be resized', () => {
  timeline.enabled = true;
  timeline.setCapacity(5);
  for (let i = 0; i < 8; i++) timeline.mark(`m${i}`);
  assert.deepStrictEqual([timeline.size, timeline.evicted, timeline.capacity], [5, 3, 5]);
  timeline.setCapacity(20000);
});

// ── analyzers ────────────────────────────────────────────────────────────────
test('render storm: 68 Views in one commit is not a storm; ProductCard x80 is', () => {
  const busy = Array.from({ length: 20 }, (_, c) => ({ type: 'commit', t: c * 100, dur: 3, fibers: [...Array(68)].map(() => fiberEv('View')).concat(fiberEv('Screen', 'state-change')) }));
  assert.strictEqual(analyzers.analyzeRenderCauses(busy, ctx).findings.filter((f) => f.id.startsWith('render:storm')).length, 0);
  const storm = Array.from({ length: 80 }, (_, i) => ({ type: 'commit', t: i * 18, dur: 2, fibers: [fiberEv('ProductCard', 'unstable-reference', true)] }));
  assert.ok(analyzers.analyzeRenderCauses(storm, ctx).findings.some((f) => f.id.startsWith('render:storm:ProductCard')));
});
test('wasted renders, unstable props and selector instability produce findings', () => {
  const commits = Array.from({ length: 30 }, (_, i) => ({
    type: 'commit', t: i * 100, dur: 2,
    fibers: [fiberEv('Row'), fiberEv('Row'), fiberEv('Card', 'unstable-reference', true), fiberEv('CartBadge', 'unstable-selector', true)],
  }));
  const { findings, stats } = analyzers.analyzeRenderCauses(commits, ctx);
  const ids = findings.map((f) => f.id);
  assert.strictEqual(stats.wastedFibers, 120);
  assert.ok(ids.includes('render:wasted'), ids.join());
  assert.ok(ids.includes('render:unstable-reference:Card'), ids.join());
  assert.ok(ids.includes('render:selector-instability:CartBadge'), ids.join());
});
test('fan-out counts store-subscribed renders only', () => {
  const fibers = [...Array(20)].map((_, i) => fiberEv(`Unrelated${i}`)).concat([fiberEv('CartIcon', 'store-subscription', false)]);
  const events = [{ type: 'store', t: 0, source: 'zustand', key: 'items' }, { type: 'commit', t: 5, dur: 4, fibers }];
  assert.strictEqual(analyzers.analyzeRenderCauses(events, ctx).findings.filter((f) => f.id.startsWith('render:fan-out')).length, 0);
});
test('native-side jank: one finding per episode, not per frame', () => {
  const frames = Array.from({ length: 40 }, (_, i) => ({ type: 'frame', t: i * 30, dur: 30, janky: true }));
  frames.push({ type: 'frame', t: 5000, dur: 40, janky: true });
  const f = analyzers.analyzeFrameAttribution(frames, ctx).findings;
  assert.strictEqual(f.length, 2);
  assert.match(f[0].detail, /^40 janky frames/);
});
test('suspense thrash: 3 fallbacks within 2 s is reported', () => {
  const ev = [0, 400, 800].flatMap((t) => [
    { type: 'suspense', t, boundary: 'Feed', showingFallback: true },
    { type: 'suspense', t: t + 200, boundary: 'Feed', showingFallback: false },
  ]);
  assert.ok(analyzers.analyzeCascades(ev, ctx).some((f) => f.id === 'cascade:suspense-thrash:Feed'));
  assert.strictEqual(analyzers.analyzeCascades(ev.slice(0, 4), ctx).length, 0);
});
test('navigation analyzer judges tab switches up to "interactive"', () => {
  const ev = [
    { type: 'nav', t: 1000, phase: 'dispatch', route: 'B', fromRoute: 'A', navId: 'n' },
    ...Array.from({ length: 20 }, (_, i) => ({ type: 'frame', t: 1010 + i * 16, dur: 40, janky: true })),
    { type: 'nav', t: 1400, phase: 'interactive', route: 'B', fromRoute: 'A', navId: 'n' },
  ];
  const [r] = analyzers.analyzeNavigation(ev, ctx);
  assert.strictEqual(r.totalFrames, 20);
  assert.ok(r.findings.some((f) => f.id.startsWith('nav:dropped-frames')));
});

// ── fiber hook ───────────────────────────────────────────────────────────────
fh.installFiberHook();
const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
function F(tag, type, o = {}) {
  return { tag, type, key: null, memoizedProps: o.props ?? {}, memoizedState: o.state ?? null, pendingProps: null, flags: o.flags ?? 0, alternate: null, dependencies: null, child: null, sibling: null, return: null, actualDuration: o.dur };
}
function link(parent, kids) {
  parent.child = kids[0] ?? null;
  kids.forEach((k, i) => { k.sibling = kids[i + 1] ?? null; k.return = parent; });
}
function rootWith(kids, dur = 3) {
  const root = F(3, null, { dur }); root.alternate = F(3, null); link(root, kids); return { current: root };
}
const commits = () => timeline.query().filter((e) => e.type === 'commit');
function Overlay() {} Overlay.__rnPerfKitIgnore = true;
function App() {}
function Badge() {}

test('fiber hook: overlay-only commits are dropped, real ones kept', async () => {
  timeline.clear(); fh.setFiberHookEnabled(true, true);
  const ov = F(0, Overlay, { flags: 1 }); ov.alternate = F(0, Overlay);
  hook.onCommitFiberRoot(1, rootWith([ov]));
  assert.strictEqual(commits().length, 0);
  await tick();
  const app = F(0, App, { flags: 1, props: { a: 1 } }); app.alternate = F(0, App, { props: { a: 1 } });
  hook.onCommitFiberRoot(1, rootWith([app]));
  assert.deepStrictEqual(commits().map((c) => c.fibers.map((f) => f.name)), [['App']]);
});
test('fiber hook: a commit inside the same task as the previous one is a nested-update', async () => {
  await tick(); timeline.clear(); fh.setFiberHookEnabled(true, false);
  const mk = () => { const a = F(0, App, { flags: 1 }); a.alternate = F(0, App); return rootWith([a]); };
  hook.onCommitFiberRoot(1, mk());
  hook.onCommitFiberRoot(1, mk()); // e.g. setState in useLayoutEffect
  await tick();
  hook.onCommitFiberRoot(1, mk()); // later task
  assert.deepStrictEqual(commits().map((c) => c.phase), ['update', 'nested-update', 'update']);
  await tick();
  assert.ok(analyzers.analyzeCascades(commits().slice(0, 2), ctx).some((f) => f.id.startsWith('cascade:nested-update')));
});
test('fiber hook: store-driven renders vs unstable selectors', async () => {
  await tick(); timeline.clear(); fh.setFiberHookEnabled(true, true);
  const storeHook = (value) => ({ memoizedState: value, queue: { getSnapshot: () => value }, next: null });
  const make = (prevVal, nextVal) => {
    const b = F(0, Badge, { flags: 1, state: storeHook(nextVal) });
    b.alternate = F(0, Badge, { state: storeHook(prevVal) });
    b.memoizedProps = b.alternate.memoizedProps;
    return rootWith([b]);
  };
  hook.onCommitFiberRoot(1, make({ count: 1 }, { count: 2 }));
  await tick();
  hook.onCommitFiberRoot(1, make({ count: 2 }, { count: 2 })); // new object, same contents
  const causes = commits().map((c) => c.fibers[0].cause);
  assert.deepStrictEqual(causes, ['store-subscription', 'unstable-selector']);
  assert.strictEqual(commits()[1].fibers[0].wasted, true);
});
test('fiber hook: Suspense boundary switching to fallback is recorded', async () => {
  await tick(); timeline.clear(); fh.setFiberHookEnabled(true, true);
  function Feed() {}
  const feed = F(0, Feed, { flags: 1 }); feed.alternate = F(0, Feed);
  const sus = F(13, null, { state: { dehydrated: null } }); sus.alternate = F(13, null, { state: null });
  link(feed, [sus]);
  hook.onCommitFiberRoot(1, rootWith([feed]));
  const s = timeline.query().filter((e) => e.type === 'suspense');
  assert.deepStrictEqual(s.map((e) => [e.boundary, e.showingFallback]), [['Feed', true]]);
  fh.setFiberHookEnabled(false);
});

// ── navigation ───────────────────────────────────────────────────────────────
function fakeContainer() {
  const listeners = {};
  let route = null;
  return {
    addListener(type, cb) { (listeners[type] ??= []).push(cb); return () => {}; },
    getCurrentRoute: () => route,
    go(r) { (listeners.__unsafe_action__ ?? []).forEach((cb) => cb({})); route = r; (listeners.state ?? []).forEach((cb) => cb({})); },
    event(type, target) { (listeners.__unsafe_event__ ?? []).forEach((cb) => cb({ data: { type, target, data: { closing: false } } })); },
  };
}
test('navigation: stack push records every phase, ending at interactive', async () => {
  timeline.clear(); timeline.enabled = true;
  const c = fakeContainer();
  installNavigationListeners(c);
  c.go({ key: 'home-1', name: 'Home' });
  await sleep(300);
  c.go({ key: 'detail-1', name: 'Detail' });
  c.event('transitionStart', 'detail-1');
  timeline.add({ type: 'commit', t: timeline.now(), dur: 12, fibers: [] });
  timeline.mark('screen:ready:Detail', { ttfr: 5 });
  await sleep(100);
  c.event('transitionEnd', 'home-1'); // covered screen: ignored
  c.event('transitionEnd', 'detail-1');
  await sleep(320);
  const phases = timeline.query().filter((e) => e.type === 'nav' && e.route === 'Detail').map((e) => e.phase);
  assert.deepStrictEqual(phases, ['tap', 'dispatch', 'transition-start', 'first-commit', 'content-ready', 'transition-end', 'interactive']);
});
test('navigation: same route name with a new key is a new navigation', async () => {
  timeline.clear();
  const c = fakeContainer();
  installNavigationListeners(c);
  c.go({ key: 'fund-a', name: 'Fund' });
  await sleep(300);
  c.go({ key: 'fund-b', name: 'Fund' });
  await sleep(300);
  const dispatches = timeline.query().filter((e) => e.type === 'nav' && e.phase === 'dispatch');
  assert.deepStrictEqual(dispatches.map((e) => `${e.fromRoute}->${e.route}`), ['->Fund', 'Fund->Fund']);
});
test('navigation: tab switch (no transition) ends at interactive = last commit, not the wait', async () => {
  nav.endNavSession(); timeline.clear(); timeline.enabled = true;
  const c = fakeContainer();
  installNavigationListeners(c);
  c.go({ key: 'tab-goals', name: 'goals' });
  const commitEnd = timeline.now() + 20;
  timeline.add({ type: 'commit', t: timeline.now(), dur: 20, fibers: [] });
  await sleep(600);
  assert.ok(nav.getActiveNavSession(), 'still waiting for a possible stack transition');
  await sleep(1700);
  const interactive = timeline.query().find((e) => e.type === 'nav' && e.phase === 'interactive');
  assert.ok(interactive, 'closed after the grace period');
  assert.ok(Math.abs(interactive.t - commitEnd) < 5, `interactive at last commit end, got +${interactive.t - commitEnd}ms`);
});
test('navigation: a transition starting late (after the settle window) is still recorded', async () => {
  nav.endNavSession(); timeline.clear();
  const c = fakeContainer();
  installNavigationListeners(c);
  c.go({ key: 'detail-9', name: 'Detail' });
  timeline.add({ type: 'commit', t: timeline.now(), dur: 5, fibers: [] });
  await sleep(400); // slower than SETTLE_MS, as on the emulator
  c.event('transitionStart', 'detail-9');
  await sleep(150);
  c.event('transitionEnd', 'detail-9');
  await sleep(300);
  const phases = timeline.query().filter((e) => e.type === 'nav').map((e) => e.phase);
  assert.deepStrictEqual(phases.slice(-3), ['transition-start', 'transition-end', 'interactive']);
});
test('navigation: nothing is tracked while the timeline is disabled', async () => {
  nav.endNavSession(); timeline.clear(); timeline.enabled = false;
  const c = fakeContainer();
  installNavigationListeners(c);
  c.go({ key: 'x', name: 'X' });
  assert.strictEqual(nav.getActiveNavSession(), null);
  timeline.enabled = true;
});

// ── native: stall detector ───────────────────────────────────────────────────
test('stall detector ignores time spent in the background', async () => {
  timeline.clear(); timeline.enabled = true;
  stall.startStallDetector();
  await sleep(120);
  reactNativeStub.__setAppState('background');
  await sleep(400); // JS timers would be paused here on a device
  reactNativeStub.__setAppState('active');
  await sleep(150);
  stall.stopStallDetector();
  const big = timeline.query().filter((e) => e.type === 'stall' && e.dur > 200);
  assert.strictEqual(big.length, 0, JSON.stringify(big));
});

// ── adapters ─────────────────────────────────────────────────────────────────
test('zustand adapter forwards replace=true', () => {
  let state = { a: 1, b: 2 };
  const set = (p, replace) => { const next = typeof p === 'function' ? p(state) : p; state = replace ? next : { ...state, ...next }; };
  const creator = adapters.zustandPerf('s', (setFn) => ({ ...state, reset: () => setFn({ a: 0 }, true) }));
  creator(set, () => state, {}).reset();
  assert.deepStrictEqual(state, { a: 0 });
});
test('query keys and URL paths are redacted by default', () => {
  assert.strictEqual(adapters.defaultQueryKeyFormat({ queryHash: 'x', queryKey: ['portfolioScore', '9818329098', 'self', null] }), 'portfolioScore(+3)');
  assert.strictEqual(adapters.redactUrl('https://api.example.com/v1/users/9818329098/accounts/3f2b8c1e-0a4d-4f6e-9b7a-1c2d3e4f5a6b?token=abc'), 'https://api.example.com/v1/users/:id/accounts/:id?[redacted]');
  assert.strictEqual(adapters.redactUrl('/api/me/goals'), '/api/me/goals');
});

// ── reporters ────────────────────────────────────────────────────────────────
test('perfetto trace includes memory, thermal, PerfTrace and perf.start() slices', () => {
  const trace = JSON.parse(reporters.generatePerfettoTrace([
    { type: 'memory', t: 10, usedMb: 300, availableMb: 900 },
    { type: 'thermal', t: 20, status: 'severe' },
    { type: 'trace', t: 30, dur: 5, id: 'FeedList', phase: 'update' },
    { type: 'mark', t: 50, name: 'parse:start' },
    { type: 'mark', t: 80, name: 'parse:end', data: { dur: 30 } },
  ])).traceEvents.filter((e) => e.ph !== 'M');
  assert.deepStrictEqual(trace.map((e) => `${e.ph}:${e.name}`), ['C:memory (MB)', 'i:thermal:severe', 'X:trace:FeedList', 'X:parse']);
  assert.strictEqual(trace[3].ts, 50000);
});
test('JSON report carries wasted renders and evicted-event count', () => {
  timeline.clear();
  timeline.add({ type: 'commit', t: timeline.now(), dur: 2, fibers: [fiberEv('Row'), fiberEv('Hdr', 'state-change')] });
  const r = reporters.generateJsonReport();
  assert.deepStrictEqual([r.summary.wastedRenders, r.summary.evictedEvents], [1, 0]);
});

// ── packaging ────────────────────────────────────────────────────────────────
test('rn-perf-kit exports ./package.json (React Native iOS codegen resolves it)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/perf-provider/package.json'), 'utf8'));
  assert.strictEqual(pkg.exports['./package.json'], './package.json');
  assert.ok(pkg.codegenConfig, 'codegenConfig present');
});
test('iOS module uses __typeof (plain typeof does not compile in Objective-C++)', () => {
  const mm = fs.readFileSync(path.join(ROOT, 'packages/perf-provider/ios/RnPerfKit.mm'), 'utf8');
  assert.ok(!/[^_]typeof\(/.test(mm));
});

// ── CLI ──────────────────────────────────────────────────────────────────────
const CLI = path.join(ROOT, 'packages/cli/dist/cli.js');
const cli = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8', cwd: ROOT });
test('cli check reads the budgets file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnperf-'));
  const session = path.join(dir, 's.json');
  const base = { version: '1', device: { tier: 'LOW', refreshRateHz: 60 }, findings: [], summary: {} };
  fs.writeFileSync(session, JSON.stringify({ ...base, events: [
    { type: 'mark', t: 1, name: 'startup', data: { durMs: 4000 } },
    { type: 'mark', t: 2, name: 'screen:ready:Home', data: { ttfr: 900 } },
    { type: 'commit', t: 3, dur: 50, fibers: [] },
  ] }));
  const r = cli('check', '--budgets', 'perf.config.ts', '--report', session);
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  for (const s of ['[startup] 4000ms > budget 3000ms', '[commit] 1 commit(s) 50ms > budget 32ms']) assert.ok(r.stderr.includes(s), r.stderr);
  assert.ok(!r.stderr.includes('[screen]'), 'Home 900ms is within the LOW budget of 1200ms');
  fs.writeFileSync(session, JSON.stringify({ ...base, events: [{ type: 'mark', t: 2, name: 'screen:ready:Home', data: { ttfr: 900 } }] }));
  assert.strictEqual(cli('check', '--budgets', 'perf.config.ts', '--report', session).status, 0);
});
test('cli compare fails on regressions and ignores timestamps in finding ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rnperf-'));
  const w = (n, o) => { const p = path.join(dir, n); fs.writeFileSync(p, JSON.stringify(o)); return p; };
  const f = (t) => ({ id: `render:storm:Card:${t}`, severity: 'critical', title: 'storm' });
  const a = w('a.json', { summary: { jankPct: 5 }, findings: [f(100)] });
  assert.strictEqual(cli('compare', a, w('b.json', { summary: { jankPct: 6 }, findings: [f(999)] })).status, 0);
  assert.strictEqual(cli('compare', a, w('c.json', { summary: { jankPct: 12 }, findings: [] })).status, 1);
  assert.strictEqual(cli('compare', a, w('d.json', { summary: { jankPct: 5 }, findings: [f(1), { id: 'nav:x:1', severity: 'warning' }] })).status, 1);
});
test('cli html writes a report; unknown commands exit 1', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rnperf-')), 'r.html');
  const r = cli('html', 'session.json', '--output', out);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(out, 'utf8'), /<html/i);
  assert.strictEqual(cli('frobnicate').status, 1);
  assert.strictEqual(cli('--help').status, 0);
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${t.name}\n    ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n    ')}`);
    }
  }
  console.log(`\nUnit tests: ${tests.length - failed} passed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
})();
