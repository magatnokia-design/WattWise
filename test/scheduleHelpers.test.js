import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countdownSecondsRemaining,
  describeTimerState,
  getLiveCountdownDisplay,
} from '../src/screens/Timer/utils/scheduleHelpers.js';

/*
 * These two functions shipped with no tests and took the Schedule screen down
 * with them. The crash was a bad import rather than bad logic, but the reason
 * nothing noticed is the same either way: nothing here had ever executed them.
 */

const NOW = 1788000000000;
const startedAgo = (seconds) => new Date(NOW - seconds * 1000);

// ---------------------------------------------------------- countdownSecondsRemaining

test('a running countdown counts down from when it started', () => {
  const item = { countdownDuration: 120, countdownStartedAt: startedAgo(30) };
  assert.equal(countdownSecondsRemaining(item, NOW), 90);
});

test('it never goes negative once the moment has passed', () => {
  const item = { countdownDuration: 60, countdownStartedAt: startedAgo(300) };
  assert.equal(countdownSecondsRemaining(item, NOW), 0);
});

test('countdownTime is the fallback, because every creation path writes it', () => {
  // The bug behind the NEXT UP drift: only one of the two paths in
  // scheduleService writes countdownDuration, so a timer made the other way
  // had to be read from countdownTime or it fell back to a stale server value.
  const item = { countdownTime: '00:02:00', countdownStartedAt: startedAgo(45) };
  assert.equal(countdownSecondsRemaining(item, NOW), 75);
});

test('with no start time it falls back to the stored remaining', () => {
  assert.equal(countdownSecondsRemaining({ countdownRemaining: 42 }, NOW), 42);
});

test('a malformed timer returns null rather than NaN', () => {
  assert.equal(countdownSecondsRemaining({}, NOW), null);
  assert.equal(countdownSecondsRemaining(null, NOW), null);
});

test('the banner and the card cannot disagree, because they share this', () => {
  // One timer, both readings, same instant.
  const item = { countdownTime: '00:01:00', countdownStartedAt: startedAgo(20) };

  assert.equal(countdownSecondsRemaining(item, NOW), 40);
  assert.equal(getLiveCountdownDisplay(item, NOW), '00:00:40');
});

// ------------------------------------------------------------------ describeTimerState

test('a running countdown says it is counting down', () => {
  const item = {
    type: 'countdown', active: true,
    countdownDuration: 120, countdownStartedAt: startedAgo(10),
  };

  const state = describeTimerState(item, NOW);
  assert.equal(state.tone, 'running');
  assert.match(state.label, /Counting down/);
});

test('at zero and still active it is waiting on the server, not stalled', () => {
  // checkScheduledTimers runs once a minute, so a countdown sits at 00:00:00
  // for up to sixty seconds before anything happens. "Active" read as broken.
  const item = {
    type: 'countdown', active: true,
    countdownDuration: 60, countdownStartedAt: startedAgo(90),
  };

  const state = describeTimerState(item, NOW);
  assert.equal(state.tone, 'waiting');
  assert.match(state.label, /Switching now/);
});

test('after it fires it reads as finished, not paused', () => {
  // The backend sets active:false once it has run. The card used to call that
  // "Inactive" - and on the web, "Paused" - beside a toggle offering to re-run
  // a timer with zero seconds left.
  const item = {
    type: 'countdown', active: false,
    countdownDuration: 60, countdownStartedAt: startedAgo(600),
  };

  const state = describeTimerState(item, NOW);
  assert.equal(state.tone, 'done');
  assert.equal(state.canRun, false);
  assert.match(state.label, /Finished/);
});

test('a scheduled timer is only ever active or paused', () => {
  assert.equal(describeTimerState({ type: 'scheduled', active: true }, NOW).tone, 'running');
  assert.equal(describeTimerState({ type: 'scheduled', active: false }, NOW).tone, 'paused');
});

test('every state returns a usable label and tone', () => {
  const cases = [
    { type: 'countdown', active: true, countdownDuration: 60, countdownStartedAt: startedAgo(1) },
    { type: 'countdown', active: true, countdownDuration: 60, countdownStartedAt: startedAgo(99) },
    { type: 'countdown', active: false },
    { type: 'scheduled', active: true },
    { type: 'scheduled', active: false },
    {},
  ];

  for (const item of cases) {
    const state = describeTimerState(item, NOW);
    assert.equal(typeof state.label, 'string');
    assert.ok(state.label.length > 0);
    assert.ok(['running', 'waiting', 'done', 'paused'].includes(state.tone));
  }
});

test('the labels carry real characters, not raw escapes', () => {
  // They are written with unicode escapes in source; a mis-escaped edit would
  // print "Switching now…" to a user.
  const waiting = describeTimerState(
    { type: 'countdown', active: true, countdownDuration: 1, countdownStartedAt: startedAgo(99) },
    NOW
  ).label;
  const done = describeTimerState({ type: 'countdown', active: false }, NOW).label;

  assert.doesNotMatch(waiting, /\\u/);
  assert.doesNotMatch(done, /\\u/);
  assert.ok(waiting.includes('…'), 'ellipsis rendered');
  assert.ok(done.includes('·'), 'middle dot rendered');
});

/*
 * A paused timer is not counting.
 *
 * Elapsed time since countdownStartedAt only means anything while the timer is
 * running. Without this guard - dropped when countdownSecondsRemaining was
 * factored out of getLiveCountdownDisplay - a timer the user had switched off
 * carried on counting down on screen, beside the words "Finished - ran once".
 */

test('a paused timer holds its stored remaining instead of counting', () => {
  const item = {
    type: 'countdown',
    active: false,
    countdownDuration: 120,
    countdownStartedAt: startedAgo(300),
    countdownRemaining: 53,
  };

  assert.equal(countdownSecondsRemaining(item, NOW), 53);
  assert.equal(getLiveCountdownDisplay(item, NOW), '00:00:53');
});

test('a paused timer does not move as time passes', () => {
  const item = {
    type: 'countdown',
    active: false,
    countdownDuration: 120,
    countdownStartedAt: startedAgo(10),
    countdownRemaining: 44,
  };

  const first = countdownSecondsRemaining(item, NOW);
  const later = countdownSecondsRemaining(item, NOW + 30000);

  assert.equal(first, later, 'thirty seconds later, still the same number');
});

test('a paused timer with no stored remaining shows its full duration', () => {
  const item = { type: 'countdown', active: false, countdownTime: '00:01:00' };
  assert.equal(countdownSecondsRemaining(item, NOW), 60);
});

test('switching a timer back on resumes counting from its start', () => {
  const item = {
    type: 'countdown',
    active: true,
    countdownDuration: 120,
    countdownStartedAt: startedAgo(30),
    countdownRemaining: 53,
  };

  // Running: the clock wins over the stored value, which is only refreshed
  // once a minute by checkScheduledTimers.
  assert.equal(countdownSecondsRemaining(item, NOW), 90);
});
