const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveLogPower } = require('../src/lib/historyLog');

test('a switch-off records the draw measured just before it', () => {
  assert.equal(resolveLogPower(false, { power: 61.2 }), 61.2);
});

test('a switch-on never records a wattage, however stale telemetry is', () => {
  // The regression. `power` here is the reading from before the *previous*
  // switch-off, because the device has not posted a zero yet. It described an
  // outlet that was not drawing.
  assert.equal(resolveLogPower(true, { power: 14.9 }), 0);
});

test('an off with nothing drawing records zero, not a stale figure', () => {
  assert.equal(resolveLogPower(false, { power: 0 }), 0);
});

test('missing, null and unparseable readings all fall to zero', () => {
  assert.equal(resolveLogPower(false, {}), 0);
  assert.equal(resolveLogPower(false, { power: null }), 0);
  assert.equal(resolveLogPower(false, { power: 'unknown' }), 0);
  assert.equal(resolveLogPower(false, { power: NaN }), 0);
  assert.equal(resolveLogPower(false, undefined), 0);
});

test('a negative reading is not passed through as a negative wattage', () => {
  assert.equal(resolveLogPower(false, { power: -3 }), 0);
});

test('numeric strings from older documents still resolve', () => {
  assert.equal(resolveLogPower(false, { power: '48.5' }), 48.5);
});
