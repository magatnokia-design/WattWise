const MODEL_VERSION = 'rule-v2';
const MIN_SAMPLE_COUNT = 5;
const MIN_RUNTIME_MS = 5000;
const LIVE_EVALUATION_SAMPLE_INTERVAL = 3;

const MIN_DETECTABLE_MEAN_POWER_W = 4;
const MIN_DETECTABLE_PEAK_POWER_W = 6;

const MIN_CONFIDENCE = 0.7;

// Learned ("confirm to learn") signatures recorded from the user's own runs.
// A saved signature holds measured values rather than the wide ranges the
// generic profiles use, so it is scored by relative deviation instead.
const MAX_USER_PROFILES = 20;
// Above this score the saved signature is too far off to claim a match, and the
// generic profiles take over.
const USER_PROFILE_MAX_SCORE = 0.45;

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
  return (
    state.sampleCount >= MIN_SAMPLE_COUNT &&
    runtimeMs >= MIN_RUNTIME_MS &&
    state.sampleCount % LIVE_EVALUATION_SAMPLE_INTERVAL === 0
  );
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

// Deviation relative to the learned value. The floor keeps tiny reference values
// (a 3 W charger) from turning a 1 W difference into a huge relative error.
const relativeDeviation = (value, reference, floor) => {
  const base = Math.max(Math.abs(toFiniteNumber(reference, 0)), floor);
  return Math.abs(toFiniteNumber(value, 0) - toFiniteNumber(reference, 0)) / base;
};

const normalizeUserProfiles = (rawProfiles) => {
  if (!Array.isArray(rawProfiles)) return [];

  return rawProfiles
    .map((profile) => {
      const label = String(profile?.label || profile?.name || '').trim();
      if (!label) return null;

      const meanPower = Math.max(0, toFiniteNumber(profile.meanPower, 0));
      const peakPower = Math.max(0, toFiniteNumber(profile.peakPower, 0));
      if (meanPower <= 0 && peakPower <= 0) return null;

      return {
        label,
        meanPower,
        peakPower,
        stdDevPower: Math.max(0, toFiniteNumber(profile.stdDevPower, 0)),
        activeRatio: clamp(toFiniteNumber(profile.activeRatio, 0), 0, 1),
        lowRatio: clamp(toFiniteNumber(profile.lowRatio, 0), 0, 1),
        updatedAtMs: Math.max(0, Math.floor(toFiniteNumber(profile.updatedAtMs, 0))),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_USER_PROFILES);
};

const scoreUserProfile = (features, profile) => {
  const score =
    (0.50 * relativeDeviation(features.meanPower, profile.meanPower, 5)) +
    (0.25 * relativeDeviation(features.peakPower, profile.peakPower, 8)) +
    (0.15 * relativeDeviation(features.stdDevPower, profile.stdDevPower, 4)) +
    (0.10 * Math.abs(features.activeRatio - profile.activeRatio));

  return {
    label: profile.label,
    score,
    source: 'learned',
  };
};

// Snapshot of a completed/among-run measurement, stored so a confirmed
// appliance can be recognised on later runs.
const buildApplianceSignature = (runState, label) => {
  const normalizedLabel = String(label || '').trim();
  if (!normalizedLabel) return null;

  const features = extractRunFeatures(normalizeDetectionState(runState, runState?.lastStatus || 'off'));
  if (!features) return null;
  if (features.sampleCount < MIN_SAMPLE_COUNT) return null;
  if (features.meanPower < MIN_DETECTABLE_MEAN_POWER_W && features.peakPower < MIN_DETECTABLE_PEAK_POWER_W) {
    return null;
  }

  return {
    label: normalizedLabel,
    meanPower: Number(features.meanPower.toFixed(2)),
    peakPower: Number(features.peakPower.toFixed(2)),
    stdDevPower: Number(features.stdDevPower.toFixed(2)),
    activeRatio: Number(features.activeRatio.toFixed(3)),
    lowRatio: Number(features.lowRatio.toFixed(3)),
    sampleCount: features.sampleCount,
    runtimeSec: features.runtimeSec,
    modelVersion: MODEL_VERSION,
  };
};

const detectApplianceFromRunState = (runState, options = {}) => {
  const features = extractRunFeatures(runState);
  if (!features) {
    return null;
  }

  if (features.sampleCount < MIN_SAMPLE_COUNT || features.runtimeSec < (MIN_RUNTIME_MS / 1000)) {
    return null;
  }

  // Prevent no-load noise from being labeled as a real appliance.
  if (
    features.meanPower < MIN_DETECTABLE_MEAN_POWER_W &&
    features.peakPower < MIN_DETECTABLE_PEAK_POWER_W
  ) {
    return null;
  }

  const genericRanked = APPLIANCE_PROFILES
    .map((profile) => scoreProfile(features, profile))
    .sort((a, b) => a.score - b.score);

  // The user's own confirmed signatures are matched first: they describe the
  // exact appliances on this account, so they beat the generic power ranges
  // whenever they are close enough.
  const learnedRanked = normalizeUserProfiles(options.userProfiles)
    .map((profile) => scoreUserProfile(features, profile))
    .sort((a, b) => a.score - b.score);

  const bestLearned = learnedRanked[0] || null;
  const usingLearned = !!bestLearned && bestLearned.score <= USER_PROFILE_MAX_SCORE;

  const ranked = usingLearned
    ? [bestLearned, ...genericRanked]
    : genericRanked;

  const top = ranked[0];
  const second = ranked[1] || null;
  const margin = second ? (second.score - top.score) : 0.25;

  let confidence = toCandidateConfidence(top.score);
  confidence = clamp(confidence + Math.min(0.15, Math.max(0, margin) * 0.15), 0, 0.99);

  if (top.score > 1.15 || confidence < MIN_CONFIDENCE) {
    return null;
  }

  const candidates = ranked.slice(0, 3).map((entry) => ({
    name: entry.label,
    confidence: Number(toCandidateConfidence(entry.score).toFixed(2)),
    source: entry.source || 'generic',
  }));

  return {
    appliance: top.label,
    confidence: Number(confidence.toFixed(2)),
    candidates,
    matchSource: top.source || 'generic',
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
  MAX_USER_PROFILES,
  normalizeDetectionState,
  updateDetectionState,
  shouldEvaluateLive,
  detectApplianceFromRunState,
  normalizeUserProfiles,
  buildApplianceSignature,
};
