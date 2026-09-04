const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PENDING_STATUS_WINDOW_MS,
  resolveOutletStatus,
  isUncommandedStatusChange,
} = require('../src/lib/outletStatus');

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

/*
 * A slow device catching up is not the device acting on its own.
 *
 * A 35 s ack outlived the old 20 s pending window, so the marker lapsed, the
 * stored status reverted to what the device was still reporting, and the
 * device's eventual correct report was then logged as an uncommanded change.
 * One switch, two rows in the Activity log, the second blaming the hardware.
 */

test('a late report of the state we commanded is not an uncommanded change', () => {
  const previous = {
    status: 'on',                 // pending lapsed and reverted
    lastCommandedStatus: 'off',   // but this is what we asked for
  };

  assert.equal(isUncommandedStatusChange(previous, 'off'), false);
});

test('a device switching to something nobody asked for is still reported', () => {
  const previous = {
    status: 'off',
    lastCommandedStatus: 'off',
  };

  // The relay came back on by itself - a power cycle, a stuck contact.
  assert.equal(isUncommandedStatusChange(previous, 'on'), true);
});

test('with no command on record the old behaviour stands', () => {
  assert.equal(isUncommandedStatusChange({ status: 'on' }, 'off'), true);
  assert.equal(isUncommandedStatusChange({ status: 'off' }, 'off'), false);
});

test('the pending window covers a slow ack rather than expiring under it', () => {
  // 45 s, matching the point markStaleDeviceCommands gives up on a command.
  // Anything shorter lapses mid-flight on a lossy link.
  assert.ok(PENDING_STATUS_WINDOW_MS >= 45000);
});
