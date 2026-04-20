const MODEL_VERSION = 'rule-v1';
const MIN_SAMPLE_COUNT = 20;
const MIN_RUNTIME_MS = 45000;

const ACTIVE_POWER_THRESHOLD_W = 15;
const HIGH_POWER_THRESHOLD_W = 700;
const LOW_POWER_THRESHOLD_W = 20;

const APPLIANCE_PROFILES = [
  {
    label: 'Phone Charger',
    meanPower: [2, 25],
    peakPower: [5, 45],
    stdDevPower: [0, 12],
    runtimeSec: [60, 21600],
    activeRatio: [0.2, 1],
    highRatio: [0, 0.05],
    lowRatio: [0.2, 1],
    weights: {
      meanPower: 0.42,
      peakPower: 0.2,
      stdDevPower: 0.18,
      runtimeSec: 0.08,
      activeRatio: 0.06,
      highRatio: 0.03,
      lowRatio: 0.03,
    },
  },
  {
    label: 'Electric Fan',
    meanPower: [25, 110],
    peakPower: [35, 160],
    stdDevPower: [0, 28],
    runtimeSec: [300, 43200],
    activeRatio: [0.75, 1],
    highRatio: [0, 0.04],
    lowRatio: [0, 0.2],
    weights: {
      meanPower: 0.45,
      peakPower: 0.2,
      stdDevPower: 0.17,
      runtimeSec: 0.08,
      activeRatio: 0.05,
      highRatio: 0.03,
      lowRatio: 0.02,
    },
  },
  {
    label: 'Television',
    meanPower: [45, 220],
    peakPower: [70, 320],
    stdDevPower: [6, 90],
    runtimeSec: [300, 43200],
    activeRatio: [0.65, 1],
    highRatio: [0, 0.08],
    lowRatio: [0, 0.28],
    weights: {
      meanPower: 0.44,
      peakPower: 0.2,
      stdDevPower: 0.18,
      runtimeSec: 0.08,
      activeRatio: 0.05,
      highRatio: 0.03,
      lowRatio: 0.02,
    },
  },
  {
    label: 'Refrigerator',
    meanPower: [70, 260],
    peakPower: [120, 650],
    stdDevPower: [20, 180],
    runtimeSec: [600, 86400],
    activeRatio: [0.2, 0.82],
    highRatio: [0, 0.2],
    lowRatio: [0.1, 0.7],
    weights: {
      meanPower: 0.35,
      peakPower: 0.18,
      stdDevPower: 0.2,
      runtimeSec: 0.08,
      activeRatio: 0.07,
      highRatio: 0.05,
      lowRatio: 0.07,
    },
  },
  {
    label: 'Rice Cooker',
    meanPower: [220, 950],
    peakPower: [350, 1450],
    stdDevPower: [40, 280],
    runtimeSec: [300, 14400],
    activeRatio: [0.45, 1],
    highRatio: [0.1, 0.75],
    lowRatio: [0, 0.35],
    weights: {
      meanPower: 0.4,
      peakPower: 0.2,
      stdDevPower: 0.17,
      runtimeSec: 0.08,
      activeRatio: 0.05,
      highRatio: 0.07,
      lowRatio: 0.03,
    },
  },
  {
    label: 'Electric Iron',
    meanPower: [650, 1800],
    peakPower: [850, 2600],
    stdDevPower: [120, 520],
    runtimeSec: [120, 5400],
    activeRatio: [0.4, 0.95],
    highRatio: [0.2, 0.95],
    lowRatio: [0, 0.35],
    weights: {
      meanPower: 0.37,
      peakPower: 0.2,
      stdDevPower: 0.19,
      runtimeSec: 0.08,
      activeRatio: 0.04,
      highRatio: 0.09,
      lowRatio: 0.03,
    },
  },
  {
    label: 'Electric Kettle',
    meanPower: [900, 2600],
    peakPower: [1200, 3200],
    stdDevPower: [20, 280],
    runtimeSec: [30, 1500],
    activeRatio: [0.9, 1],
    highRatio: [0.7, 1],
    lowRatio: [0, 0.1],
    weights: {
      meanPower: 0.42,
      peakPower: 0.22,
      stdDevPower: 0.14,
      runtimeSec: 0.12,
      activeRatio: 0.04,
      highRatio: 0.05,
      lowRatio: 0.01,
    },
  },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const rangePenalty = (value, range) => {
  const [min, max] = range;
  if (value >= min && value <= max) {
    return 0;
  }

  const span = Math.max(1, max - min);
  if (value < min) {
    return (min - value) / span;
  }
  return (value - max) / span;
};

const getRuntimeMs = (state) => {
  if (!state || state.lastStatus !== 'on') {
    return 0;
  }

  const start = toFiniteNumber(state.runStartedAtMs, 0);
  const end = toFiniteNumber(state.lastSampleAtMs, 0);
  if (!start || !end || end < start) {
    return 0;
  }
  return end - start;
};

const normalizeDetectionState = (rawState = null, fallbackStatus = 'off') => {
  const safeStatus = fallbackStatus === 'on' ? 'on' : 'off';
  const state = rawState && typeof rawState === 'object' ? rawState : {};

  const normalized = {
    modelVersion: MODEL_VERSION,
    lastStatus: state.lastStatus === 'on' ? 'on' : safeStatus,
    runStartedAtMs: state.lastStatus === 'on' ? toFiniteNumber(state.runStartedAtMs, 0) : null,
    lastSampleAtMs: toFiniteNumber(state.lastSampleAtMs, 0),
    sampleCount: Math.max(0, Math.floor(toFiniteNumber(state.sampleCount, 0))),
    meanPower: Math.max(0, toFiniteNumber(state.meanPower, 0)),
    m2Power: Math.max(0, toFiniteNumber(state.m2Power, 0)),
    peakPower: Math.max(0, toFiniteNumber(state.peakPower, 0)),
    activeSamples: Math.max(0, Math.floor(toFiniteNumber(state.activeSamples, 0))),
    highSamples: Math.max(0, Math.floor(toFiniteNumber(state.highSamples, 0))),
    lowSamples: Math.max(0, Math.floor(toFiniteNumber(state.lowSamples, 0))),
  };

  if (normalized.lastStatus !== 'on' || normalized.sampleCount === 0) {
    return {
      ...normalized,
      runStartedAtMs: null,
      sampleCount: 0,
      meanPower: 0,
      m2Power: 0,
      peakPower: 0,
      activeSamples: 0,
      highSamples: 0,
      lowSamples: 0,
    };
  }

  if (!normalized.runStartedAtMs) {
    normalized.runStartedAtMs = normalized.lastSampleAtMs || null;
  }

  return normalized;
};

const updateDetectionState = (previousState, sample) => {
  const safePrevious = normalizeDetectionState(previousState, previousState?.lastStatus || 'off');
  const sampleStatus = sample?.status === 'on' ? 'on' : 'off';
  const samplePower = Math.max(0, toFiniteNumber(sample?.power, 0));
  const sampleTime = Math.max(0, Math.floor(toFiniteNumber(sample?.timestampMs, Date.now())));

  if (sampleStatus !== 'on') {
    return {
      modelVersion: MODEL_VERSION,
      lastStatus: 'off',
      runStartedAtMs: null,
      lastSampleAtMs: sampleTime,
      sampleCount: 0,
      meanPower: 0,
      m2Power: 0,
      peakPower: 0,
      activeSamples: 0,
      highSamples: 0,
      lowSamples: 0,
    };
  }

  if (safePrevious.lastStatus !== 'on' || safePrevious.sampleCount === 0) {
    return {
      modelVersion: MODEL_VERSION,
      lastStatus: 'on',
      runStartedAtMs: sampleTime,
      lastSampleAtMs: sampleTime,
      sampleCount: 1,
      meanPower: samplePower,
      m2Power: 0,
      peakPower: samplePower,
      activeSamples: samplePower >= ACTIVE_POWER_THRESHOLD_W ? 1 : 0,
      highSamples: samplePower >= HIGH_POWER_THRESHOLD_W ? 1 : 0,
      lowSamples: samplePower <= LOW_POWER_THRESHOLD_W ? 1 : 0,
    };
  }

  const sampleCount = safePrevious.sampleCount + 1;
  const delta = samplePower - safePrevious.meanPower;
  const meanPower = safePrevious.meanPower + (delta / sampleCount);
  const m2Power = safePrevious.m2Power + (delta * (samplePower - meanPower));

  return {
    modelVersion: MODEL_VERSION,
    lastStatus: 'on',
    runStartedAtMs: safePrevious.runStartedAtMs || sampleTime,
    lastSampleAtMs: sampleTime,
    sampleCount,
    meanPower,
    m2Power,
    peakPower: Math.max(safePrevious.peakPower, samplePower),
    activeSamples: safePrevious.activeSamples + (samplePower >= ACTIVE_POWER_THRESHOLD_W ? 1 : 0),
    highSamples: safePrevious.highSamples + (samplePower >= HIGH_POWER_THRESHOLD_W ? 1 : 0),
    lowSamples: safePrevious.lowSamples + (samplePower <= LOW_POWER_THRESHOLD_W ? 1 : 0),
  };
};

const shouldEvaluateLive = (state) => {
  if (!state || state.lastStatus !== 'on') {
    return false;
  }

  const runtimeMs = getRuntimeMs(state);
  return state.sampleCount >= MIN_SAMPLE_COUNT && runtimeMs >= MIN_RUNTIME_MS && state.sampleCount % 10 === 0;
};

const extractRunFeatures = (state) => {
  if (!state || state.lastStatus !== 'on' || state.sampleCount <= 0) {
    return null;
  }

  const runtimeMs = getRuntimeMs(state);
  const runtimeSec = Math.max(0, Math.floor(runtimeMs / 1000));
  const denominator = Math.max(1, state.sampleCount);
  const variance = state.sampleCount > 1 ? (state.m2Power / (state.sampleCount - 1)) : 0;
  const stdDevPower = Math.sqrt(Math.max(0, variance));

  return {
    sampleCount: state.sampleCount,
    runtimeSec,
    meanPower: Math.max(0, state.meanPower),
    peakPower: Math.max(0, state.peakPower),
    stdDevPower,
    activeRatio: clamp(state.activeSamples / denominator, 0, 1),
    highRatio: clamp(state.highSamples / denominator, 0, 1),
    lowRatio: clamp(state.lowSamples / denominator, 0, 1),
  };
};

const scoreProfile = (features, profile) => {
  const weights = profile.weights;

  const score =
    (weights.meanPower * rangePenalty(features.meanPower, profile.meanPower)) +
    (weights.peakPower * rangePenalty(features.peakPower, profile.peakPower)) +
    (weights.stdDevPower * rangePenalty(features.stdDevPower, profile.stdDevPower)) +
    (weights.runtimeSec * rangePenalty(features.runtimeSec, profile.runtimeSec)) +
    (weights.activeRatio * rangePenalty(features.activeRatio, profile.activeRatio)) +
    (weights.highRatio * rangePenalty(features.highRatio, profile.highRatio)) +
    (weights.lowRatio * rangePenalty(features.lowRatio, profile.lowRatio));

  return {
    label: profile.label,
    score,
  };
};

const toCandidateConfidence = (score) => {
  return clamp(1 - (score / 2), 0, 0.99);
};

const detectApplianceFromRunState = (runState) => {
  const features = extractRunFeatures(runState);
  if (!features) {
    return null;
  }

  if (features.sampleCount < MIN_SAMPLE_COUNT && features.runtimeSec < (MIN_RUNTIME_MS / 1000)) {
    return null;
  }

  const ranked = APPLIANCE_PROFILES
    .map((profile) => scoreProfile(features, profile))
    .sort((a, b) => a.score - b.score);

  const top = ranked[0];
  const second = ranked[1] || null;
  const margin = second ? (second.score - top.score) : 0.25;

  let confidence = toCandidateConfidence(top.score);
  confidence = clamp(confidence + Math.min(0.15, Math.max(0, margin) * 0.15), 0, 0.99);

  if (top.score > 1.15 || confidence < 0.62) {
    return null;
  }

  const candidates = ranked.slice(0, 3).map((entry) => ({
    name: entry.label,
    confidence: Number(toCandidateConfidence(entry.score).toFixed(2)),
  }));

  return {
    appliance: top.label,
    confidence: Number(confidence.toFixed(2)),
    candidates,
    modelVersion: MODEL_VERSION,
    features: {
      sampleCount: features.sampleCount,
      runtimeSec: features.runtimeSec,
      meanPower: Number(features.meanPower.toFixed(1)),
      peakPower: Number(features.peakPower.toFixed(1)),
      stdDevPower: Number(features.stdDevPower.toFixed(1)),
      activeRatio: Number(features.activeRatio.toFixed(2)),
      highRatio: Number(features.highRatio.toFixed(2)),
      lowRatio: Number(features.lowRatio.toFixed(2)),
    },
  };
};

module.exports = {
  MODEL_VERSION,
  normalizeDetectionState,
  updateDetectionState,
  shouldEvaluateLive,
  detectApplianceFromRunState,
};