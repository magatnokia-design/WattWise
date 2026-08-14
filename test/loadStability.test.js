import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSuggestionTrust,
  describeUncertainty,
  TRUST_THRESHOLDS,
} from '../src/screens/Dashboard/utils/loadStability.js';

// A clean match: well clear of the floor, well clear of the runner-up.
const CONFIDENT = {
  confidencePercent: 88,
  suggestedName: 'Electric Fan',
  candidates: [
    { name: 'Electric Fan', confidencePercent: 88 },
    { name: 'Monitor', confidencePercent: 41 },
  ],
  meanPowerW: 57.7,
  stdDevPowerW: 1.9,
};

test('a strong, decisive match is presented as a finding', () => {
  const result = resolveSuggestionTrust(CONFIDENT);

  assert.equal(result.trusted, true);
  assert.equal(result.reason, null);
  assert.equal(result.varying, false);
});

test('the iPhone, exactly as the hardware reported it', () => {
  /*
   * From the dashboard, 2026-08-14. An iPhone 16 Pro Max charging through its
   * CC-CV taper, measured over 38 minutes:
   *
   *   Monitor 50% · Speaker 45% · Electric Fan 39% · Laptop Charger 37%
   *
   * Two independent reasons to distrust it - the leader is under the floor AND
   * only 5 points clear - and the owner watched it flip names all evening. The
   * floor is checked first, so `weak` is the reason reported.
   */
  const result = resolveSuggestionTrust({
    confidencePercent: 50,
    suggestedName: 'Monitor',
    candidates: [
      { name: 'Monitor', confidencePercent: 50 },
      { name: 'Speaker', confidencePercent: 45 },
      { name: 'Electric Fan', confidencePercent: 39 },
      { name: 'Laptop Charger', confidencePercent: 37 },
    ],
    meanPowerW: 21,
    stdDevPowerW: 5.8,
  });

  assert.equal(result.trusted, false);
  assert.equal(result.reason, 'weak');
  assert.equal(result.varying, true);
});

test('a varying load that still matches strongly stays a finding', () => {
  /*
   * The rule this file exists to get right. A laptop charger really does swing -
   * its profile allows stdDev up to 30 W - so variability must never demote a
   * match on its own. Saying "not sure" over an 85% match with a 40-point lead
   * would be false, and would train the user to ignore the notice.
   *
   * `varying` is the explanation for a weak match, never the cause of one.
   */
  const result = resolveSuggestionTrust({
    confidencePercent: 85,
    suggestedName: 'Laptop Charger',
    candidates: [
      { name: 'Laptop Charger', confidencePercent: 85 },
      { name: 'Speaker', confidencePercent: 45 },
    ],
    meanPowerW: 60,
    stdDevPowerW: 22,
  });

  assert.equal(result.trusted, true);
  assert.equal(result.varying, true, 'still reported as varying, just not distrusted for it');
});

test("the backend's own ambiguous flag outranks every score", () => {
  // It evaluated the same run against the same profiles. If it already called
  // the result ambiguous, a healthy-looking percentage does not overrule it.
  const result = resolveSuggestionTrust({ ...CONFIDENT, ambiguous: true });

  assert.equal(result.trusted, false);
  assert.equal(result.reason, 'ambiguous');
});

test('a leader that is not clear of the runner-up is indecisive', () => {
  const result = resolveSuggestionTrust({
    confidencePercent: 72,
    suggestedName: 'Monitor',
    candidates: [
      { name: 'Monitor', confidencePercent: 72 },
      { name: 'Television', confidencePercent: 70 },
    ],
    meanPowerW: 48,
    stdDevPowerW: 2,
  });

  assert.equal(result.trusted, false);
  assert.equal(result.reason, 'indecisive');
});

test('the thresholds are boundaries, not approximations', () => {
  const { CONFIDENT_FLOOR, DECISIVE_MARGIN } = TRUST_THRESHOLDS;

  const at = (confidencePercent, runnerUp) =>
    resolveSuggestionTrust({
      confidencePercent,
      suggestedName: 'Monitor',
      candidates: [{ name: 'Speaker', confidencePercent: runnerUp }],
      meanPowerW: 40,
      stdDevPowerW: 1,
    });

  assert.equal(at(CONFIDENT_FLOOR, 10).trusted, true, 'exactly at the floor passes');
  assert.equal(at(CONFIDENT_FLOOR - 1, 10).trusted, false);

  assert.equal(
    at(80, 80 - DECISIVE_MARGIN).trusted,
    true,
    'exactly the margin is a clear enough lead'
  );
  assert.equal(at(80, 80 - DECISIVE_MARGIN + 1).trusted, false);
});

test('the suggestion is not its own runner-up', () => {
  // Callers pass the list unfiltered, and it contains the suggested name. Left
  // in, the leader would always tie with itself and nothing would ever be
  // trusted - the failure mode that turns a useful notice into wallpaper.
  const result = resolveSuggestionTrust({
    confidencePercent: 91,
    suggestedName: 'Television',
    candidates: [{ name: 'Television', confidencePercent: 91 }],
    meanPowerW: 120,
    stdDevPowerW: 8,
  });

  assert.equal(result.trusted, true);
});

test('a steady load is not reported as varying', () => {
  const result = resolveSuggestionTrust({
    ...CONFIDENT,
    meanPowerW: 13.8,
    stdDevPowerW: 0.4, // the owner's ceiling fan: 13.8 W average, peak 14.2 W
  });

  assert.equal(result.varying, false);
  assert.equal(result.swingW, null);
});

test('missing measurements cannot divide by zero or crash', () => {
  assert.equal(resolveSuggestionTrust().trusted, false);
  assert.equal(resolveSuggestionTrust({}).varying, false);

  const noMean = resolveSuggestionTrust({ confidencePercent: 90, meanPowerW: 0, stdDevPowerW: 5 });
  assert.equal(noMean.varying, false);

  const rubbish = resolveSuggestionTrust({
    confidencePercent: 'not a number',
    candidates: 'not an array',
    meanPowerW: null,
  });
  assert.equal(rubbish.trusted, false);
  assert.equal(rubbish.reason, 'weak');
});

test('a candidate with no score does not become the runner-up', () => {
  const result = resolveSuggestionTrust({
    confidencePercent: 75,
    suggestedName: 'Monitor',
    candidates: [{ name: 'Speaker' }, { name: 'Television', confidencePercent: null }],
    meanPowerW: 40,
    stdDevPowerW: 1,
  });

  assert.equal(result.trusted, true);
});

test('the varying sentence names the cause; the fallback does not pretend to', () => {
  const varying = describeUncertainty({ varying: true, swingW: 5.8, meanPowerW: 21 });
  assert.match(varying, /changes while it runs/);
  assert.match(varying, /21 W/);
  assert.match(varying, /6 W/); // 5.8 rounded, the swing either side
  assert.match(varying, /counted exactly/, 'must not imply the energy figure is affected');

  const close = describeUncertainty({ varying: false, meanPowerW: 40 });
  assert.match(close, /within a few points/);

  // Varying but without usable numbers falls back rather than printing "NaN W".
  assert.match(describeUncertainty({ varying: true }), /within a few points/);
});
