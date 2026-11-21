/**
 * Unit tests for @rn-perf-kit/core, run against the real TypeScript source
 * (transpiled on load by scripts/ts-test-loader.js). No test framework needed.
 */

const assert = require('assert');
require('../../scripts/ts-test-loader');
const { RingBuffer, PerfClock, BudgetEngine } = require('@rn-perf-kit/core');

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

test('RingBuffer FIFO eviction when exceeding capacity, and counts what it evicted', () => {
  const buf = new RingBuffer({ capacity: 3 });
  for (let t = 1; t <= 4; t++) buf.push({ type: 'stall', t, dur: 1 }); // t=1 is evicted
  assert.deepStrictEqual(buf.query().map((e) => e.t), [2, 3, 4]);
  assert.strictEqual(buf.evicted, 1);
});

test('RingBuffer range filtering', () => {
  const buf = new RingBuffer({ capacity: 10 });
  for (let i = 0; i < 10; i++) buf.push({ type: 'stall', t: i * 100, dur: 1 });
  assert.deepStrictEqual(buf.query(200, 500).map((e) => e.t), [200, 300, 400, 500]);
});

test('PerfClock maps native timestamps onto the JS clock', () => {
  const clock = new PerfClock();
  clock.install(() => performance.now() + 1000); // native clock runs 1 s ahead
  const js = performance.now();
  assert.ok(Math.abs(clock.nativeToJs(js + 1000) - js) < 5);
  clock.uninstall();
});

test('BudgetEngine detects violations according to device tier', () => {
  const config = {
    navigation: { 'Home→Detail': { LOW: 600, MID: 350, HIGH: 250 } },
    minFps: { LOW: 45, MID: 55, HIGH: 58 },
  };
  assert.strictEqual(new BudgetEngine(config, 'LOW').check('navigation', 500, 'Home→Detail'), null);
  const violation = new BudgetEngine(config, 'HIGH').check('navigation', 300, 'Home→Detail');
  assert.notStrictEqual(violation, null);
  assert.strictEqual(violation.budget, 250);
  assert.strictEqual(violation.actual, 300);
  assert.notStrictEqual(new BudgetEngine(config, 'MID').check('fps', 50), null);
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
