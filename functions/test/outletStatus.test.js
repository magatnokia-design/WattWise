const test = require('node:test');
const assert = require('node:assert/strict');

const { PENDING_STATUS_WINDOW_MS, resolveOutletStatus } = require('../src/lib/outletStatus');

const NOW = 1000000;

test('with no pending toggle the device is the source of truth', () => {
  const result = resolveOutletStatus({ status: 'on' }, 'off', NOW);

  assert.equal(result.status, 'off');
  assert.equal(result.pendingHonoured, false);
  assert.equal(result.clearPending, false);
});

test('telemetry cannot undo a toggle the device has not polled for yet', () => {
  const result = resolveOutletStatus(
    { pendingStatus: 'on', pendingStatusUntilMs: NOW + PENDING_STATUS_WINDOW_MS },
    'off',
    NOW
  );

  assert.equal(result.status, 'on');
  assert.equal(result.pendingHonoured, true);
  assert.equal(result.clearPending, false);
});

test('once the device reports the requested state the override is dropped', () => {
  const result = resolveOutletStatus(
    { pendingStatus: 'on', pendingStatusUntilMs: NOW + PENDING_STATUS_WINDOW_MS },
    'on',
    NOW
  );

  assert.equal(result.status, 'on');
  assert.equal(result.clearPending, true);
  assert.equal(result.pendingHonoured, false);
});

test('an expired window stops overriding, so a failed command becomes visible', () => {
  const result = resolveOutletStatus(
    { pendingStatus: 'on', pendingStatusUntilMs: NOW - 1 },
    'off',
    NOW
  );

  assert.equal(result.status, 'off');
  assert.equal(result.clearPending, true);
});

test('a pending marker with no deadline is not trusted indefinitely', () => {
  const result = resolveOutletStatus({ pendingStatus: 'on' }, 'off', NOW);

  assert.equal(result.status, 'off');
  assert.equal(result.clearPending, true);
});

test('turning an outlet off is protected the same way as turning it on', () => {
  const result = resolveOutletStatus(
    { pendingStatus: 'off', pendingStatusUntilMs: NOW + PENDING_STATUS_WINDOW_MS },
    'on',
    NOW
  );

  assert.equal(result.status, 'off');
  assert.equal(result.pendingHonoured, true);
});
