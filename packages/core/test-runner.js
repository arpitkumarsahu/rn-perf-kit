/**
 * Self-contained unit test runner for @rn-perf-kit/core logic.
 * Runs in pure Node.js without requiring external test dependencies.
 */

const assert = require('assert');

// ── RingBuffer implementation under test ────────────────────────────────────
class RingBuffer {
  constructor(options = {}) {
    this.capacity = options.capacity ?? 10000;
    this.windowMs = options.windowMs ?? 60000;
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }

  push(event) {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  query(fromT, toT) {
    const results = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      const ev = this.buffer[idx];
      if (!ev) continue;
      if (fromT !== undefined && ev.t < fromT) continue;
      if (toT !== undefined && ev.t > toT) continue;
      results.push(ev);
    }
    return results;
  }

  recent(now) {
    return this.query(now - this.windowMs, now);
  }

  clear() {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(undefined);
  }

  get size() {
    return this.count;
  }
}

// ── Clock sync math under test ──────────────────────────────────────────────
class PerfClock {
  constructor() {
    this.syncState = null;
    this.nativeNow = null;
  }

  syncWith(js1, native, js2) {
    const jsMid = (js1 + js2) / 2;
    this.syncState = {
      offset: native - jsMid,
      errorMargin: (js2 - js1) / 2,
    };
  }

  nativeToJs(nativeMs) {
    if (!this.syncState) return nativeMs;
    return nativeMs - this.syncState.offset;
  }
}

// ── Budget engine under test ────────────────────────────────────────────────
class BudgetEngine {
  constructor(config, tier) {
    this.config = config;
    this.tier = tier;
    this.violations = [];
  }

  check(type, actual, budgetKey) {
    let budget = this.config[type];
    if (typeof budget === 'object' && budget !== null) {
      budget = budget[this.tier];
    }
    if (budget === undefined) return null;
    if (type !== 'fps' && actual <= budget) return null;
    if (type === 'fps' && actual >= budget) return null;

    const violation = { type, budget, actual, tier: this.tier, route: budgetKey };
    this.violations.push(violation);
    return violation;
  }
}

// ── Test Runner ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log('\nRunning @rn-perf-kit/core Unit Tests:');

test('RingBuffer stores and queries events in chronological order', () => {
  const buf = new RingBuffer({ capacity: 5 });
  buf.push({ type: 'stall', t: 100, dur: 10 });
  buf.push({ type: 'stall', t: 200, dur: 20 });
  buf.push({ type: 'stall', t: 300, dur: 30 });
  const events = buf.query();
  assert.strictEqual(events.length, 3);
  assert.strictEqual(events[0].t, 100);
  assert.strictEqual(events[2].t, 300);
});

test('RingBuffer FIFO eviction when exceeding capacity', () => {
  const buf = new RingBuffer({ capacity: 3 });
  buf.push({ type: 'stall', t: 1 });
  buf.push({ type: 'stall', t: 2 });
  buf.push({ type: 'stall', t: 3 });
  buf.push({ type: 'stall', t: 4 }); // should evict t=1
  const events = buf.query();
  assert.strictEqual(events.length, 3);
  assert.deepStrictEqual(events.map(e => e.t), [2, 3, 4]);
});

test('RingBuffer range filtering', () => {
  const buf = new RingBuffer({ capacity: 10 });
  for (let i = 0; i < 10; i++) buf.push({ type: 'stall', t: i * 100 });
  const slice = buf.query(200, 500);
  assert.deepStrictEqual(slice.map(e => e.t), [200, 300, 400, 500]);
});

test('PerfClock calculates offset and synchronizes native timestamps to JS timeline', () => {
  const clock = new PerfClock();
  // Simulated sync: js1=100, native=200, js2=102 -> jsMid=101 -> offset = 200 - 101 = 99
  clock.syncWith(100, 200, 102);
  const nativeTs = 300;
  // nativeToJs = 300 - 99 = 201
  const jsTs = clock.nativeToJs(nativeTs);
  assert.strictEqual(Math.round(jsTs), 201);
});

test('BudgetEngine detects violations according to device tier', () => {
  const config = {
    navigation: { LOW: 600, MID: 350, HIGH: 250 },
    fps: { LOW: 45, MID: 55, HIGH: 58 },
  };

  const lowEngine = new BudgetEngine(config, 'LOW');
  // actual 500ms <= 600ms budget for LOW -> no violation
  assert.strictEqual(lowEngine.check('navigation', 500, 'Home->Detail'), null);

  const highEngine = new BudgetEngine(config, 'HIGH');
  // actual 300ms > 250ms budget for HIGH -> violation!
  const violation = highEngine.check('navigation', 300, 'Home->Detail');
  assert.notStrictEqual(violation, null);
  assert.strictEqual(violation.budget, 250);
  assert.strictEqual(violation.actual, 300);
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
