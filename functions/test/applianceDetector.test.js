const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODEL_VERSION,
  MIN_SAMPLE_COUNT,
  MAX_SIGNATURES_PER_APPLIANCE,
  mergeSignatureIntoProfiles,
  normalizeDetectionState,
  updateDetectionState,
  shouldEvaluateLive,
  detectApplianceFromRunState,
  APPLIANCE_PROFILES,
  matchNamedAppliance,
  buildApplianceIdentity,
  resolveOutletLogName,
  normalizeUserProfiles,
  buildApplianceSignature,
} = require('../src/lib/applianceDetector');

const buildRunState = ({
  powerStart,
  jitter = 0,
  sampleCount = 70,
  startTimeMs = 1700000000000,
}) => {
  let state = normalizeDetectionState(null, 'off');

  for (let i = 0; i < sampleCount; i += 1) {
    const direction = i % 2 === 0 ? 1 : -1;
    const power = powerStart + (direction * jitter);

    state = updateDetectionState(state, {
      status: 'on',
      power,
      timestampMs: startTimeMs + (i * 1000),
    });
  }

  return state;
};

test('normalizeDetectionState returns idle state defaults', () => {
  const state = normalizeDetectionState(null, 'off');

  assert.equal(state.modelVersion, MODEL_VERSION);
  assert.equal(state.lastStatus, 'off');
  assert.equal(state.sampleCount, 0);
  assert.equal(state.meanPower, 0);
});

test('shouldEvaluateLive becomes true after enough on samples', () => {
  // Live evaluation runs on every 2nd sample, so the count must land on the
  // interval boundary.
  const state = buildRunState({ powerStart: 80, jitter: 3, sampleCount: 48 });

  assert.equal(state.lastStatus, 'on');
  assert.equal(shouldEvaluateLive(state), true);
});

test('shouldEvaluateLive stays false between evaluation intervals', () => {
  const state = buildRunState({ powerStart: 80, jitter: 3, sampleCount: 49 });

  assert.equal(shouldEvaluateLive(state), false);
});

test('detectApplianceFromRunState identifies electric fan profile', () => {
  const state = buildRunState({ powerStart: 72, jitter: 4, sampleCount: 80 });
  const result = detectApplianceFromRunState(state);

  assert.ok(result);
  assert.equal(result.appliance, 'Electric Fan');
  assert.ok(result.confidence >= 0.62);
  assert.ok(Array.isArray(result.candidates));
});

// A steady ~8 W draw genuinely cannot be pinned to one appliance by power
// alone - a charger, an LED lamp and a small speaker all look like this. The
// detector's contract for that case is to rank them and let the user decide,
// not to assert one and sound certain about it.
test('detectApplianceFromRunState offers a choice for the ambiguous low-watt band', () => {
  const state = buildRunState({ powerStart: 8, jitter: 1, sampleCount: 60 });
  const result = detectApplianceFromRunState(state);

  assert.ok(result);
  assert.equal(result.ambiguous, true);
  assert.ok(result.candidates.length > 1);

  const names = result.candidates.map((candidate) => candidate.name);
  assert.ok(names.includes('Phone Charger'));
  assert.ok(names.includes('LED Lamp'));

  // Honest about being a coin flip rather than reporting false certainty.
  assert.ok(result.confidence < 0.6);
});

test('detectApplianceFromRunState is confident when a profile stands alone', () => {
  const state = buildRunState({ powerStart: 72, jitter: 4, sampleCount: 80 });
  const result = detectApplianceFromRunState(state);

  assert.ok(result);
  assert.equal(result.appliance, 'Electric Fan');
  assert.equal(result.ambiguous, false);
  assert.ok(result.confidence >= 0.7);
});

// Regression: an outlet switched on with nothing plugged into it used to start
// the run immediately, so those 0 W samples were averaged in and a 53 W fan
// reported a mean of 5.9 W - which scored as a phone charger.
test('idle samples before a load appears do not skew the run', () => {
  let state = normalizeDetectionState(null, 'off');
  const startMs = 1700000000000;

  // Outlet on, nothing plugged in.
  for (let i = 0; i < 20; i += 1) {
    state = updateDetectionState(state, {
      status: 'on',
      power: 0,
      timestampMs: startMs + (i * 1000),
    });
  }

  assert.equal(state.sampleCount, 0, 'run must not start before a load appears');

  // Fan plugged in.
  for (let i = 0; i < 40; i += 1) {
    state = updateDetectionState(state, {
      status: 'on',
      power: 53.3 + (i % 2 === 0 ? 1 : -1),
      timestampMs: startMs + ((20 + i) * 1000),
    });
  }

  assert.equal(state.sampleCount, 40);
  assert.ok(Math.abs(state.meanPower - 53.3) < 1);

  const result = detectApplianceFromRunState(state);
  assert.ok(result);
  assert.equal(result.appliance, 'Electric Fan');
});

test('a brief dip does not end a run, but unplugging does', () => {
  let state = buildRunState({ powerStart: 53, jitter: 1, sampleCount: 30 });
  const meanBefore = state.meanPower;
  let clock = state.lastSampleAtMs;

  // Two near-zero readings: keep the run and its measurements intact.
  for (let i = 0; i < 2; i += 1) {
    clock += 1000;
    state = updateDetectionState(state, { status: 'on', power: 0, timestampMs: clock });
  }

  assert.equal(state.sampleCount, 30);
  assert.equal(state.meanPower, meanBefore);

  // A third ends the run - the appliance is gone.
  clock += 1000;
  state = updateDetectionState(state, { status: 'on', power: 0, timestampMs: clock });

  assert.equal(state.sampleCount, 0);
  assert.equal(detectApplianceFromRunState(state), null);
});

test('detectApplianceFromRunState skips low-sample runs', () => {
  const state = buildRunState({ powerStart: 85, jitter: 3, sampleCount: 3 });
  const result = detectApplianceFromRunState(state);

  assert.equal(result, null);
});

test('detectApplianceFromRunState skips near-zero load runs', () => {
  const state = buildRunState({ powerStart: 0.8, jitter: 0.2, sampleCount: 40 });
  const result = detectApplianceFromRunState(state);

  assert.equal(result, null);
});

test('buildApplianceSignature captures the measured run', () => {
  const signature = buildApplianceSignature(
    buildRunState({ powerStart: 72, jitter: 4, sampleCount: 40 }),
    'Desk Fan'
  );

  assert.ok(signature);
  assert.equal(signature.label, 'Desk Fan');
  assert.equal(signature.meanPower, 72);
  assert.equal(signature.modelVersion, MODEL_VERSION);
});

test('buildApplianceSignature rejects unusable runs', () => {
  const shortRun = buildRunState({ powerStart: 72, jitter: 4, sampleCount: 2 });
  assert.equal(buildApplianceSignature(shortRun, 'Desk Fan'), null);

  const goodRun = buildRunState({ powerStart: 72, jitter: 4, sampleCount: 40 });
  assert.equal(buildApplianceSignature(goodRun, '   '), null);

  const idleRun = buildRunState({ powerStart: 0.4, jitter: 0.1, sampleCount: 40 });
  assert.equal(buildApplianceSignature(idleRun, 'Desk Fan'), null);
});

test('a learned signature wins over the generic profile', () => {
  const signature = buildApplianceSignature(
    buildRunState({ powerStart: 72, jitter: 4, sampleCount: 40 }),
    'Desk Fan'
  );

  const laterRun = buildRunState({ powerStart: 74, jitter: 5, sampleCount: 45 });

  const generic = detectApplianceFromRunState(laterRun);
  assert.equal(generic.appliance, 'Electric Fan');
  assert.equal(generic.matchSource, 'generic');

  const learned = detectApplianceFromRunState(laterRun, { userProfiles: [signature] });
  assert.equal(learned.appliance, 'Desk Fan');
  assert.equal(learned.matchSource, 'learned');
});

test('a learned signature does not claim a clearly different load', () => {
  const signature = buildApplianceSignature(
    buildRunState({ powerStart: 72, jitter: 4, sampleCount: 40 }),
    'Desk Fan'
  );

  // A television-sized load, well outside the learned fan's signature but still
  // an appliance this system supports.
  const otherRun = buildRunState({ powerStart: 150, jitter: 12, sampleCount: 60 });
  const result = detectApplianceFromRunState(otherRun, { userProfiles: [signature] });

  assert.ok(result);
  assert.notEqual(result.appliance, 'Desk Fan');
  assert.equal(result.matchSource, 'generic');
});

test('normalizeUserProfiles drops malformed entries', () => {
  const profiles = normalizeUserProfiles([
    { label: 'Desk Fan', meanPower: 72, peakPower: 76 },
    { label: '', meanPower: 50, peakPower: 55 },
    { label: 'Zero Load', meanPower: 0, peakPower: 0 },
    null,
    'not-a-profile',
  ]);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].label, 'Desk Fan');
});

test('detectApplianceFromRunState tolerates missing user profiles', () => {
  const state = buildRunState({ powerStart: 72, jitter: 4, sampleCount: 40 });

  assert.ok(detectApplianceFromRunState(state, {}));
  assert.ok(detectApplianceFromRunState(state, { userProfiles: null }));
  assert.ok(detectApplianceFromRunState(state, { userProfiles: 'nope' }));
});

test('updateDetectionState resets counters when outlet turns off', () => {
  let state = buildRunState({ powerStart: 130, jitter: 12, sampleCount: 30 });
  state = updateDetectionState(state, {
    status: 'off',
    power: 0,
    timestampMs: 1700000035000,
  });

  assert.equal(state.lastStatus, 'off');
  assert.equal(state.sampleCount, 0);
  assert.equal(state.runStartedAtMs, null);
});
// --- Appliance identity -----------------------------------------------------
//
// The scenario these cover happened on real hardware: an outlet named "LED Lamp"
// with a learned 16 W signature had a 60 W ceiling fan plugged into it, and the
// whole system went on calling it an LED Lamp - the dashboard, the history line
// written at switch-on, and the per-appliance energy split.

const LAMP_SIGNATURE = {
  label: 'LED Lamp',
  meanPower: 16,
  peakPower: 16.4,
  stdDevPower: 0.4,
  activeRatio: 0.9,
  lowRatio: 1,
};

test('matchNamedAppliance confirms the appliance it was named after', () => {
  const run = buildRunState({ powerStart: 16, jitter: 0.4, sampleCount: 40 });
  const result = matchNamedAppliance(run, 'LED Lamp', [LAMP_SIGNATURE]);

  assert.equal(result.state, 'confirmed');
  assert.ok(result.score <= 0.45);
});

test('matchNamedAppliance reports a swapped appliance as changed', () => {
  // The fan that was actually plugged in.
  const run = buildRunState({ powerStart: 60, jitter: 3, sampleCount: 40 });
  const result = matchNamedAppliance(run, 'LED Lamp', [LAMP_SIGNATURE]);

  assert.equal(result.state, 'changed');
});

test('matchNamedAppliance says unknown rather than changed with nothing learned', () => {
  // A typed name is a claim, not a measurement. Reporting 'changed' here would
  // accuse the user of swapping an appliance the system never measured.
  const run = buildRunState({ powerStart: 60, jitter: 3, sampleCount: 40 });

  assert.equal(matchNamedAppliance(run, 'LED Lamp', []).state, 'unknown');
  assert.equal(matchNamedAppliance(run, 'LED Lamp', null).state, 'unknown');
  assert.equal(
    matchNamedAppliance(run, 'Something Else', [LAMP_SIGNATURE]).state,
    'unknown'
  );
});

test('matchNamedAppliance treats the outlet placeholder as unnamed', () => {
  const run = buildRunState({ powerStart: 60, jitter: 3, sampleCount: 40 });

  assert.equal(matchNamedAppliance(run, 'Outlet 1', [LAMP_SIGNATURE]).state, 'unnamed');
  assert.equal(matchNamedAppliance(run, '', [LAMP_SIGNATURE]).state, 'unnamed');
});

test('matchNamedAppliance withholds a verdict until the run is measurable', () => {
  const brief = buildRunState({ powerStart: 60, jitter: 3, sampleCount: 2 });
  assert.equal(matchNamedAppliance(brief, 'LED Lamp', [LAMP_SIGNATURE]).state, 'unknown');

  const idle = normalizeDetectionState(null, 'off');
  assert.equal(matchNamedAppliance(idle, 'LED Lamp', [LAMP_SIGNATURE]).state, 'unknown');
});

test('resolveOutletLogName drops a name the measurements contradict', () => {
  assert.equal(
    resolveOutletLogName(
      { applianceName: 'LED Lamp', applianceIdentity: { state: 'changed' } },
      1
    ),
    'Outlet 1'
  );
});

test('resolveOutletLogName keeps a confirmed or unverified name', () => {
  assert.equal(
    resolveOutletLogName(
      { applianceName: 'LED Lamp', applianceIdentity: { state: 'confirmed' } },
      1
    ),
    'LED Lamp'
  );

  // Unknown is not a contradiction - the name is all we have, so it stands.
  assert.equal(
    resolveOutletLogName(
      { applianceName: 'LED Lamp', applianceIdentity: { state: 'unknown' } },
      1
    ),
    'LED Lamp'
  );

  assert.equal(resolveOutletLogName({ applianceName: 'LED Lamp' }, 1), 'LED Lamp');
});

test('resolveOutletLogName falls back for unnamed and placeholder outlets', () => {
  assert.equal(resolveOutletLogName({}, 2), 'Outlet 2');
  assert.equal(resolveOutletLogName({ applianceName: '   ' }, 2), 'Outlet 2');
  assert.equal(resolveOutletLogName({ applianceName: 'Outlet 2' }, 2), 'Outlet 2');
  assert.equal(resolveOutletLogName(null, 1), 'Outlet 1');
});

// An out-of-scope load is a finding, not an absence of one. Returning bare null
// made a 1200 W kettle indistinguishable from a lamp switched on two seconds
// ago, so the user waited for a suggestion that was never coming with nothing on
// screen to say why.
test('detectApplianceFromRunState reports an unsupported load rather than staying silent', () => {
  // Far outside the low-voltage appliances this system is built for.
  const kettle = buildRunState({ powerStart: 1400, jitter: 40, sampleCount: 40 });
  const result = detectApplianceFromRunState(kettle);

  assert.ok(result, 'an unsupported load must not be reported as no result');
  assert.equal(result.unsupported, true);
  assert.equal(result.appliance, null, 'nothing may be presented as an identification');
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.candidates, []);
  // The measurements are still reported - they are the evidence for the verdict.
  assert.ok(result.features.meanPower > 1000);
});

test('an in-scope load is still not marked unsupported', () => {
  const fan = buildRunState({ powerStart: 72, jitter: 4, sampleCount: 40 });
  const result = detectApplianceFromRunState(fan);

  assert.equal(result.appliance, 'Electric Fan');
  assert.ok(!result.unsupported);
});

test('too little data is still silence, not an unsupported verdict', () => {
  // The distinction the whole change exists to make.
  const brief = buildRunState({ powerStart: 1400, jitter: 40, sampleCount: 2 });
  assert.equal(detectApplianceFromRunState(brief), null);

  const idle = buildRunState({ powerStart: 0.5, jitter: 0.1, sampleCount: 40 });
  assert.equal(detectApplianceFromRunState(idle), null);
});

// Onboarding promises the user a list of supported appliances; the detector has
// its own. They had drifted - onboarding listed seven, omitted Monitor, and
// renamed three ("TV", "Gaming Console", "Radio/Speaker" against the detector's
// "Television", "Game Console", "Speaker"). Nothing connected the two files, so
// the screen could promise one set and the suggestions offer another.
//
// Same approach as billingParity.test.js: read the sibling file rather than
// restating its contents here, which would just be a third list to keep in step.
test('onboarding lists exactly the appliances the detector can identify', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const onboarding = path.join(
    __dirname, '..', '..', 'src', 'screens', 'Onboarding', 'OnboardingScreen.js'
  );

  const source = fs.readFileSync(onboarding, 'utf8');
  const slide = source
    .split('\n')
    .find((line) => line.includes('Designed for low-voltage devices'));

  assert.ok(slide, 'the supported-appliances slide should still exist');

  for (const profile of APPLIANCE_PROFILES) {
    assert.ok(
      slide.includes(profile.label),
      `onboarding does not list "${profile.label}"`
    );
  }

  // And nothing extra: a name on the slide the detector cannot produce is a
  // promise the system does not keep.
  //
  // The source holds the list as one string literal, so the separator to split
  // on is the two characters backslash-n, not an actual newline.
  const listed = slide
    .slice(slide.indexOf('devices:'))
    .split('\\n')
    .map((entry) => entry.trim())
    .filter((entry) => /[a-z]/i.test(entry) && !entry.includes('devices:'));

  assert.equal(
    listed.length,
    APPLIANCE_PROFILES.length,
    `onboarding lists ${listed.length} appliances (${listed.join(' | ')}), `
      + `the detector has ${APPLIANCE_PROFILES.length}`
  );
});

// The gap above the catalogue was not silence - it was confident nonsense.
// Scoring is relative: it finds the least bad profile and always finds one, so a
// 300 W load landed on Game Console at 0.41 confidence with an Accept button
// beside it. On a system whose hard constraint is low-voltage appliances only,
// naming a rice cooker a games console is worse than saying nothing.
test('a load above every profile is unsupported, not the nearest guess', () => {
  for (const watts of [250, 300, 400, 800]) {
    const result = detectApplianceFromRunState(
      buildRunState({ powerStart: watts, jitter: watts * 0.05, sampleCount: 40 })
    );

    assert.ok(result, `${watts} W should produce a verdict`);
    assert.equal(result.unsupported, true, `${watts} W was identified as ${result.appliance}`);
    assert.equal(result.appliance, null);
  }
});

test('loads inside the catalogue are unaffected by the scope ceiling', () => {
  const expected = [
    [16, 'LED Lamp'],
    [60, 'Electric Fan'],
    [150, 'Television'],
    [230, 'Game Console'],
  ];

  for (const [watts, appliance] of expected) {
    const result = detectApplianceFromRunState(
      buildRunState({ powerStart: watts, jitter: watts * 0.05, sampleCount: 40 })
    );

    assert.equal(result.appliance, appliance, `${watts} W`);
    assert.ok(!result.unsupported);
  }
});

// The user's own measurement outranks the catalogue. If they named a 300 W
// appliance themselves, overruling them with "unsupported" would throw away the
// only ground truth on the system.
test('a learned signature is exempt from the scope ceiling', () => {
  const run = buildRunState({ powerStart: 300, jitter: 15, sampleCount: 40 });
  const taught = buildApplianceSignature(run, 'Rice Cooker');

  assert.ok(taught, 'the run should be learnable even though it is out of scope');

  const result = detectApplianceFromRunState(run, { userProfiles: [taught] });

  assert.equal(result.appliance, 'Rice Cooker');
  assert.equal(result.matchSource, 'learned');
  assert.ok(!result.unsupported);
});

// --- The verdict both clients render -----------------------------------------
//
// Written from the owner's own Firestore document, which caught both of these.
// The outlet was named "Speaker" (a signature learned from an LED lamp during an
// earlier test) and the run measured as "LED Lamp" from a second saved
// signature. Both bugs rendered as confident, specific, wrong statements.

const identityFor = (state, score = null) => ({ state, score });
const detectionFor = (appliance, matchSource = 'generic', extra = {}) => ({
  appliance, matchSource, confidence: 0.9, ...extra,
});

test('an unverified name is still corrected when the measurements disagree', () => {
  // "Speaker" with its signature forgotten: nothing to check the name against,
  // but the run plainly measures as something else. Gating on 'changed' alone
  // offered nothing here, which is worse than the label comparison it replaced.
  const result = buildApplianceIdentity(
    identityFor('unknown'),
    detectionFor('LED Lamp', 'learned'),
    'Speaker'
  );

  assert.equal(result.suggestionPending, true);
  assert.equal(result.recognised, false, 'an unverified name cannot be "recognised"');
});

test('an unverified name that already matches is left alone', () => {
  const result = buildApplianceIdentity(
    identityFor('unknown'),
    detectionFor('LED Lamp', 'learned'),
    'LED Lamp'
  );

  assert.equal(result.suggestionPending, false);
});

test('recognised requires the outlet name itself to hold up', () => {
  const mismatched = buildApplianceIdentity(
    identityFor('unknown', 0.289),
    detectionFor('LED Lamp', 'learned'),
    'Speaker'
  );
  assert.equal(mismatched.recognised, false);

  const confirmed = buildApplianceIdentity(
    identityFor('confirmed', 0.1),
    detectionFor('LED Lamp', 'learned'),
    'LED Lamp'
  );
  assert.equal(confirmed.recognised, true);

  // Confirmed, but matched on a generic wattage range - known, not recognised.
  const generic = buildApplianceIdentity(
    identityFor('confirmed', 0.1),
    detectionFor('LED Lamp', 'generic'),
    'LED Lamp'
  );
  assert.equal(generic.recognised, false);
});

test('a confirmed name is never second-guessed', () => {
  const result = buildApplianceIdentity(
    identityFor('confirmed', 0.1),
    detectionFor('LED Lamp', 'learned'),
    'LED Lamp'
  );

  assert.equal(result.suggestionPending, false);
});

test('a contradicted name is always corrected', () => {
  const result = buildApplianceIdentity(
    identityFor('changed', 0.9),
    detectionFor('Electric Fan'),
    'LED Lamp'
  );

  assert.equal(result.suggestionPending, true);
  assert.equal(result.recognised, false);
});

test('an unnamed outlet is offered a name', () => {
  const result = buildApplianceIdentity(
    identityFor('unnamed'),
    detectionFor('Electric Fan'),
    ''
  );

  assert.equal(result.suggestionPending, true);
});

test('nothing measured means nothing to suggest', () => {
  const unsupported = buildApplianceIdentity(
    identityFor('unknown'),
    { appliance: null, unsupported: true, matchSource: null },
    'Speaker'
  );

  assert.equal(unsupported.suggestionPending, false, 'cannot offer a name there is none of');
  assert.equal(unsupported.unsupported, true);

  const nothing = buildApplianceIdentity(identityFor('unknown'), null, 'Speaker');
  assert.equal(nothing.suggestionPending, false);
});

/**
 * Why `unsupported` is written onto applianceDetection rather than
 * applianceIdentity, and why a client must read it there.
 *
 * The firmware opens the relay after OVERPOWER_GRACE_MS (3 s) while posting
 * every METRICS_INTERVAL_ACTIVE_MS (1.5 s), so an over-power run is two or three
 * samples long. That is below MIN_SAMPLE_COUNT, so the detector scores nothing
 * and returns null - and buildApplianceIdentity derives its own `unsupported`
 * from that null verdict. A client reading only the identity would leave a
 * 900 W kettle on "Detecting..." until it was unplugged, which is the exact
 * silence the flag was added to end.
 */
test('an over-power run is too short for the detector to reach a verdict', () => {
  const state = buildRunState({ powerStart: 912, sampleCount: 2 });

  assert.equal(state.sampleCount < MIN_SAMPLE_COUNT, true, 'two samples, four required');
  assert.equal(detectApplianceFromRunState(state), null, 'no verdict, not an unsupported one');
});

test('applianceIdentity cannot carry the over-power verdict', () => {
  const match = { state: 'unnamed', score: 0 };

  // The detector returned null above, so this is what the identity is built from.
  const identity = buildApplianceIdentity(match, null, '');

  assert.equal(
    identity.unsupported,
    false,
    'false rather than true - so applianceDetection.unsupported is the field to read'
  );
});

/**
 * Multi-signature appliances.
 *
 * An iPhone charging through its CC-CV taper sweeps from about 30 W to about
 * 10 W over half an hour, and came back as Monitor 50% / Speaker 45% /
 * Electric Fan 39% / Laptop Charger 37% - four profiles inside thirteen points.
 * None of them were wrong about the mean; the mean of a 30->10 W sweep is 21 W,
 * a value the appliance never actually draws.
 */

const IPHONE_FAST = {
  label: "Nokia's Iphone",
  meanPower: 28.8,
  peakPower: 30.2,
  stdDevPower: 1.4,
  activeRatio: 1,
  lowRatio: 0,
  updatedAtMs: 1000,
};

const IPHONE_TRICKLE = {
  label: "Nokia's Iphone",
  meanPower: 10.5,
  peakPower: 11.2,
  stdDevPower: 0.9,
  activeRatio: 1,
  lowRatio: 0,
  updatedAtMs: 2000,
};

test('a second operating regime is added, not substituted for the first', () => {
  const merged = mergeSignatureIntoProfiles([IPHONE_FAST], IPHONE_TRICKLE, 3000);

  assert.equal(merged.length, 2, 'both regimes kept');
  assert.deepEqual(
    merged.map((entry) => entry.label),
    ["Nokia's Iphone", "Nokia's Iphone"],
    'under one name'
  );
});

test('re-measuring a regime refines it rather than accumulating near-duplicates', () => {
  const slightlyDifferent = { ...IPHONE_FAST, meanPower: 29.1, updatedAtMs: 4000 };
  const merged = mergeSignatureIntoProfiles([IPHONE_FAST], slightlyDifferent, 4000);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].meanPower, 29.1, 'the newer measurement of the same regime wins');
});

test('an appliance is recognised by any of its regimes', () => {
  const profiles = [IPHONE_FAST, IPHONE_TRICKLE];

  // The flat end of the charge curve, against an appliance first learned at the
  // steep end. With one averaged signature this read 'changed' - the outlet
  // reported "Not Nokia's Iphone" about the phone plugged into it.
  const trickleRun = buildRunState({ powerStart: 10.6, jitter: 0.4 });
  const trickle = matchNamedAppliance(trickleRun, "Nokia's Iphone", profiles);
  assert.equal(trickle.state, 'confirmed');

  const fastRun = buildRunState({ powerStart: 28.9, jitter: 1.2 });
  const fast = matchNamedAppliance(fastRun, "Nokia's Iphone", profiles);
  assert.equal(fast.state, 'confirmed', 'and still by the one it was taught first');
});

test('a genuinely different appliance still reads as changed', () => {
  // The point of clusters is to stop false alarms, not to stop all alarms. A
  // 60 W fan on an outlet named after a phone is a real contradiction.
  const fanRun = buildRunState({ powerStart: 60, jitter: 2 });
  const result = matchNamedAppliance(fanRun, "Nokia's Iphone", [IPHONE_FAST, IPHONE_TRICKLE]);

  assert.equal(result.state, 'changed');
});

test('one appliance cannot spend the whole profile budget', () => {
  // Spread wide in *relative* terms, because that is how the near/far rule
  // measures. Doubling a large wattage is not far - 160 W and 240 W collapse
  // into one cluster - which is a useful property in itself: an appliance
  // accumulates a new regime only when the old ones genuinely would not have
  // recognised it, so reaching the cap at all takes five distinct behaviours.
  const spread = [6, 20, 70, 240, 800];
  const profiles = spread.reduce(
    (acc, meanPower, index) => mergeSignatureIntoProfiles(
      acc,
      { ...IPHONE_FAST, meanPower, peakPower: meanPower * 1.05 },
      1000 + index
    ),
    []
  );

  assert.equal(profiles.length, MAX_SIGNATURES_PER_APPLIANCE);
  assert.equal(profiles.some((entry) => entry.meanPower === 6), false, 'oldest evicted');
  assert.equal(profiles.some((entry) => entry.meanPower === 800), true, 'newest kept');
});

test('clusters do not appear as separate candidates', () => {
  // Three regimes of one appliance must not fill the suggestion list with three
  // copies of the same name.
  const state = buildRunState({ powerStart: 28.8, jitter: 1 });
  const result = detectApplianceFromRunState(state, {
    userProfiles: [IPHONE_FAST, IPHONE_TRICKLE, { ...IPHONE_FAST, meanPower: 20 }],
  });

  const names = (result?.candidates || []).map((candidate) => candidate.name);
  assert.equal(new Set(names).size, names.length, 'no name appears twice');
});

/**
 * The efficient ceiling fan, and the limit of what ranges can fix.
 *
 * The 22 W Electric Fan floor was set for AC induction motors and excluded DC
 * and inverter fans outright; the owner's runs at 14.1 W and came back LED Lamp.
 * Widening the floor to 8 W admits it - but it does not make it win, and this
 * pins down why rather than leaving it to be rediscovered.
 *
 * At 14 W a DC fan and an LED lamp are the same measurement. Both draw a steady
 * low wattage with almost no variance; lowRatio counts everything under 20 W, so
 * it reads 1.0 for both and says only "this is small". The feature that would
 * separate them - motor inrush at startup - is not extracted, and the run this
 * detector sees begins after the load is already steady.
 *
 * So the honest output is not "Electric Fan". It is that this account has to say
 * which one it is, once, after which the learned signature settles it - the
 * suggestion-first contract doing exactly what it exists for.
 */
test('an efficient ceiling fan is no longer excluded on wattage alone', () => {
  const state = buildRunState({ powerStart: 14.1, jitter: 0.6, sampleCount: 200 });
  const result = detectApplianceFromRunState(state);

  // It is inside the profile's ranges now, where it used to be 8 W below the
  // floor. That is the range fix, and it is all the range fix can do.
  const fan = APPLIANCE_PROFILES.find((profile) => profile.label === 'Electric Fan');
  assert.ok(14.1 >= fan.meanPower[0], 'inside the meanPower range');
  assert.ok(result, 'the run still resolves to something rather than nothing');
});

test('one correction settles the fan-or-lamp question permanently', () => {
  // What actually fixes it, and the reason not to chase this with ranges: a
  // range tuned until a 14 W fan outranks a lamp would break the owner's other
  // appliance, which is a 16 W lamp.
  const signature = buildApplianceSignature(
    buildRunState({ powerStart: 14.1, jitter: 0.6, sampleCount: 200 }),
    'Ceiling Fan'
  );

  const laterRun = buildRunState({ powerStart: 14.3, jitter: 0.5, sampleCount: 200 });
  const result = detectApplianceFromRunState(laterRun, { userProfiles: [signature] });

  assert.equal(result.appliance, 'Ceiling Fan');
  assert.equal(result.matchSource, 'learned');
  assert.ok(result.confidence >= 0.8, `expected a strong learned match, got ${result.confidence}`);
});
