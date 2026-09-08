const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildReleasedDeviceFields,
  RELEASE_REASONS,
} = require('../src/utils/deviceRelease');

/*
 * Unlinking a Hub must let go of it, not destroy its pairing record.
 *
 * The rule for `create` on devices/{deviceId} can only ask that the writer
 * names themselves as owner - a security rule cannot check a device token,
 * because it cannot see a secret. A missing document is therefore a claimable
 * one, and `ESP32_ROOM_A` is printed in the capstone paper. Releasing keeps the
 * document, so `create` never applies and the window never opens.
 *
 * These are sentinel-shape tests, not Firestore tests. What they hold is the
 * one property the security rule depends on: the write must leave NO `userId`
 * behind. A null fails the rule; a string hands the device to whoever it names.
 */

// Stand-ins for the SDK sentinels. Distinct objects so a test cannot pass by
// accidentally comparing two nulls.
const DELETE_SENTINEL = { __sentinel: 'deleteField' };
const STAMP_SENTINEL = { __sentinel: 'serverTimestamp' };

test('userId is removed with the delete sentinel, never a value', () => {
  const fields = buildReleasedDeviceFields(DELETE_SENTINEL, STAMP_SENTINEL, RELEASE_REASONS.UNLINKED);

  assert.equal(fields.userId, DELETE_SENTINEL);
  assert.notEqual(fields.userId, null, 'null fails the rule - it is still a userId key');
  assert.equal(typeof fields.userId, 'object', 'a string here would hand the device away');
});

test('the release does not destroy the record', () => {
  // Nothing in the payload can delete the document; a merge of fields cannot.
  // This is the whole difference from the deleteDoc it replaced.
  const fields = buildReleasedDeviceFields(DELETE_SENTINEL, STAMP_SENTINEL, RELEASE_REASONS.UNLINKED);

  assert.ok(Object.keys(fields).length > 0);
  assert.equal(fields.active, false);
});

test('both tokens and the rotation grace are cleared', () => {
  // A released record is owned by nobody, so resolveUserByDeviceId returns
  // nothing and the token is never read. Cleared anyway: a credential should
  // not sit on a record no account is answerable for, and the previous-token
  // fields are a credential with a 15-minute timer on them.
  const fields = buildReleasedDeviceFields(DELETE_SENTINEL, STAMP_SENTINEL, RELEASE_REASONS.UNLINKED);

  assert.equal(fields.deviceToken, null);
  assert.equal(fields.previousDeviceToken, null);
  assert.equal(fields.previousDeviceTokenValidUntilMs, null);
  assert.equal(fields.tokenRotatedAtMs, null);
});

test('the record says it was let go, and why', () => {
  // deleteAccount writes releasedAt/releasedReason on its own release path.
  // Same field names, so both routes leave the same shape behind.
  const unlinked = buildReleasedDeviceFields(DELETE_SENTINEL, STAMP_SENTINEL, RELEASE_REASONS.UNLINKED);
  const replaced = buildReleasedDeviceFields(DELETE_SENTINEL, STAMP_SENTINEL, RELEASE_REASONS.REPLACED);

  assert.equal(unlinked.releasedAt, STAMP_SENTINEL);
  assert.equal(unlinked.releasedReason, 'unlinked_by_user');
  assert.equal(replaced.releasedReason, 'replaced_by_another_device');
});

test('the payload carries no secret', () => {
  // It is written to a document any future owner of this deviceId can read, so
  // check the VALUES rather than the key names - every token-ish field must be
  // null, and nothing else may hold a credential-shaped string.
  const fields = buildReleasedDeviceFields(DELETE_SENTINEL, STAMP_SENTINEL, RELEASE_REASONS.UNLINKED);

  for (const [key, value] of Object.entries(fields)) {
    if (/token/i.test(key)) {
      assert.equal(value, null, `${key} must be nulled, got ${JSON.stringify(value)}`);
    }
    if (typeof value === 'string') {
      assert.ok(
        value.length < 24,
        `${key} holds a long string (${value}) - credentials do not belong here`
      );
    }
  }
});

test('the two reasons are distinct and stable', () => {
  // They are written to a shared document and read by a human debugging a
  // pairing. Collapsing them into one would lose which path let the Hub go.
  assert.notEqual(RELEASE_REASONS.UNLINKED, RELEASE_REASONS.REPLACED);
  assert.equal(RELEASE_REASONS.UNLINKED, 'unlinked_by_user');
  assert.equal(RELEASE_REASONS.REPLACED, 'replaced_by_another_device');
});
