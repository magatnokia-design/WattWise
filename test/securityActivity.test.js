import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeSecurityEvent,
  describeSecurityEvents,
  describeWhen,
  eventTimeMs,
  summariseSecurityEvents,
} from '../src/utils/securityActivity.js';

/*
 * `securityActivity.js` is a copy-rule file — byte-identical to the website's.
 * These tests exist in both repos so neither can drift the wording: two clients
 * describing the same security event differently would be worse than one of
 * them not showing it at all.
 */

const NOW = 1755000000000;
const at = (msAgo) => new Date(NOW - msAgo);

test('only the events a person cannot explain away are alerts', () => {
  // A log that treats everything as a threat teaches people to ignore it, and
  // then the one line that matters is ignored too.
  const alertTypes = ['device_auth_failed', 'device_transferred'];
  const calmTypes = ['device_linked', 'device_unlinked', 'rate_limit_exceeded'];

  alertTypes.forEach((type) => {
    assert.equal(describeSecurityEvent({ type, at: at(0) }).tone, 'alert', type);
  });
  calmTypes.forEach((type) => {
    assert.notEqual(describeSecurityEvent({ type, at: at(0) }).tone, 'alert', type);
  });
});

test('an unknown type still renders rather than blanking the row', () => {
  // The backend can add a type before the clients ship; a blank row would be
  // read as "nothing happened".
  const row = describeSecurityEvent({ type: 'something_new', at: at(0) });

  assert.ok(row.title.length > 0);
  assert.ok(row.body.length > 0);
  assert.equal(row.type, 'something_new');
});

test('the device id is surfaced, because "which unit" is the first question', () => {
  const row = describeSecurityEvent({
    type: 'device_auth_failed',
    at: at(0),
    detail: { deviceId: 'ESP32_ROOM_A' },
  });

  assert.equal(row.deviceId, 'ESP32_ROOM_A');
});

test('a Firestore Timestamp, a Date and millis all read the same', () => {
  const ms = NOW - 5000;

  assert.equal(eventTimeMs({ toMillis: () => ms }), ms);
  assert.equal(eventTimeMs({ toDate: () => new Date(ms) }), ms);
  assert.equal(eventTimeMs(new Date(ms)), ms);
  assert.equal(eventTimeMs(ms), ms);
  assert.equal(eventTimeMs(null), 0);
});

test('recent times are relative and old ones are dated', () => {
  // "Was that me, just now?" needs a relative time. "37 days ago" is a number
  // nobody converts, so past a week it becomes a date.
  assert.equal(describeWhen(at(30 * 1000), NOW), 'just now');
  assert.equal(describeWhen(at(5 * 60 * 1000), NOW), '5 minutes ago');
  assert.equal(describeWhen(at(3 * 60 * 60 * 1000), NOW), '3 hours ago');
  assert.equal(describeWhen(at(26 * 60 * 60 * 1000), NOW), 'yesterday');
  assert.equal(describeWhen(at(3 * 24 * 60 * 60 * 1000), NOW), '3 days ago');
  assert.ok(!describeWhen(at(40 * 24 * 60 * 60 * 1000), NOW).includes('ago'));
});

test('a clock skewed into the future reads as just now, not a negative age', () => {
  assert.equal(describeWhen(new Date(NOW + 60000), NOW), 'just now');
});

test('events come back newest first whatever order they arrive in', () => {
  const rows = describeSecurityEvents([
    { type: 'device_linked', at: at(60 * 60 * 1000) },
    { type: 'device_auth_failed', at: at(60 * 1000) },
    { type: 'device_unlinked', at: at(24 * 60 * 60 * 1000) },
  ], NOW);

  assert.deepEqual(rows.map((r) => r.type), [
    'device_auth_failed', 'device_linked', 'device_unlinked',
  ]);
});

test('an event with no usable time is dropped rather than shown undated', () => {
  const rows = describeSecurityEvents([
    { type: 'device_linked', at: at(1000) },
    { type: 'device_linked' },
    null,
  ], NOW);

  assert.equal(rows.length, 1);
});

test('the summary leads with what needs attention, not with the newest thing', () => {
  const withAlert = summariseSecurityEvents([
    { type: 'device_linked', at: at(1000) },
    { type: 'device_auth_failed', at: at(60 * 60 * 1000) },
  ], NOW);

  assert.equal(withAlert, '1 item to review');

  const calm = summariseSecurityEvents([{ type: 'device_linked', at: at(5 * 60 * 1000) }], NOW);
  assert.equal(calm, 'Last activity 5 minutes ago');

  assert.equal(summariseSecurityEvents([]), 'Nothing to report');
});
