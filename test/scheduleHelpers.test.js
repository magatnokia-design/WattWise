import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countdownSecondsRemaining,
  describeTimerState,
  getLiveCountdownDisplay,
  toggleTimerFields,
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
  //
  // lastTriggered is what makes this one "fired" rather than "paused". It used
  // to be absent from this fixture and the assertion still passed, because
  // every inactive countdown was called Finished - which is precisely the bug
  // below. A test that passes for the wrong reason is worse than no test.
  const item = {
    type: 'countdown', active: false,
    countdownDuration: 60, countdownStartedAt: startedAgo(600),
    countdownRemaining: 0, lastTriggered: startedAgo(540),
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

/*
 * Pause must stop the clock, not just the display.
 *
 * The toggle wrote `{ active: false }` and nothing else, so countdownStartedAt
 * still pointed at the original start and every paused second was counted as
 * elapsed. A 30 s timer paused with 10 s left came back at 2 s, and the backend
 * - computing remaining from the same field - switched the outlet on its next
 * tick and sent a notification claiming the countdown had finished. It had not.
 *
 * Reported from a real handset on 5 Sep 2026.
 */

test('pausing records what was actually left, not the stale server value', () => {
  // countdownRemaining is only refreshed by the once-a-minute cron, so the
  // stored 30 here is a full 20 seconds behind the truth.
  const running = {
    type: 'countdown', active: true,
    countdownDuration: 30, countdownStartedAt: startedAgo(20),
    countdownRemaining: 30,
  };

  const fields = toggleTimerFields(running, false, NOW);

  assert.equal(fields.active, false);
  assert.equal(fields.countdownRemaining, 10, 'the truth at the instant of the tap');
});

test('resuming restarts the clock from the frozen remaining', () => {
  const paused = {
    type: 'countdown', active: false,
    countdownDuration: 30, countdownStartedAt: startedAgo(20),
    countdownRemaining: 10,
  };

  // Resumed a full minute later. The paused time must not have been spent.
  const resumeAt = NOW + 60000;
  const fields = toggleTimerFields(paused, true, resumeAt);

  assert.equal(fields.active, true);
  assert.equal(fields.countdownDuration, 10);
  assert.equal(fields.countdownRemaining, 10);
  assert.equal(fields.countdownStartedAt.getTime(), resumeAt);

  // And the resumed document reads back as 10 seconds, not 2.
  const resumed = { ...paused, ...fields };
  assert.equal(countdownSecondsRemaining(resumed, resumeAt), 10);
});

test('the backend arithmetic agrees with the resumed document', () => {
  // checkScheduledTimers computes countdownDuration - (now - countdownStartedAt).
  // Writing both fields on resume is what lets the cron stay unchanged.
  const paused = {
    type: 'countdown', active: false,
    countdownDuration: 30, countdownStartedAt: startedAgo(20),
    countdownRemaining: 10,
  };

  const resumeAt = NOW + 60000;
  const resumed = { ...paused, ...toggleTimerFields(paused, true, resumeAt) };

  const backendRemaining = (nowMs) => Math.max(
    0,
    resumed.countdownDuration - Math.floor((nowMs - resumed.countdownStartedAt.getTime()) / 1000)
  );

  assert.equal(backendRemaining(resumeAt), 10, 'does not fire the instant it resumes');
  assert.equal(backendRemaining(resumeAt + 9000), 1);
  assert.equal(backendRemaining(resumeAt + 10000), 0, 'fires exactly 10s later');
});

test('a full pause and resume cycle loses no time', () => {
  let item = {
    type: 'countdown', active: true,
    countdownDuration: 30, countdownStartedAt: new Date(NOW),
    countdownRemaining: 30,
  };

  const pausedAt = NOW + 12000;                 // 18 left
  item = { ...item, ...toggleTimerFields(item, false, pausedAt) };
  assert.equal(countdownSecondsRemaining(item, pausedAt), 18);

  // Five minutes go by with the timer switched off.
  const stillPaused = pausedAt + 300000;
  assert.equal(countdownSecondsRemaining(item, stillPaused), 18, 'not a second moved');

  item = { ...item, ...toggleTimerFields(item, true, stillPaused) };
  assert.equal(countdownSecondsRemaining(item, stillPaused), 18, 'resumed where it stopped');
  assert.equal(countdownSecondsRemaining(item, stillPaused + 18000), 0);
});

test('a spent countdown is not re-armed by the toggle', () => {
  // Switching a finished timer back on would fire the outlet on the next tick.
  const spent = {
    type: 'countdown', active: false,
    countdownDuration: 30, countdownStartedAt: startedAgo(600),
    countdownRemaining: 0, lastTriggered: startedAgo(570),
  };

  const fields = toggleTimerFields(spent, true, NOW);

  assert.deepEqual(fields, { active: true }, 'no clock is restarted');
});

test('a scheduled timer still writes active alone', () => {
  const scheduled = { type: 'scheduled', active: true, scheduledTime: '07:30', days: ['Mon'] };

  assert.deepEqual(toggleTimerFields(scheduled, false, NOW), { active: false });
  assert.deepEqual(toggleTimerFields(scheduled, true, NOW), { active: true });
});

test('a timer whose remaining cannot be read is frozen as-is, not at zero', () => {
  // Absent is not zero. Writing countdownRemaining: 0 here would mark a timer
  // we know nothing about as spent.
  const unknown = { type: 'countdown', active: true };

  assert.deepEqual(toggleTimerFields(unknown, false, NOW), { active: false });
});

// ------------------------------------------------------- paused vs finished

test('a paused countdown says paused, and says how much is left', () => {
  const paused = {
    type: 'countdown', active: false,
    countdownDuration: 30, countdownRemaining: 10,
  };

  const state = describeTimerState(paused, NOW);

  assert.equal(state.tone, 'paused');
  assert.equal(state.canRun, true, 'the user must be able to resume it');
  assert.match(state.label, /Paused/);
  assert.match(state.label, /00:00:10/);
});

test('a timer that ran, was re-armed and then paused is paused, not finished', () => {
  // lastTriggered survives a re-arm, so null-checking it would call this one
  // finished for the rest of its life.
  const rearmedThenPaused = {
    type: 'countdown', active: false,
    countdownDuration: 30,
    lastTriggered: startedAgo(600),
    countdownStartedAt: startedAgo(120),
    countdownRemaining: 25,
  };

  const state = describeTimerState(rearmedThenPaused, NOW);

  assert.equal(state.tone, 'paused');
  assert.equal(state.canRun, true);
});

test('a paused scheduled timer can still be switched back on', () => {
  // canRun gates the switch. It read false here, which would have disabled the
  // only control that re-enables the timer.
  const state = describeTimerState({ type: 'scheduled', active: false }, NOW);

  assert.equal(state.tone, 'paused');
  assert.equal(state.canRun, true);
});
