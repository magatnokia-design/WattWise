const MODEL_VERSION = 'rule-v3';

// A "run" is one continuous stretch of an appliance actually drawing power.
// It deliberately does NOT start when the relay closes: an outlet can sit on
// with nothing plugged into it, and those 0 W samples would drag the measured
// mean toward zero and mislabel the appliance that gets plugged in later.
const LOAD_PRESENT_THRESHOLD_W = 3;
// Consecutive sub-threshold samples that end a run (appliance unplugged or
// finished). A short dip does not end it - chargers taper, fans restart.
const IDLE_SAMPLES_TO_END_RUN = 3;

// KNOWN LIMITATION - a run only ends when the outlet is switched off, or when the
// draw falls below LOAD_PRESENT_THRESHOLD_W for IDLE_SAMPLES_TO_END_RUN samples.
// A *sustained level shift* does not end it.
//
// So swapping appliances while the outlet stays powered keeps one run going
// across both, and every figure drawn from it is a blend. Measured on hardware:
// a 14 W lamp replaced by a 56 W fan reported a mean of 23 W on an outlet
// actually drawing 56 W, and the blend pushed the standard deviation from 0.5 to
// 17.3 - erratic draw is a Speaker's whole signature, so "Speaker @ 0.84" is what
// it suggested. Confidently wrong, from good evidence mixed with stale evidence.
//
// Switching the outlet off and on clears it, and both clients now say so on
// screen when the identity reads 'changed'. That is a workaround, not a fix: the
// run should restart on its own when the level shifts and stays shifted. Doing
// that safely needs a rolling window rather than a single-sample threshold,
// because a laptop charger genuinely swings 15<->60 W - the difference is that it
// swings *both ways* while a swap steps one way and stays there.

const MIN_SAMPLE_COUNT = 4;
const MIN_RUNTIME_MS = 3000;
const LIVE_EVALUATION_SAMPLE_INTERVAL = 2;

const MIN_DETECTABLE_MEAN_POWER_W = 3;
const MIN_DETECTABLE_PEAK_POWER_W = 5;

// Whether to report at all is decided by fit alone, never by confidence: two
// profiles tying is a reason to ask the user which one it is, not a reason to
// stay silent. Real in-scope loads score roughly 0.13-0.25 here; a load far
// outside the appliances this system supports scores above 0.5.
const MAX_ACCEPTABLE_SCORE = 0.55;
// Below this separation between the top two profiles, power alone cannot settle
// the answer and the user has to pick.
const AMBIGUOUS_MARGIN = 0.12;

// Learned ("confirm to learn") signatures recorded from the user's own runs.
// A saved signature holds measured values rather than the wide ranges the
// generic profiles use, so it is scored by relative deviation instead.
const MAX_USER_PROFILES = 20;
// Above this score the saved signature is too far off to claim a match, and the
// generic profiles take over.
const USER_PROFILE_MAX_SCORE = 0.45;
// Multiplier applied to a learned signature's score so it outranks generic
// profiles on close calls without overriding a clearly better generic match.
const LEARNED_SCORE_ADVANTAGE = 0.6;

const ACTIVE_POWER_THRESHOLD_W = 15;
const HIGH_POWER_THRESHOLD_W = 700;
const LOW_POWER_THRESHOLD_W = 20;

// Low-voltage appliances only, per the project's hard constraints.
//
// Wattage ranges overlap heavily on purpose - a 50 W laptop charger and a 53 W
// fan really do draw the same power. What separates them is stdDevPower:
// resistive/steady loads (lamp, fan at a fixed speed, router) hold a flat draw,
// while switching loads (laptop charger, TV, console) swing with demand. Where
// even that is not enough, the detector reports the run as ambiguous and the
// user chooses between the ranked candidates.
const APPLIANCE_PROFILES = [
  {
    label: 'Phone Charger',
    meanPower: [2, 18],
    peakPower: [4, 30],
    stdDevPower: [0.3, 7],
    runtimeSec: [60, 21600],
    activeRatio: [0, 0.35],
    highRatio: [0, 0.02],
    lowRatio: [0.7, 1],
  },
  {
    label: 'LED Lamp',
    meanPower: [3, 22],
    peakPower: [4, 28],
    // A lamp is the steadiest load on the list; this is what separates it from
    // a charger at the same wattage.
    stdDevPower: [0, 1.5],
    runtimeSec: [60, 43200],
    activeRatio: [0, 0.4],
    highRatio: [0, 0.02],
    lowRatio: [0.7, 1],
  },
  {
    label: 'Electric Fan',
    meanPower: [22, 95],
    peakPower: [28, 130],
    // Fixed-speed motor: steady once spun up.
    stdDevPower: [0, 9],
    runtimeSec: [120, 43200],
    activeRatio: [0.7, 1],
    highRatio: [0, 0.03],
    lowRatio: [0, 0.3],
  },
  {
    label: 'Laptop Charger',
    meanPower: [18, 80],
    peakPower: [28, 120],
    // Swings with CPU load and battery state - the discriminator against a fan.
    stdDevPower: [6, 30],
    runtimeSec: [120, 43200],
    activeRatio: [0.4, 1],
    highRatio: [0, 0.03],
    lowRatio: [0, 0.6],
  },
  {
    label: 'Monitor',
    meanPower: [14, 50],
    peakPower: [18, 75],
    stdDevPower: [0.5, 12],
    runtimeSec: [120, 43200],
    activeRatio: [0.4, 1],
    highRatio: [0, 0.02],
    lowRatio: [0, 0.55],
  },
  {
    label: 'Speaker',
    meanPower: [5, 45],
    peakPower: [10, 90],
    // Audio-dependent: the most erratic low-wattage load.
    stdDevPower: [4, 30],
    runtimeSec: [60, 43200],
    activeRatio: [0.1, 0.95],
    highRatio: [0, 0.03],
    lowRatio: [0.05, 0.95],
  },
  {
    label: 'Television',
    meanPower: [45, 190],
    peakPower: [60, 270],
    stdDevPower: [5, 45],
    runtimeSec: [180, 43200],
    activeRatio: [0.7, 1],
    highRatio: [0, 0.06],
    lowRatio: [0, 0.25],
  },
  {
    label: 'Game Console',
    meanPower: [60, 230],
    peakPower: [90, 330],
    // Load swings hard between menu and gameplay.
    stdDevPower: [12, 70],
    runtimeSec: [180, 43200],
    activeRatio: [0.8, 1],
    highRatio: [0, 0.05],
    lowRatio: [0, 0.2],
  },
];

// Shared across every generic profile: mean power carries the most signal,
// spread is the tie-breaker between same-wattage appliances.
// The highest mean draw any supported profile claims, derived from the catalogue
// rather than written down separately so it cannot fall out of step with it.
//
// Above this, no generic profile covers the load - but scoring alone did not say
// so. `rangePenalty` grades an out-of-range value by how far outside it sits, and
// at 250-300 W the overshoot past Game Console's 230 W ceiling was still cheap
// enough to keep the total under MAX_ACCEPTABLE_SCORE. The result was worse than
// the silence it was meant to avoid: a 300 W rice cooker was reported to the user
// as a "Game Console" at 0.41 confidence, with an Accept button next to it.
//
// Being told nothing is recoverable. Being told the wrong thing confidently, on a
// system whose hard constraint is low-voltage appliances only, is not.
const MAX_PROFILE_MEAN_POWER_W = Math.max(
  ...APPLIANCE_PROFILES.map((profile) => profile.meanPower[1])
);

const PROFILE_WEIGHTS = {
  meanPower: 0.38,
  peakPower: 0.17,
  stdDevPower: 0.25,
  runtimeSec: 0.05,
  activeRatio: 0.08,
  highRatio: 0.03,
  lowRatio: 0.04,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// Penalty at the very edge of a profile's range. Scoring in-range values as a
// flat 0 made every overlapping profile tie, so nothing could ever be told
// apart; grading by distance from the range's centre is what separates a 53 W
// fan from a 53 W laptop charger. Out-of-range always scores worse than any
// in-range value.
const IN_RANGE_EDGE_PENALTY = 0.35;

const rangePenalty = (value, range) => {
  const [min, max] = range;
  const span = Math.max(1e-6, max - min);

  if (value >= min && value <= max) {
    const midpoint = (min + max) / 2;
    const halfSpan = span / 2;
    return IN_RANGE_EDGE_PENALTY * (Math.abs(value - midpoint) / halfSpan);
  }

  const overshoot = value < min ? (min - value) : (value - max);
  return IN_RANGE_EDGE_PENALTY + (overshoot / Math.max(1, span));
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

const emptyRun = (status, sampleTime) => ({
  modelVersion: MODEL_VERSION,
  lastStatus: status,
  runStartedAtMs: null,
  lastSampleAtMs: sampleTime,
  sampleCount: 0,
  meanPower: 0,
  m2Power: 0,
  peakPower: 0,
  activeSamples: 0,
  highSamples: 0,
  lowSamples: 0,
  idleStreak: 0,
});

const normalizeDetectionState = (rawState = null, fallbackStatus = 'off') => {
  const safeStatus = fallbackStatus === 'on' ? 'on' : 'off';
  const state = rawState && typeof rawState === 'object' ? rawState : {};

  // A run measured under an older model was accumulated by different rules -
  // earlier versions averaged in the idle samples before a load appeared - so
  // its totals cannot be compared against these profiles. Start clean instead.
  if (state.modelVersion && state.modelVersion !== MODEL_VERSION) {
    return emptyRun(safeStatus, toFiniteNumber(state.lastSampleAtMs, 0));
  }

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
    idleStreak: Math.max(0, Math.floor(toFiniteNumber(state.idleStreak, 0))),
  };

  if (normalized.lastStatus !== 'on' || normalized.sampleCount === 0) {
    return emptyRun(normalized.lastStatus, normalized.lastSampleAtMs);
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
    return emptyRun('off', sampleTime);
  }

  const hasLoad = samplePower >= LOAD_PRESENT_THRESHOLD_W;

  if (!hasLoad) {
    // Outlet is on but nothing is drawing power yet: hold at zero samples so the
    // run begins the moment something is actually plugged in.
    if (safePrevious.sampleCount === 0) {
      return emptyRun('on', sampleTime);
    }

    const idleStreak = safePrevious.idleStreak + 1;
    if (idleStreak >= IDLE_SAMPLES_TO_END_RUN) {
      return emptyRun('on', sampleTime);
    }

    // A brief dip: keep the run's measurements untouched rather than averaging
    // the near-zero reading into them.
    return {
      ...safePrevious,
      modelVersion: MODEL_VERSION,
      lastSampleAtMs: sampleTime,
      idleStreak,
    };
  }

  if (safePrevious.sampleCount === 0) {
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
      idleStreak: 0,
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
    idleStreak: 0,
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
  const score =
    (PROFILE_WEIGHTS.meanPower * rangePenalty(features.meanPower, profile.meanPower)) +
    (PROFILE_WEIGHTS.peakPower * rangePenalty(features.peakPower, profile.peakPower)) +
    (PROFILE_WEIGHTS.stdDevPower * rangePenalty(features.stdDevPower, profile.stdDevPower)) +
    (PROFILE_WEIGHTS.runtimeSec * rangePenalty(features.runtimeSec, profile.runtimeSec)) +
    (PROFILE_WEIGHTS.activeRatio * rangePenalty(features.activeRatio, profile.activeRatio)) +
    (PROFILE_WEIGHTS.highRatio * rangePenalty(features.highRatio, profile.highRatio)) +
    (PROFILE_WEIGHTS.lowRatio * rangePenalty(features.lowRatio, profile.lowRatio));

  return { label: profile.label, score };
};

// Fit alone is not confidence: two profiles can both fit a run perfectly, and
// claiming 99% for either would be a lie. Separation from the runner-up is what
// turns a good fit into a confident answer.
const toConfidence = (score, margin) => {
  const fit = 1 - clamp(score / 0.9, 0, 1);
  const separation = clamp(margin / 0.18, 0, 1);
  return clamp(fit * (0.55 + (0.45 * separation)), 0, 0.99);
};

// Deviation relative to the learned value. The floor keeps tiny reference values
// (a 3 W charger) from turning a 1 W difference into a huge relative error.
const relativeDeviation = (value, reference, floor) => {
  const base = Math.max(Math.abs(toFiniteNumber(reference, 0)), floor);
  return Math.abs(toFiniteNumber(value, 0) - toFiniteNumber(reference, 0)) / base;
};

// "Outlet 1" / "Outlet 2" are placeholder labels, not appliances. Learning one
// as a signature made every future run match a meaningless profile, and it
// showed up in Saved Appliances as if the user had confirmed it.
const isPlaceholderLabel = (label) => /^outlet\s*\d+$/i.test(String(label || '').trim());

const normalizeUserProfiles = (rawProfiles) => {
  if (!Array.isArray(rawProfiles)) return [];

  return rawProfiles
    .map((profile) => {
      const label = String(profile?.label || profile?.name || '').trim();
      if (!label || isPlaceholderLabel(label)) return null;

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
  if (!normalizedLabel || isPlaceholderLabel(normalizedLabel)) return null;

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

/**
 * Is the load on this outlet still the appliance the outlet is named after?
 *
 * The name is a label the user set once; the appliance behind it can be
 * unplugged and replaced at any moment, and nothing was checking. So an outlet
 * named "LED Lamp" went on calling itself an LED Lamp while a 60 W ceiling fan
 * ran on it - on the dashboard, in the history log written at switch-on, and in
 * the per-appliance energy split. The system had the evidence to know better and
 * never asked the question.
 *
 * Asked by scoring the live run against the learned signature saved under that
 * name, not by comparing labels: the generic detector can call a run "Laptop
 * Charger" when it is genuinely the user's fan, and a label mismatch there is
 * ambiguity, not a swapped appliance.
 *
 * States:
 *   unnamed    nothing to check - the outlet has no user-given name
 *   unknown    named, but no signature learned yet, or too few samples so far
 *   confirmed  the run matches the named appliance's signature
 *   changed    it does not; whatever is plugged in, it is not that
 *
 * `changed` is the one that matters: it is the system's only way of saying "the
 * name on this outlet is currently wrong", and it must never be inferred from
 * silence. `unknown` is not `changed`.
 */
const matchNamedAppliance = (runState, label, userProfiles) => {
  const normalizedLabel = String(label || '').trim();
  if (!normalizedLabel || isPlaceholderLabel(normalizedLabel)) {
    return { state: 'unnamed', score: null };
  }

  const features = extractRunFeatures(
    normalizeDetectionState(runState, runState?.lastStatus || 'off')
  );

  if (!features || features.sampleCount < MIN_SAMPLE_COUNT) {
    return { state: 'unknown', score: null };
  }

  const profile = normalizeUserProfiles(userProfiles).find(
    (entry) => entry.label.toLowerCase() === normalizedLabel.toLowerCase()
  );

  // Named but never learned. The user typed a label; that is a claim, not a
  // measurement, and there is nothing to check it against.
  if (!profile) {
    return { state: 'unknown', score: null };
  }

  const { score } = scoreUserProfile(features, profile);

  return {
    state: score <= USER_PROFILE_MAX_SCORE ? 'confirmed' : 'changed',
    score: Number(score.toFixed(3)),
  };
};

/**
 * The verdict both clients read: does the outlet's name still describe what is
 * plugged into it, and should a correction be offered?
 *
 * Pure, and here rather than inline in updateOutletMetrics, because it has now
 * been wrong twice in ways nothing could catch:
 *
 *   - gating the prompt on 'changed' alone silenced the 'unknown' case, so an
 *     outlet named "Speaker" with no signature, running a load measured as
 *     "LED Lamp", offered no correction at all
 *   - `recognised` was taken from the detector's match source alone, which says
 *     the best match anywhere was a learned one - not that the outlet's own name
 *     held up. "Speaker - recognised" was displayed for an LED lamp
 *
 * Both rendered as confident, specific, wrong statements on two clients at once.
 *
 * @param {object} match Result of matchNamedAppliance for this run.
 * @param {object} detection Result of detectApplianceFromRunState, or null.
 * @param {string} namedAs The outlet's user-given name, placeholders removed.
 */
const buildApplianceIdentity = (match, detection, namedAs) => {
  const measuredAs = detection?.appliance || '';
  const name = String(namedAs || '').trim();

  const nameIsWrong = match.state === 'changed';
  // Named, but nothing learned to check it against - unverified, not fine.
  const nameUnverified = match.state === 'unknown';
  const labelsDiffer = !!name
    && !!measuredAs
    && name.toLowerCase() !== measuredAs.toLowerCase();

  return {
    namedAs: name,
    measuredAs,
    state: match.state,
    matchScore: match.score,
    // Requires the name itself to hold up, not merely that some learned
    // signature won the ranking.
    recognised: match.state === 'confirmed' && detection?.matchSource === 'learned',
    confidence: detection?.confidence ?? null,
    unsupported: detection?.unsupported === true,
    suggestionPending: !!measuredAs
      && (nameIsWrong || !name || (nameUnverified && labelsDiffer)),
  };
};

/**
 * The name to record on a history line for an outlet.
 *
 * A log entry is permanent, so it must not assert an appliance the system has
 * already measured as no longer being there. "LED Lamp turned ON" was written
 * for a run that was a 60 W ceiling fan, purely because the label had not been
 * updated yet - and unlike a live screen, a log cannot correct itself later.
 *
 * Falls back to the outlet's slot number, which is always true.
 */
const resolveOutletLogName = (outletData, outletNumber) => {
  const fallback = `Outlet ${outletNumber}`;
  const name = String(outletData?.applianceName || '').trim();

  if (!name || isPlaceholderLabel(name)) return fallback;
  if (outletData?.applianceIdentity?.state === 'changed') return fallback;

  return name;
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
  const eligibleLearned = bestLearned && bestLearned.score <= USER_PROFILE_MAX_SCORE
    ? [bestLearned]
    : [];

  // Learned signatures get an advantage, not an automatic win: they describe
  // this account's actual hardware, but a saved fan must not hijack a run that
  // plainly matches something else.
  const ranked = [...eligibleLearned, ...genericRanked]
    .map((entry) => ({
      ...entry,
      effectiveScore: entry.source === 'learned'
        ? entry.score * LEARNED_SCORE_ADVANTAGE
        : entry.score,
    }))
    .sort((a, b) => a.effectiveScore - b.effectiveScore)
    // A learned label and a generic profile can share a name; keep the better.
    .filter((entry, index, all) =>
      all.findIndex((other) => other.label === entry.label) === index);

  const top = ranked[0];
  const second = ranked[1] || null;
  const margin = second ? (second.effectiveScore - top.effectiveScore) : 0.35;

  // Beyond the catalogue's reach. Checked separately from the score because
  // scoring is relative - it finds the *least bad* profile and will always find
  // one, however far outside the supported range the load sits.
  //
  // A learned signature is exempt: if the user measured and named this appliance
  // themselves, they know better than the generic ranges do, and overruling them
  // with "unsupported" would discard the one piece of ground truth on the system.
  const beyondCatalogue = top.source !== 'learned'
    && features.meanPower > MAX_PROFILE_MEAN_POWER_W;

  // The load does not resemble anything this system supports. That is a finding,
  // not an absence of one - the run was measured, scored against every profile,
  // and rejected by all of them.
  //
  // Returning bare null made it indistinguishable from "still gathering data",
  // so a 1200 W kettle on a low-voltage-only system produced exactly the same
  // silence as a lamp switched on two seconds ago. The user is left waiting for
  // a suggestion that is never coming, with nothing on screen to say why.
  //
  // `appliance` stays null so no caller can mistake this for an identification;
  // `unsupported` is what the clients render.
  if (beyondCatalogue || top.effectiveScore > MAX_ACCEPTABLE_SCORE) {
    return {
      appliance: null,
      unsupported: true,
      confidence: 0,
      ambiguous: false,
      candidates: [],
      matchSource: null,
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
  }

  const confidence = toConfidence(top.effectiveScore, margin);

  // Candidates the user can pick from when power alone cannot separate them.
  const candidates = ranked
    .filter((entry, index) => index === 0 || entry.effectiveScore <= top.effectiveScore + 0.2)
    .slice(0, 4)
    .map((entry, index) => ({
      name: entry.label,
      confidence: Number(
        toConfidence(entry.effectiveScore, index === 0 ? margin : 0).toFixed(2)
      ),
      source: entry.source || 'generic',
    }));

  // Ambiguous when the runner-up is nearly as good an explanation as the
  // winner - that is the user's call to make, not the detector's.
  const runnerUpConfidence = candidates[1]?.confidence ?? 0;
  const isAmbiguous =
    candidates.length > 1 &&
    top.source !== 'learned' &&
    (confidence - runnerUpConfidence) < AMBIGUOUS_MARGIN;

  return {
    appliance: top.label,
    confidence: Number(confidence.toFixed(2)),
    ambiguous: isAmbiguous,
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
  isPlaceholderLabel,
  MIN_SAMPLE_COUNT,
  LOAD_PRESENT_THRESHOLD_W,
  APPLIANCE_PROFILES,
  normalizeDetectionState,
  updateDetectionState,
  shouldEvaluateLive,
  detectApplianceFromRunState,
  matchNamedAppliance,
  buildApplianceIdentity,
  resolveOutletLogName,
  normalizeUserProfiles,
  buildApplianceSignature,
};
