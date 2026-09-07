const test = require('node:test');
const assert = require('node:assert/strict');

const { DEVICE_LOOKUP_FIELDS } = require('../src/lib/deviceSecurity');
const { buildDetachedOwnerFields } = require('../src/http/linkDeviceToAccount');

/*
 * One Hub, thirty respondents, five sessions.
 *
 * The beta protocol hands a single unit around a room, and each person pairs it
 * to their own account by scanning the label. Every pairing after the first is a
 * transfer, so the detach path below runs twenty-nine times in an afternoon -
 * more often than the link path it is attached to.
 *
 * What made that dangerous is that the damage is silent. `devices/{deviceId}`
 * is consulted first and always names exactly one owner, so a stale pointer on
 * a previous owner's document changes nothing while that document exists. It
 * only matters when the device document goes away - which one tap on Unlink
 * does - and at that moment `resolveUserByDeviceId` falls back to searching
 * user documents, finds several, and throws 409 for good. Re-pairing does not
 * clear it, because re-pairing never touches the accounts that were missed.
 *
 * So the invariant is not "the detach writes some fields". It is that the
 * detach clears EVERY field the fallback can match on. These tests are written
 * against `DEVICE_LOOKUP_FIELDS` itself rather than against a copied list, so
 * adding a fourth lookup field without clearing it fails here rather than in a
 * session.
 */

const STAMP = 'server-timestamp-sentinel';

const readPath = (object, dottedPath) =>
  dottedPath.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object);

test('the detach clears every field the fallback lookup can match on', () => {
  const detached = buildDetachedOwnerFields(STAMP);

  // Guards the guard: an empty or renamed list would make the loop below pass
  // by doing nothing at all.
  assert.ok(DEVICE_LOOKUP_FIELDS.length >= 3, 'lookup field list looks truncated');

  for (const fieldPath of DEVICE_LOOKUP_FIELDS) {
    const value = readPath(detached, fieldPath);
    assert.equal(
      value,
      null,
      `${fieldPath} is searched by resolveUserByDeviceId but the detach leaves it as ` +
        `${JSON.stringify(value)}. A previous owner still answers to this deviceId.`
    );
  }
});

test('device.deviceId specifically is nulled - this is the field that was missed', () => {
  // The regression, named on its own so a failure says what broke rather than
  // pointing at a loop. The old detach merged { active, unlinkedAt } into
  // `device`, and a merge leaves the keys it was not given untouched.
  const detached = buildDetachedOwnerFields(STAMP);

  assert.equal(detached.device.deviceId, null);
  assert.notEqual(
    Object.keys(detached.device).join(','),
    'active,unlinkedAt',
    'device map carries only the audit fields again - deviceId will survive the merge'
  );
});

test('a merge of the detach over a live profile leaves nothing matchable', () => {
  // Firestore merge semantics, applied by hand: top-level keys are replaced,
  // and a map value replaces only the keys it names. This is the step the
  // original bug turned on, so it is reproduced rather than assumed.
  const previousOwner = {
    uid: 'user-a',
    email: 'a@example.com',
    deviceId: 'ESP32_ROOM_A',
    deviceToken: 'tok-abcdefgh',
    device: {
      deviceId: 'ESP32_ROOM_A',
      token: 'tok-abcdefgh',
      linkedAt: 'earlier',
      active: true,
    },
  };

  const patch = buildDetachedOwnerFields(STAMP);
  const merged = {
    ...previousOwner,
    ...patch,
    device: { ...previousOwner.device, ...patch.device },
    esp32: { ...(previousOwner.esp32 || {}), ...patch.esp32 },
  };

  for (const fieldPath of DEVICE_LOOKUP_FIELDS) {
    assert.equal(readPath(merged, fieldPath), null, `${fieldPath} survived the merge`);
  }

  // Unrelated profile data is not collateral damage.
  assert.equal(merged.email, 'a@example.com');
  assert.equal(merged.device.linkedAt, 'earlier');
});

test('the account can still show that a Hub left it', () => {
  // Clearing the identifiers must not erase the fact of the unlink. A user
  // whose Hub was claimed by someone else should see that it went, not that
  // they never had one.
  const detached = buildDetachedOwnerFields(STAMP);

  assert.equal(detached.device.active, false);
  assert.equal(detached.device.unlinkedAt, STAMP);
});

test('both token fields and their rotation grace are cleared', () => {
  // deviceSecurity accepts a previous token for a 15 minute grace window after
  // a rotation. Left behind on a detached account it is a credential with a
  // timer on it, sitting on an account that no longer owns the hardware.
  const detached = buildDetachedOwnerFields(STAMP);

  assert.equal(detached.deviceToken, null);
  assert.equal(detached.previousDeviceToken, null);
  assert.equal(detached.previousDeviceTokenValidUntilMs, null);
  assert.equal(detached.device.token, null);
  assert.equal(detached.device.previousToken, null);
  assert.equal(detached.device.previousTokenValidUntilMs, null);
});

test('thirty transfers leave exactly one account holding the device', () => {
  // The session that motivated this. Each respondent claims the unit; every
  // earlier one is detached. Afterwards the fallback lookup must find one
  // match, not twenty-nine - one is resolvable, more than one is the 409.
  const accounts = Array.from({ length: 30 }, (_, i) => ({
    uid: `respondent-${i}`,
    deviceId: null,
    device: {},
    esp32: {},
  }));

  const claim = (index) => {
    accounts.forEach((account, i) => {
      if (i === index) {
        account.deviceId = 'ESP32_ROOM_A';
        account.device = { deviceId: 'ESP32_ROOM_A', token: 'tok-abcdefgh', active: true };
        return;
      }
      if (readPath(account, 'deviceId') || readPath(account, 'device.deviceId')) {
        const patch = buildDetachedOwnerFields(STAMP);
        Object.assign(account, patch, {
          device: { ...account.device, ...patch.device },
          esp32: { ...account.esp32, ...patch.esp32 },
        });
      }
    });
  };

  for (let i = 0; i < accounts.length; i += 1) claim(i);

  const matches = accounts.filter((account) =>
    DEVICE_LOOKUP_FIELDS.some((fieldPath) => readPath(account, fieldPath) === 'ESP32_ROOM_A')
  );

  assert.equal(matches.length, 1, 'more than one account still answers to the deviceId');
  assert.equal(matches[0].uid, 'respondent-29');
});
