const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODEL_VERSION,
  normalizeDetectionState,
  updateDetectionState,
  shouldEvaluateLive,
  detectApplianceFromRunState,
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
  const state = buildRunState({ powerStart: 80, jitter: 3, sampleCount: 50 });

  assert.equal(state.lastStatus, 'on');
  assert.equal(shouldEvaluateLive(state), true);
});

test('detectApplianceFromRunState identifies electric fan profile', () => {
  const state = buildRunState({ powerStart: 72, jitter: 4, sampleCount: 80 });
  const result = detectApplianceFromRunState(state);

  assert.ok(result);
  assert.equal(result.appliance, 'Electric Fan');
  assert.ok(result.confidence >= 0.62);
  assert.ok(Array.isArray(result.candidates));
});

test('detectApplianceFromRunState identifies electric kettle profile', () => {
  const state = buildRunState({ powerStart: 1780, jitter: 40, sampleCount: 65 });
  const result = detectApplianceFromRunState(state);

  assert.ok(result);
  assert.equal(result.appliance, 'Electric Kettle');
  assert.ok(result.confidence >= 0.62);
});

test('detectApplianceFromRunState skips low-sample runs', () => {
  const state = buildRunState({ powerStart: 85, jitter: 3, sampleCount: 8 });
  const result = detectApplianceFromRunState(state);

  assert.equal(result, null);
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