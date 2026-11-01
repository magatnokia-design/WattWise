const test = require('node:test');
const assert = require('node:assert');

const { describeFailure } = require('../src/triggers/handleDeviceCommandEmails');

/**
 * A failed switch used to read 'The on command for outlet1 reported "timeout"'
 * with Reason manual_toggle / Source app / Device / Command ID underneath
 * (1 Nov 2026). It now says what happened and what to do, in plain words.
 */

test('a timeout says the Hub may be offline', () => {
  const copy = describeFailure({ status: 'timeout', action: 'on', outletNumber: 1 });
  assert.strictEqual(copy.title, "Outlet 1 didn't turn on");
  assert.match(copy.message, /Hub may be offline/);
});

test('the title follows the action and the outlet', () => {
  assert.strictEqual(
    describeFailure({ status: 'timeout', action: 'off', outletNumber: 2 }).title,
    "Outlet 2 didn't turn off",
  );
  assert.strictEqual(
    describeFailure({ status: 'failed', action: '', outletNumber: NaN }).title,
    "Your outlet didn't switch",
  );
});

test('a refused command does not blame the connection', () => {
  const copy = describeFailure({ status: 'rejected', action: 'on', outletNumber: 1 });
  assert.doesNotMatch(copy.message, /offline/);
});

test('no machinery words reach the reader', () => {
  ['timeout', 'failed', 'rejected'].forEach((status) => {
    const { title, message } = describeFailure({ status, action: 'on', outletNumber: 1 });
    assert.doesNotMatch(`${title} ${message}`, /timeout|rejected|command|manual_toggle|outlet1/);
  });
});
