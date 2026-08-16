const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RATE_LIMITS,
  callerKey,
  decideRateLimit,
  describeRetryAfter,
} = require('../src/lib/rateLimiter');

/*
 * The decision and the key are pure, so they are tested directly rather than
 * through a faked Firestore - the transaction around them is thin, and a fake
 * deep enough to exercise it would mostly test the fake.
 */

const MINUTE = 60 * 1000;
const NOW = 1755000000000;

test('a first call opens a window and is allowed', () => {
  const decision = decideRateLimit({ limit: 3, windowMs: MINUTE, nowMs: NOW });

  assert.equal(decision.allowed, true);
  assert.equal(decision.nextCount, 1);
  assert.equal(decision.nextWindowStartMs, NOW);
  assert.equal(decision.remaining, 2);
});

test('calls up to the limit are allowed and the last one leaves nothing', () => {
  const decision = decideRateLimit({
    windowStartMs: NOW,
    count: 2,
    limit: 3,
    windowMs: MINUTE,
    nowMs: NOW + 1000,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.nextCount, 3);
  assert.equal(decision.remaining, 0);
});

test('the call past the limit is denied', () => {
  const decision = decideRateLimit({
    windowStartMs: NOW,
    count: 3,
    limit: 3,
    windowMs: MINUTE,
    nowMs: NOW + 1000,
  });

  assert.equal(decision.allowed, false);
});

test('a denied call reports how long is left in the window, not the whole window', () => {
  const decision = decideRateLimit({
    windowStartMs: NOW,
    count: 5,
    limit: 3,
    windowMs: MINUTE,
    nowMs: NOW + 20000,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.retryAfterMs, 40000);
});

test('a denied call carries no counter to persist', () => {
  // Writing on rejection would let a blocked caller keep pushing their own
  // window forward, and costs a write exactly when someone is generating many.
  const decision = decideRateLimit({
    windowStartMs: NOW,
    count: 9,
    limit: 3,
    windowMs: MINUTE,
    nowMs: NOW + 1000,
  });

  assert.equal(decision.nextCount, undefined);
  assert.equal(decision.nextWindowStartMs, undefined);
});

test('the window resets once it has elapsed', () => {
  const decision = decideRateLimit({
    windowStartMs: NOW,
    count: 99,
    limit: 3,
    windowMs: MINUTE,
    nowMs: NOW + MINUTE,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.nextCount, 1);
  assert.equal(decision.nextWindowStartMs, NOW + MINUTE, 'window restarts at now');
});

test('a boundary call exactly on the window edge starts a new window', () => {
  const onEdge = decideRateLimit({
    windowStartMs: NOW, count: 3, limit: 3, windowMs: MINUTE, nowMs: NOW + MINUTE,
  });
  const justInside = decideRateLimit({
    windowStartMs: NOW, count: 3, limit: 3, windowMs: MINUTE, nowMs: NOW + MINUTE - 1,
  });

  assert.equal(onEdge.allowed, true);
  assert.equal(justInside.allowed, false);
});

test('a missing counter document behaves like a fresh window', () => {
  const decision = decideRateLimit({
    windowStartMs: 0, count: 0, limit: 1, windowMs: MINUTE, nowMs: NOW,
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.nextWindowStartMs, NOW);
});

test('a signed-in caller is keyed by uid, not by address', () => {
  // uid survives a change of network and cannot be spoofed - the token is
  // verified before the handler runs.
  const key = callerKey({
    auth: { uid: 'abc123' },
    rawRequest: { headers: { 'x-forwarded-for': '203.0.113.9' } },
  });

  assert.equal(key, 'uid:abc123');
});

test('an anonymous caller is keyed by the first x-forwarded-for entry', () => {
  // Google's front end appends the real client address first; the rest are
  // proxies and must not be treated as the caller.
  const key = callerKey({
    rawRequest: { headers: { 'x-forwarded-for': '203.0.113.9, 70.41.3.18' } },
  });

  assert.equal(key, 'ip:203.0.113.9');
});

test('a key never contains a slash, which Firestore forbids in a document id', () => {
  const key = callerKey({ rawRequest: { headers: { 'x-forwarded-for': '../../etc/passwd' } } });

  assert.ok(!key.includes('/'));
  assert.equal(key, 'ip:.._.._etc_passwd');
});

test('an anonymous caller with no address at all still gets a key', () => {
  assert.equal(callerKey({}), 'ip:unknown');
  assert.equal(callerKey(null), 'ip:unknown');
});

test('the wait is phrased in a unit a person would use', () => {
  assert.equal(describeRetryAfter(1000), '1 second');
  assert.equal(describeRetryAfter(45000), '45 seconds');
  assert.equal(describeRetryAfter(5 * MINUTE), '5 minutes');
  assert.equal(describeRetryAfter(90 * MINUTE), '2 hours');
});

test('the unauthenticated endpoints are the tightly limited ones', () => {
  // These are the only surface a stranger can reach, and one of them is an
  // account-existence oracle.
  assert.ok(RATE_LIMITS.checkUserExistsByEmail.limit <= 20);
  assert.ok(RATE_LIMITS.sendPasswordResetEmail.limit <= 10);

  // Toggling is the hot path and must stay far above real use.
  assert.ok(RATE_LIMITS.processOutletToggle.limit >= 60);
});

test('every policy names the action it is keyed under', () => {
  // The action becomes part of the Firestore document id, so a mismatch would
  // silently pool two endpoints into one counter.
  Object.entries(RATE_LIMITS).forEach(([name, policy]) => {
    assert.equal(policy.action, name, `${name} policy has action ${policy.action}`);
    assert.ok(policy.limit > 0);
    assert.ok(policy.windowMs > 0);
  });
});
