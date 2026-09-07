const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RELAY_FAULT_LIVE,
  RELAY_FAULT_STALE,
  describeRelayFault,
} = require('../src/constants/relayFault');

/*
 * The banner that says an outlet will not switch off.
 *
 * The latch behind it is correct and is not what these tests are about: a
 * confirmed fault clears only on positive evidence - the load side measured
 * dead, not merely idle - so a Hub that stops reporting leaves the warning
 * standing. That is deliberate. The relay is still welded whether or not
 * anything is listening, and withdrawing a true safety warning because the
 * evidence went quiet is worse than never raising it.
 *
 * What these tests hold is the sentence. The live wording asserts a present
 * measurement ("current is still flowing"), and it was being printed while the
 * Hub was silent - directly under a Power Safety card correctly reporting that
 * nothing could be graded. Same screen, two answers to whether the app knows
 * anything.
 */

test('a fresh reading gets the present tense', () => {
  assert.equal(describeRelayFault(true), RELAY_FAULT_LIVE);
  assert.match(describeRelayFault(true), /current is still flowing/);
});

test('no fresh reading never claims a present measurement', () => {
  const stale = describeRelayFault(false);

  assert.equal(stale, RELAY_FAULT_STALE);
  assert.doesNotMatch(
    stale,
    /is still flowing/,
    'the stale banner states a live measurement while nothing is being measured'
  );
  assert.match(stale, /was still flowing/);
});

test('the stale wording names the moment it is describing', () => {
  // The whole failure mode is a figure from one moment presented as though it
  // belonged to another. Saying which moment is what fixes it.
  const stale = describeRelayFault(false);

  assert.match(stale, /When the Hub last reported/);
  assert.match(stale, /not reporting now/);
});

test('only an explicit true counts as fresh', () => {
  // An absent or unknown freshness flag must fall to the cautious wording
  // rather than be read as a live measurement. undefined is the realistic
  // case: a hook that has not resolved yet.
  for (const value of [undefined, null, 0, '', 'true', 1, {}, NaN]) {
    assert.equal(
      describeRelayFault(value),
      RELAY_FAULT_STALE,
      `${JSON.stringify(value)} was treated as a fresh reading`
    );
  }
});

test('both tenses keep the instruction, and it is the same instruction', () => {
  // The action does not change with the tense. A stale warning is still a
  // warning: the outlet is live either way, and softening the stale copy into
  // advice would be the retraction this design refuses to make.
  const action = 'Unplug the appliance at the wall and have the wiring checked before using it again.';

  assert.ok(RELAY_FAULT_LIVE.endsWith(action));
  assert.ok(RELAY_FAULT_STALE.endsWith(action));
});

test('neither tense softens the danger', () => {
  // Both must still say the cut-off cannot protect the outlet. Dropping that
  // from the stale copy would turn "we cannot protect this" into "we are not
  // sure", which is the wrong direction to err in.
  const cannotProtect = /safety cut-off cannot protect this outlet/;

  assert.match(RELAY_FAULT_LIVE, cannotProtect);
  assert.match(RELAY_FAULT_STALE, cannotProtect);
});

test('the two tenses are actually different strings', () => {
  // Guards against a refactor that collapses them into one and leaves every
  // other assertion here passing for the wrong reason.
  assert.notEqual(RELAY_FAULT_LIVE, RELAY_FAULT_STALE);
});
