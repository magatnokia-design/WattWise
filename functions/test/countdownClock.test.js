const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toMillis,
  countdownRemainingSeconds,
  countdownHasExpired,
} = require('../src/lib/countdownClock');

/*
 * checkScheduledTimers had no test of any kind, and this is the arithmetic it
 * switches mains outlets on. The pause fix on the clients rests entirely on
 * this function measuring from countdownDuration and countdownStartedAt and
 * nothing else, so the contract is pinned here.
 */

const NOW = 1788000000000;
const agoSeconds = (seconds) => new Date(NOW - seconds * 1000);

// A Firestore Timestamp is not a Date. The cron reads both.
const asTimestamp = (date) => ({ toDate: () => date });

// ------------------------------------------------------------------- toMillis

test('toMillis reads Firestore timestamps, Dates and strings', () => {
  const date = new Date(NOW);

  assert.equal(toMillis(asTimestamp(date)), NOW);
  assert.equal(toMillis(date), NOW);
  assert.equal(toMillis(date.toISOString()), NOW);
});

test('toMillis answers 0 for anything unusable', () => {
  assert.equal(toMillis(null), 0);
  assert.equal(toMillis(undefined), 0);
  assert.equal(toMillis(''), 0);
  assert.equal(toMillis('not a date'), 0);
});

// ------------------------------------------------- countdownRemainingSeconds

test('a running countdown is measured from its start', () => {
  const schedule = { countdownDuration: 120, countdownStartedAt: agoSeconds(30) };
  assert.equal(countdownRemainingSeconds(schedule, NOW), 90);
});

test('it clamps at zero rather than going negative', () => {
  const schedule = { countdownDuration: 60, countdownStartedAt: agoSeconds(600) };
  assert.equal(countdownRemainingSeconds(schedule, NOW), 0);
});

test('a Firestore Timestamp works the same as a Date', () => {
  const schedule = { countdownDuration: 60, countdownStartedAt: asTimestamp(agoSeconds(20)) };
  assert.equal(countdownRemainingSeconds(schedule, NOW), 40);
});

test('createdAt is the fallback origin when no start was recorded', () => {
  const schedule = { countdownDuration: 90, createdAt: agoSeconds(30) };
  assert.equal(countdownRemainingSeconds(schedule, NOW), 60);
});

test('countdownStartedAt wins over createdAt', () => {
  // A resumed timer has a fresh countdownStartedAt and an old createdAt. Taking
  // createdAt here would spend the paused time all over again.
  const schedule = {
    countdownDuration: 30,
    createdAt: agoSeconds(3600),
    countdownStartedAt: agoSeconds(5),
  };

  assert.equal(countdownRemainingSeconds(schedule, NOW), 25);
});

test('an unreadable schedule is null, never zero', () => {
  // Zero would fire the outlet. Absent is not zero.
  assert.equal(countdownRemainingSeconds({}, NOW), null);
  assert.equal(countdownRemainingSeconds({ countdownDuration: 60 }, NOW), null);
  assert.equal(countdownRemainingSeconds({ countdownStartedAt: agoSeconds(5) }, NOW), null);
  assert.equal(countdownRemainingSeconds({ countdownDuration: 0, createdAt: agoSeconds(5) }, NOW), null);
  assert.equal(countdownRemainingSeconds(null, NOW), null);
});

test('a nonsense duration does not become a live timer', () => {
  assert.equal(countdownRemainingSeconds({ countdownDuration: -5, createdAt: agoSeconds(1) }, NOW), null);
  assert.equal(countdownRemainingSeconds({ countdownDuration: 'abc', createdAt: agoSeconds(1) }, NOW), null);
});

// ------------------------------------------------------------ the pause contract

test('a resumed timer gets its full remaining time back', () => {
  /*
   * The exact document the clients write on resume: countdownDuration set to
   * what was left, countdownStartedAt set to the moment of the tap.
   *
   * Before the fix the client wrote neither, so this function still measured
   * against the original start and returned 0 - the cron then switched the
   * outlet and told the user their countdown had finished.
   */
  const resumedAt = NOW;
  const resumed = {
    countdownDuration: 10,
    countdownStartedAt: new Date(resumedAt),
    createdAt: agoSeconds(3600),
  };

  assert.equal(countdownRemainingSeconds(resumed, resumedAt), 10, 'not fired on resume');
  assert.equal(countdownHasExpired(resumed, resumedAt), false);

  assert.equal(countdownRemainingSeconds(resumed, resumedAt + 9000), 1);
  assert.equal(countdownHasExpired(resumed, resumedAt + 9000), false);

  assert.equal(countdownHasExpired(resumed, resumedAt + 10000), true, 'fires 10s later');
});

test('the old pause shape is what fired early, and would still', () => {
  // Documents written before the fix carry the original start and full
  // duration. This is a regression pin: if someone reverts the client write,
  // this is the behaviour that returns.
  const stalePauseShape = {
    countdownDuration: 30,
    countdownStartedAt: agoSeconds(300),
  };

  assert.equal(countdownRemainingSeconds(stalePauseShape, NOW), 0);
  assert.equal(countdownHasExpired(stalePauseShape, NOW), true);
});

// -------------------------------------------------------- countdownHasExpired

test('an unreadable schedule has not expired', () => {
  assert.equal(countdownHasExpired({}, NOW), false);
  assert.equal(countdownHasExpired(null, NOW), false);
});

test('expiry is exactly the boundary, not a moment before', () => {
  const schedule = { countdownDuration: 60, countdownStartedAt: agoSeconds(59) };
  assert.equal(countdownHasExpired(schedule, NOW), false);

  const atBoundary = { countdownDuration: 60, countdownStartedAt: agoSeconds(60) };
  assert.equal(countdownHasExpired(atBoundary, NOW), true);
});
