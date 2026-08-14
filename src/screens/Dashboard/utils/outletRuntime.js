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

const LIVE_POWER_THRESHOLD_W = 0.5;

// Telemetry older than this is not evidence of anything. Matches the web
// client's own threshold and the interval the ESP32 posts at when active.
export const HARDWARE_STALE_THRESHOLD_MS = 12000;

const toMetricNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const toEpochMs = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/** When this outlet last posted telemetry, across the field names in use. */
export const getTelemetryUpdatedAtMs = (outlet = {}) => {
  const explicitTelemetryMs = toEpochMs(
    outlet.metricsUpdatedAtMs ||
    outlet.lastMetricsAtMs ||
    outlet.lastTelemetryAtMs
  );

  if (explicitTelemetryMs > 0) {
    return explicitTelemetryMs;
  }

  return toEpochMs(
    outlet.metricsUpdatedAt ||
    outlet.lastMetricsAt ||
    outlet.lastTelemetryAt ||
    outlet.lastUpdated
  );
};

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
  const hasFreshTelemetry =
    lastUpdatedMs > 0 && (nowMs - lastUpdatedMs) <= HARDWARE_STALE_THRESHOLD_MS;

  return {
    hasLiveLoad,
    hasFreshTelemetry,
    // Something is plugged in and running. Requires a reading to say so: with no
    // telemetry we do not know, which is a different answer from "nothing".
    hasLoad: hasFreshTelemetry && hasLiveLoad,
    lastUpdatedMs,
  };
};

export { LIVE_POWER_THRESHOLD_W };
