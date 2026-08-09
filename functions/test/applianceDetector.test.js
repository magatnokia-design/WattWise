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
  // Live evaluation only runs every 3rd sample, so the count must land on the
  // interval boundary.
  const state = buildRunState({ powerStart: 80, jitter: 3, sampleCount: 48 });

  assert.equal(state.lastStatus, 'on');
  assert.equal(shouldEvaluateLive(state), true);
});

test('shouldEvaluateLive stays false between evaluation intervals', () => {
  const state = buildRunState({ powerStart: 80, jitter: 3, sampleCount: 50 });

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

test('detectApplianceFromRunState identifies phone charger profile', () => {
  const state = buildRunState({ powerStart: 8, jitter: 1, sampleCount: 60 });
  const result = detectApplianceFromRunState(state);

  assert.ok(result);
  assert.equal(result.appliance, 'Phone Charger');
  assert.ok(result.confidence >= 0.62);
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

  const otherRun = buildRunState({ powerStart: 300, jitter: 10, sampleCount: 45 });
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