/**
 * Detects that a charge has finished, from the wattage alone.
 *
 * A charger under load follows a constant-current then constant-voltage curve:
 * it draws hard while the battery fills, tapers as it approaches full, and
 * settles to a small standby draw once done. That settle is visible in the
 * meter without knowing anything about the device, which is the whole basis of
 * this module.
 *
 * WHAT THIS IS FOR, AND WHAT IT MUST NOT BECOME
 *
 * It reports. It does not switch anything off. Appliance detection in this
 * project is suggestion-first, and a feature that cut power on an inference
 * would be a much larger promise than the measurement supports - a laptop that
 * finished charging but is still running looks similar to one that was
 * unplugged. Keep the action with the user.
 *
 * Nothing here feeds billing, budgets or safety. Energy comes from the PZEM
 * counter, cost from PELCO III applied to that energy, and the cutoff compares
 * measured watts against a threshold; none of them read this state.
 *
 * WHAT IT CANNOT SEE
 *
 * A charger whose standby draw falls under the meter's resolution is
 * indistinguishable from one that was unplugged. Rather than guess, this stays
 * silent in that case: `settled` requires a draw still visible on the meter.
 * The cost of that choice is a missed notification; the alternative is telling
 * someone their phone finished charging when they had in fact pulled the plug.
 */

// Below this the meter is not seeing anything - the load is gone, and the run
// ends. Deliberately lower than the 0.5 W load floor used for "is something
// plugged in", because a finished charger sits in exactly that gap: a phone
// charger at rest draws roughly 0.1-0.3 W, and treating that as "nothing" would
// reset the run at the precise moment it becomes interesting.
const STILL_CONNECTED_W = 0.1;

// A run has to have drawn something real to count as a charge. Under this and
// whatever happened was too small to have been a battery filling.
const MIN_CHARGE_PEAK_W = 8;

// A finished charge is small in absolute terms *and* small relative to its own
// peak. Both are required, and the absolute ceiling is what keeps a fan dropped
// to a lower speed out: 56 W falling to 35 W is 62% of peak and nowhere near
// 5 W, so it never qualifies however long it holds.
const SETTLED_MAX_W = 5;
const SETTLED_RATIO = 0.25;

// How long the settled level has to hold. A taper passes through these values
// on its way down, so without this the notification fires mid-charge.
const SETTLED_HOLD_MS = 5 * 60 * 1000;

// A charge takes time. This rejects a brief high blip followed by a low one,
// which is a plug being wiggled rather than a battery filling.
const MIN_RUN_MS = 3 * 60 * 1000;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const emptyState = (lastSampleAtMs = 0) => ({
  state: 'idle',
  peakW: 0,
  runStartedAtMs: null,
  settledSinceMs: null,
  notifiedAtMs: null,
  lastSampleAtMs,
});

const normalize = (raw = null) => {
  const state = raw && typeof raw === 'object' ? raw : {};
  const name = state.state;

  return {
    state: name === 'charging' || name === 'settled' ? name : 'idle',
    peakW: Math.max(0, toFiniteNumber(state.peakW, 0)),
    runStartedAtMs: toFiniteNumber(state.runStartedAtMs, 0) || null,
    settledSinceMs: toFiniteNumber(state.settledSinceMs, 0) || null,
    notifiedAtMs: toFiniteNumber(state.notifiedAtMs, 0) || null,
    lastSampleAtMs: Math.max(0, toFiniteNumber(state.lastSampleAtMs, 0)),
  };
};

/**
 * Advances the charging state by one telemetry sample.
 *
 * @param {object|null} previous Stored state from the outlet document.
 * @param {object} sample `{ status, powerW, timestampMs }`.
 * @returns {object} Next state, plus `justSettled` - true on the single
 *   transition where a finished charge becomes reportable and has not been
 *   reported yet. The caller notifies on that edge and stores `notifiedAtMs`.
 */
const updateChargingState = (previous, sample = {}) => {
  const prior = normalize(previous);
  const isOn = String(sample.status || '').trim().toLowerCase() === 'on';
  const powerW = Math.max(0, toFiniteNumber(sample.powerW, 0));
  const nowMs = Math.max(0, Math.floor(toFiniteNumber(sample.timestampMs, Date.now())));

  // Switched off, or nothing on the meter: the run is over either way. No
  // notification - an outlet turned off tells us nothing about a battery.
  if (!isOn || powerW < STILL_CONNECTED_W) {
    return { ...emptyState(nowMs), justSettled: false };
  }

  const runStartedAtMs = prior.runStartedAtMs || nowMs;
  const peakW = Math.max(prior.peakW, powerW);

  // Not yet enough of a draw to call anything a charge.
  if (peakW < MIN_CHARGE_PEAK_W) {
    return {
      ...prior,
      state: 'charging',
      peakW,
      runStartedAtMs,
      settledSinceMs: null,
      lastSampleAtMs: nowMs,
      justSettled: false,
    };
  }

  const isSettledLevel = powerW <= SETTLED_MAX_W && powerW <= peakW * SETTLED_RATIO;

  if (!isSettledLevel) {
    // Still drawing. A charge that picks back up - a laptop waking, a phone
    // used while charging - clears the settle timer rather than carrying a
    // stale one that would fire the moment it drops again.
    return {
      ...prior,
      state: 'charging',
      peakW,
      runStartedAtMs,
      settledSinceMs: null,
      lastSampleAtMs: nowMs,
      justSettled: false,
    };
  }

  const settledSinceMs = prior.settledSinceMs || nowMs;
  const heldLongEnough = nowMs - settledSinceMs >= SETTLED_HOLD_MS;
  const runLongEnough = nowMs - runStartedAtMs >= MIN_RUN_MS;
  const qualifies = heldLongEnough && runLongEnough;

  // Once per run. Without this the notification repeats on every sample for as
  // long as the charger stays plugged in.
  const justSettled = qualifies && !prior.notifiedAtMs;

  return {
    state: qualifies ? 'settled' : 'charging',
    peakW,
    runStartedAtMs,
    settledSinceMs,
    notifiedAtMs: justSettled ? nowMs : prior.notifiedAtMs,
    lastSampleAtMs: nowMs,
    justSettled,
  };
};

/** Human-readable summary for the notification body. */
const describeSettledCharge = ({ peakW = 0, powerW = 0 } = {}) => {
  const peak = Math.round(toFiniteNumber(peakW, 0));
  const now = toFiniteNumber(powerW, 0);
  return `Drew up to ${peak} W while charging and has been resting at `
    + `${now.toFixed(1)} W for the last few minutes.`;
};

module.exports = {
  updateChargingState,
  describeSettledCharge,
  STILL_CONNECTED_W,
  MIN_CHARGE_PEAK_W,
  SETTLED_MAX_W,
  SETTLED_RATIO,
  SETTLED_HOLD_MS,
  MIN_RUN_MS,
};
