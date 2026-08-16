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

// Floor under the proportional half.
//
// Scaling the settle level to the run's own peak is right for a full charge and
// wrong for a top-up. What a charger draws at rest is a property of the brick,
// not of how much charging it just did - a couple of watts whether it peaked at
// 35 W or at 11 W. Without a floor, the smaller the top-up the harder it
// becomes to ever be called finished, which is backwards.
//
// Measured 16 Aug 2026: topping up from 92% peaked at 11.6 W, putting the bar at
// 2.90 W. The charger rested at 2.4 W and qualified - by 0.1 W. Starting from
// 97% the peak would have been lower again, and a genuinely finished charge
// would have sat above its own threshold indefinitely.
//
// 3 W rather than an arbitrary number: the appliance detector already treats a
// run under 3 W as not meaningfully drawing (MIN_DETECTABLE_MEAN_POWER_W), so
// this is the same idea of "resting" the rest of the system uses.
const SETTLED_RATIO_FLOOR_W = 3;

// How long the settled level has to hold. A taper passes through these values
// on its way down, so without this the notification fires mid-charge.
const SETTLED_HOLD_MS = 5 * 60 * 1000;

// A nearly full battery does not rest flat - it tops off in short bursts,
// briefly crossing back over the settled level before dropping again. Resetting
// the hold on the first such sample throws away minutes of accumulated evidence
// and the notification can never fire.
//
// Measured on hardware, 16 Aug 2026: an iPhone charged to 100% on outlet1 sat
// at 3-4 W with occasional excursions past 5 W. The stored state showed
// settledSinceMs restarting at 10:43:08 after the level had already been held
// since roughly 10:31 - the third such reset that run. Nothing was wrong with
// the meter or the phone; the state machine simply could not tell a two-second
// top-off from a resumed charge.
//
// What separates them is duration, not magnitude: a maintenance pulse lasts
// seconds, a genuinely resumed charge lasts minutes. So the hold survives an
// excursion unless the draw stays up for this long.
const RESUME_HOLD_MS = 90 * 1000;

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
  aboveSinceMs: null,
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
    aboveSinceMs: toFiniteNumber(state.aboveSinceMs, 0) || null,
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
      aboveSinceMs: null,
      lastSampleAtMs: nowMs,
      justSettled: false,
    };
  }

  // The proportional bar, never tighter than the floor, and never looser than
  // the absolute ceiling. The ceiling is what keeps a big load out; the floor is
  // what keeps a small charge reachable.
  const settledCeilingW = Math.min(
    SETTLED_MAX_W,
    Math.max(peakW * SETTLED_RATIO, SETTLED_RATIO_FLOOR_W)
  );

  const isSettledLevel = powerW <= settledCeilingW;

  if (!isSettledLevel) {
    // Above the settled level. That is either a charge picking back up - a
    // laptop waking, a phone used while charging - or a top-off pulse from a
    // battery that is already full. Only the first should clear the settle
    // timer, and the two are told apart by how long the draw stays up.
    const aboveSinceMs = prior.aboveSinceMs || nowMs;
    const resumed = nowMs - aboveSinceMs >= RESUME_HOLD_MS;

    return {
      ...prior,
      state: 'charging',
      peakW,
      runStartedAtMs,
      settledSinceMs: resumed ? null : prior.settledSinceMs,
      aboveSinceMs,
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
    aboveSinceMs: null,
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
  SETTLED_RATIO_FLOOR_W,
  SETTLED_HOLD_MS,
  RESUME_HOLD_MS,
  MIN_RUN_MS,
};
