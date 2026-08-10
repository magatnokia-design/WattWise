const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getManilaTimeString,
  getManilaWeekday,
  getManilaHour,
  getManilaDateKey,
  getManilaDayBounds,
  getManilaPreviousDateKey,
  getDaysInManilaMonth,
} = require('../src/lib/manilaTime');

test('getManilaTimeString converts UTC to Manila wall clock', () => {
  // 07:00 UTC is 15:00 in Manila - the exact 8h skew that fired schedules late.
  assert.equal(getManilaTimeString(new Date('2026-08-10T07:00:00Z')), '15:00');
  assert.equal(getManilaTimeString(new Date('2026-08-09T23:00:00Z')), '07:00');
  assert.equal(getManilaTimeString(new Date('2026-08-09T16:00:00Z')), '00:00');
});

test('getManilaWeekday uses the Manila date, not the UTC date', () => {
  // 20:00 Sunday UTC is already 04:00 Monday in Manila.
  assert.equal(getManilaWeekday(new Date('2026-08-09T20:00:00Z')), 1);
  // 02:00 Monday UTC is 10:00 Monday in Manila.
  assert.equal(getManilaWeekday(new Date('2026-08-10T02:00:00Z')), 1);
  // 15:00 Sunday UTC is still 23:00 Sunday in Manila.
  assert.equal(getManilaWeekday(new Date('2026-08-09T15:00:00Z')), 0);
});

test('getManilaHour converts to Manila hours', () => {
  assert.equal(getManilaHour(new Date('2026-08-10T07:00:00Z')), 15);
  assert.equal(getManilaHour(new Date('2026-08-09T16:30:00Z')), 0);
});

test('getManilaDateKey rolls over at Manila midnight', () => {
  assert.equal(getManilaDateKey(new Date('2026-08-09T15:59:59Z')), '2026-08-09');
  assert.equal(getManilaDateKey(new Date('2026-08-09T16:00:00Z')), '2026-08-10');
});

test('getManilaPreviousDateKey returns yesterday in Manila terms', () => {
  // The rollup cron fires at Manila midnight Aug 10 == 16:00 UTC Aug 9,
  // and must roll up Manila Aug 9.
  assert.equal(getManilaPreviousDateKey(new Date('2026-08-09T16:00:00Z')), '2026-08-09');
  assert.equal(getManilaPreviousDateKey(new Date('2026-08-10T02:00:00Z')), '2026-08-09');
});

test('getManilaDayBounds spans the correct 24h UTC window', () => {
  const bounds = getManilaDayBounds('2026-08-09');

  assert.ok(bounds);
  assert.equal(bounds.start.toISOString(), '2026-08-08T16:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-08-09T15:59:59.999Z');
  assert.equal(bounds.end.getTime() - bounds.start.getTime(), (24 * 60 * 60 * 1000) - 1);
});

test('getManilaDayBounds rejects malformed keys', () => {
  assert.equal(getManilaDayBounds(''), null);
  assert.equal(getManilaDayBounds('not-a-date'), null);
  assert.equal(getManilaDayBounds(null), null);
});

test('a Manila-midnight event lands in the right day bucket', () => {
  // 00:30 Manila on Aug 9 is 16:30 UTC on Aug 8. Under the old UTC-based logic
  // this fell into the Aug 8 bucket; it belongs to Manila Aug 9.
  const event = new Date('2026-08-08T16:30:00Z');
  const bounds = getManilaDayBounds('2026-08-09');

  assert.equal(getManilaDateKey(event), '2026-08-09');
  assert.ok(event >= bounds.start && event <= bounds.end);
});

test('getDaysInManilaMonth handles month lengths and leap years', () => {
  assert.equal(getDaysInManilaMonth('2026-08-09'), 31);
  assert.equal(getDaysInManilaMonth('2026-02-01'), 28);
  assert.equal(getDaysInManilaMonth('2028-02-01'), 29);
  assert.equal(getDaysInManilaMonth('2026-04-15'), 30);
});
