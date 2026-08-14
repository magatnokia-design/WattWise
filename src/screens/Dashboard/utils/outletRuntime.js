/**
 * What an outlet document means right now.
 *
 * Extracted from useOutletControl because the answer depends on the clock, and
 * inside the hook the clock was only ever read in the Firestore snapshot
 * handler. That made staleness arrive on a snapshot instead of on time: when the
 * ESP32 stopped posting, no snapshot fired, nothing re-evaluated, and every
 * derived value held its last reading and kept presenting it as current. A user
 * watching the dashboard at the moment wi-fi dropped - the one case the freshness
 * check exists for - was the one case it could not catch. It corrected itself on
 * the next mount, which is why it tested fine.
 *
 * The rule this encodes: a value downstream of a snapshot handler is frozen, not
 * stale, and frozen values read as confident. So the comparison lives here, takes
 * `nowMs`, and the caller re-runs it on a timer rather than on data.
 */

import {
  getTelemetryUpdatedAtMs,
  hasFreshTelemetry,
  toEpochMs,
  HARDWARE_STALE_THRESHOLD_MS,
} from '../../../utils/liveUsage';

const LIVE_POWER_THRESHOLD_W = 0.5;

const toMetricNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// One definition of "still reporting", in the copy-rule file, so the dashboard
// card and the live-appliance rows cannot disagree about whether the hardware is
// talking. They read the same documents; they were deciding this separately.
export { getTelemetryUpdatedAtMs, toEpochMs, HARDWARE_STALE_THRESHOLD_MS };

/**
 * @param {object} outlet Raw outlet document.
 * @param {number} nowMs Injected so staleness can be exercised without waiting
 *   on wall-clock time, and so the caller controls when it is re-evaluated.
 */
export const deriveOutletRuntimeState = (outlet = {}, nowMs = Date.now()) => {
  // Power alone. This used to accept `current >= 0.01 A` as evidence of a load,
  // and the owner's PZEM reads 0.02 A at 0.0 W on a switched-off outlet - double
  // that threshold with nothing consuming - so an outlet sat reading
  // "Nokia's Fan - recognised" while off. Current without power is the meter's
  // noise floor, not consumption.
  const hasLiveLoad = toMetricNumber(outlet.power) >= LIVE_POWER_THRESHOLD_W;

  const lastUpdatedMs = getTelemetryUpdatedAtMs(outlet);
  const isFresh = hasFreshTelemetry(outlet, nowMs);

  return {
    hasLiveLoad,
    hasFreshTelemetry: isFresh,
    // Something is plugged in and running. Requires a reading to say so: with no
    // telemetry we do not know, which is a different answer from "nothing".
    hasLoad: isFresh && hasLiveLoad,
    lastUpdatedMs,
  };
};

/**
 * Which way a command in flight is moving, or null if nothing is in flight.
 *
 * Same two rules liveUsage.js applies, because the dashboard card and the
 * live-appliance rows read the same documents and must not disagree about
 * whether a relay is mid-move. Kept here rather than in liveUsage.js only
 * because this hook derives `isOn` differently - it folds in the optimistic
 * override, so the card can say "Switching off..." on the tap rather than one
 * round trip later.
 *
 * @param {object} outlet Raw outlet document.
 * @param {object} args
 * @param {boolean} args.isOn      Effective commanded state, optimistic override included.
 * @param {boolean} args.isDrawing Fresh reading above the load floor.
 * @param {number} args.nowMs
 * @returns {'on'|'off'|null}
 */
export const resolveSwitchingTo = (outlet = {}, { isOn, isDrawing, nowMs = Date.now() } = {}) => {
  // Keyed on the contradiction itself, not on a pending marker: an auto-cutoff
  // opens no pending window, so a card would otherwise read "Off" beside a fan
  // that is still turning. Current flowing through an outlet the document calls
  // off cannot be a resting state whatever caused it.
  if (!isOn && isDrawing) return 'off';

  // The `on` direction has no contradiction to key on - an outlet switched on
  // with nothing plugged in is perfectly ordinary - so only the pending window
  // separates a relay that has yet to close from an empty outlet. Deliberately
  // NOT keyed on the local optimistic override as well: that clears on the next
  // snapshot, but if none ever arrived the card would sit claiming a transition
  // forever, which is the failure this window exists to bound.
  const pendingStatus = String(outlet.pendingStatus || '').trim().toLowerCase();
  const pendingUntilMs = toMetricNumber(outlet.pendingStatusUntilMs);
  const isPendingOn = pendingStatus === 'on' && pendingUntilMs > nowMs;

  if (isPendingOn && !isDrawing) return 'on';

  return null;
};

export { LIVE_POWER_THRESHOLD_W };
