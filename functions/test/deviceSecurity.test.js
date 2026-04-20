const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DeviceRequestError,
  parseIncomingTimestampMs,
  assertFreshTimestamp,
  parseMetric,
} = require('../src/lib/deviceSecurity');

test('parseIncomingTimestampMs converts unix seconds to milliseconds', () => {
  const seconds = 1713331200;
  assert.equal(parseIncomingTimestampMs(seconds), 1713331200000);
});

test('parseIncomingTimestampMs keeps millisecond timestamps', () => {
  const milliseconds = 1713331200123;
  assert.equal(parseIncomingTimestampMs(milliseconds), milliseconds);
});

test('parseIncomingTimestampMs rejects invalid values', () => {
  assert.ok(Number.isNaN(parseIncomingTimestampMs('not-a-number')));
});

test('assertFreshTimestamp accepts current timestamp', () => {
  const now = Date.now();
  assert.doesNotThrow(() => assertFreshTimestamp(now, now));
});

test('assertFreshTimestamp rejects stale timestamp', () => {
  const now = Date.now();
  const stale = now - 60000;

  assert.throws(
    () => assertFreshTimestamp(stale, now),
    (error) => error instanceof DeviceRequestError && error.statusCode === 400
  );
});

test('parseMetric returns null for out-of-range values', () => {
  assert.equal(parseMetric(-1, 0, 10), null);
  assert.equal(parseMetric(11, 0, 10), null);
});

test('parseMetric returns numeric value when valid', () => {
  assert.equal(parseMetric('7.5', 0, 10), 7.5);
});
