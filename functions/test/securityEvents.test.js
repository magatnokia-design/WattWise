const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EVENT_TYPES,
  RETENTION_DAYS,
  buildSecurityEvent,
  recordSecurityEvent,
  sanitizeDetail,
} = require('../src/lib/securityEvents');

const NOW = 1755000000000;

/*
 * The sanitiser carries the weight here. A security log that writes down the
 * secret it is guarding, or quietly becomes a location history, is worse than
 * not having one - so those are tested as hard rules rather than as intentions.
 */

test('a field named like a secret is dropped whatever it holds', () => {
  const safe = sanitizeDetail({
    deviceId: 'ESP32_ROOM_A',
    deviceToken: 'abc123',
    password: 'hunter2',
    apiKey: 'AIza...',
    Authorization: 'Bearer x',
    refreshCredential: 'y',
  });

  assert.deepEqual(Object.keys(safe), ['deviceId']);
});

test('an address is stripped even when it arrives inside an allowed field', () => {
  // The privacy policy promises no behavioural profile, and a timestamped
  // address history is one. Filtering by key name alone would miss this.
  const safe = sanitizeDetail({
    reason: 'rejected from 203.0.113.9 after 5 tries',
    note: 'peer 2001:0db8:85a3:0000:0000:8a2e:0370:7334 refused',
  });

  assert.ok(!safe.reason.includes('203.0.113.9'));
  assert.ok(safe.reason.includes('[address removed]'));
  assert.ok(!safe.note.includes('2001:0db8'));
});

test('nested objects are dropped rather than walked', () => {
  // A recursive sanitiser is a recursive place for a secret to hide.
  const safe = sanitizeDetail({
    ok: 'kept',
    nested: { deviceToken: 'leaked' },
    list: ['a', 'b'],
  });

  assert.deepEqual(safe, { ok: 'kept' });
});

test('strings are capped and empty ones are omitted', () => {
  const safe = sanitizeDetail({ long: 'x'.repeat(500), blank: '' });

  assert.equal(safe.long.length, 200);
  assert.ok(!('blank' in safe));
});

test('numbers and booleans survive, junk does not', () => {
  const safe = sanitizeDetail({
    limit: 20,
    isTransfer: true,
    nan: NaN,
    infinite: Infinity,
    nothing: null,
    missing: undefined,
  });

  assert.deepEqual(safe, { limit: 20, isTransfer: true });
});

test('a non-object detail never throws', () => {
  assert.deepEqual(sanitizeDetail(null), {});
  assert.deepEqual(sanitizeDetail('a string'), {});
  assert.deepEqual(sanitizeDetail(['a']), {});
  assert.deepEqual(sanitizeDetail(undefined), {});
});

test('an event expires ninety days after it is written', () => {
  const event = buildSecurityEvent(EVENT_TYPES.DEVICE_LINKED, {}, NOW);

  assert.equal(RETENTION_DAYS, 90);
  assert.equal(event.at.getTime(), NOW);
  assert.equal(
    event.expireAt.getTime() - NOW,
    90 * 24 * 60 * 60 * 1000,
    'long enough to investigate, short enough not to be a habit record'
  );
});

test('an unknown event type is refused rather than written', async () => {
  // The type is the only thing anyone will query on; a typo would create a
  // category nothing ever looks at again.
  let wrote = false;
  const db = { collection: () => { wrote = true; return db; }, doc: () => db, add: async () => {} };

  const result = await recordSecurityEvent('uid1', 'not_a_real_type', {}, { db });

  assert.equal(result, false);
  assert.equal(wrote, false);
});

test('no user means no event, and no error', async () => {
  // An unregistered device or a reset for an address with no account genuinely
  // has no one to attribute the event to.
  assert.equal(await recordSecurityEvent(null, EVENT_TYPES.DEVICE_AUTH_FAILED), false);
  assert.equal(await recordSecurityEvent('', EVENT_TYPES.DEVICE_AUTH_FAILED), false);
});

test('a write failure is swallowed, because logging must not break the request', async () => {
  // This runs inside device authentication and rate limiting. An audit log that
  // can fail the thing it observes turns a logging outage into a service one.
  const db = {
    collection() { return this; },
    doc() { return this; },
    add: async () => { throw new Error('firestore unavailable'); },
  };

  const result = await recordSecurityEvent('uid1', EVENT_TYPES.DEVICE_AUTH_FAILED, {}, { db });

  assert.equal(result, false);
});

test('a good event lands under the user, not in a central collection', async () => {
  // It has to be deleted with the account: the privacy policy promises no copy
  // is kept, and a trail that outlives the erasure contradicts the erasure.
  const path = [];
  let written = null;

  const db = {
    collection(name) { path.push(name); return this; },
    doc(id) { path.push(id); return this; },
    async add(doc) { written = doc; },
  };

  const ok = await recordSecurityEvent(
    'uid1',
    EVENT_TYPES.DEVICE_AUTH_FAILED,
    { deviceId: 'ESP32_ROOM_A', deviceToken: 'should never appear' },
    { db, nowMs: NOW }
  );

  assert.equal(ok, true);
  assert.deepEqual(path, ['users', 'uid1', 'security_events']);
  assert.equal(written.type, EVENT_TYPES.DEVICE_AUTH_FAILED);
  assert.deepEqual(written.detail, { deviceId: 'ESP32_ROOM_A' });
  assert.ok(!JSON.stringify(written).includes('should never appear'));
});
