const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldRollUpUser, hasLinkedDevice } = require('../src/scheduled/processDailyRollup');

test('an account with no Hub and nothing measured is skipped', () => {
  // The reported bug: a brand-new account collected a history_daily row every
  // midnight, which fired the receipt trigger and told the user their daily
  // summary was ready before they owned any hardware.
  assert.equal(shouldRollUpUser({ userData: {}, totalEnergy: 0 }), false);
});

test('a paired Hub that measured nothing still gets its row', () => {
  // A zero day is a real day. Skipping it would put a hole in History for any
  // day the room sat empty.
  const userData = { deviceId: 'hub-001', device: { active: true } };

  assert.equal(shouldRollUpUser({ userData, totalEnergy: 0 }), true);
});

test('an unlinked account that measured energy that day still gets its row', () => {
  // A Hub detached at midday still measured the morning. That reading has to
  // land or the energy simply disappears from the month.
  assert.equal(
    shouldRollUpUser({ userData: { deviceId: null }, totalEnergy: 0.42 }),
    true
  );
});

test('an empty or whitespace deviceId does not count as paired', () => {
  assert.equal(hasLinkedDevice({ deviceId: '' }), false);
  assert.equal(hasLinkedDevice({ deviceId: '   ' }), false);
  assert.equal(hasLinkedDevice({}), false);
  assert.equal(hasLinkedDevice({ deviceId: null }), false);
});

test('a detached device is not treated as paired even if the id survives', () => {
  // The detach path clears deviceId, but a half-written detach that only
  // flipped the flag must not read as a live pairing.
  assert.equal(
    hasLinkedDevice({ deviceId: 'hub-001', device: { active: false } }),
    false
  );
});

test('a linked device with no active flag is treated as paired', () => {
  // Accounts linked before `device.active` was written carry the id alone.
  assert.equal(hasLinkedDevice({ deviceId: 'hub-001' }), true);
});

test('the guard is called with the day energy, not the lifetime counter', () => {
  // Guards against a negative or non-numeric energy silently reading as usage.
  assert.equal(shouldRollUpUser({ userData: {}, totalEnergy: -1 }), false);
  assert.equal(shouldRollUpUser({ userData: {}, totalEnergy: NaN }), false);
  assert.equal(shouldRollUpUser(), false);
});
