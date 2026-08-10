const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODEL_VERSION,
  normalizeDetectionState,
  updateDetectionState,
  shouldEvaluateLive,
  detectApplianceFromRunState,
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