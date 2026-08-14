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

export { LIVE_POWER_THRESHOLD_W };
