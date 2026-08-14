const test = require('node:test');
const assert = require('node:assert/strict');

const { isUncommandedStatusChange } = require('../src/lib/outletStatus');

/**
 * The Activity log's subtitle promises "every switch, wherever it came from",
 * and a power-cycle went straight past it. The ESP32 returns with both relays
 * open - correct, that is the module's default - but two outlets changed state
 * with nothing written, because only commands write history.
 */

test('a power-cycle that opens a live relay is an uncommanded change', () => {
  assert.equal(isUncommandedStatusChange({ status: 'on' }, 'off'), true);
});

test('an outlet reporting what we already recorded is not a change', () => {
  assert.equal(isUncommandedStatusChange({ status: 'on' }, 'on'), false);
  assert.equal(isUncommandedStatusChange({ status: 'off' }, 'off'), false);
});

test('a command in flight is not an uncommanded change', () => {
  // The toggle sets status immediately and marks it pending; telemetry keeps
  // reporting the old relay position until the device polls. That gap is the
  // normal case and must never be logged as a switch nobody asked for.
  const justToggled = { status: 'off', pendingStatus: 'off', pendingStatusUntilMs: 9e15 };

  assert.equal(isUncommandedStatusChange(justToggled, 'on'), false);
});

test('a command that was issued and never executed is left to its own reporting', () => {
  // The pending window has lapsed, so resolveOutletStatus stops overriding. That
  // is a failed command - handleDeviceCommandEmails and the push notification
  // already surface it - and logging it here too would report one failure twice
  // under two different names.
  const lapsed = { status: 'off', pendingStatus: 'off', pendingStatusUntilMs: 1 };

  assert.equal(isUncommandedStatusChange(lapsed, 'on'), false);
});

test('the first telemetry for an outlet is not a change', () => {
  assert.equal(isUncommandedStatusChange({}, 'off'), false);
  assert.equal(isUncommandedStatusChange(undefined, 'on'), false);
  assert.equal(isUncommandedStatusChange({ status: '' }, 'on'), false);
});

test('an unreadable reported status is ignored rather than guessed at', () => {
  assert.equal(isUncommandedStatusChange({ status: 'on' }, ''), false);
  assert.equal(isUncommandedStatusChange({ status: 'on' }, 'unknown'), false);
});

test('case and padding do not manufacture a change', () => {
  assert.equal(isUncommandedStatusChange({ status: 'ON' }, ' on '), false);
});
