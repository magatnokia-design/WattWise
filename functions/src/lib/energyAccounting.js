const { getManilaDateKey } = require('./manilaTime');

/**
 * Turns the PZEM's raw energy register into per-day usage.
 *
 * The sensor reports a lifetime cumulative kWh counter held in its own
 * non-volatile memory; the firmware never calls resetEnergy(), so it only ever
 * climbs. Storing that number as `energy` meant every daily rollup recorded the
 * lifetime total as that day's usage, and the monthly budget added the lifetime
 * total again every night.
 *
 * Deltas are derived here rather than on the device so the fix needs no
 * firmware reflash, and so a device swap or power-cycle cannot corrupt history.
 */

// A single sample cannot plausibly represent more than this much energy at the
// telemetry cadence. A larger jump means the counter was replaced, not consumed.
const MAX_PLAUSIBLE_SAMPLE_DELTA_KWH = 5;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value) => Number(Math.max(0, value).toFixed(4));

/**
 * @param {object} previous Stored outlet document fields.
 * @param {number} meterReading Cumulative kWh as reported by the device.
 * @param {number} timestampMs Sample time, used to resolve the Manila day.
 */
const deriveOutletEnergy = (previous = {}, meterReading = 0, timestampMs = Date.now()) => {
  const dateKey = getManilaDateKey(new Date(timestampMs));
  const meterKwh = Math.max(0, toFiniteNumber(meterReading, 0));

  const previousMeterKwh = Number(previous.energyMeterKwh);
  const hasBaseline = Number.isFinite(previousMeterKwh);

  let delta = 0;
  let meterRebased = false;

  if (hasBaseline) {
    if (meterKwh + 1e-9 < previousMeterKwh) {
      // The counter went backwards: the meter was cleared, swapped, or this is
      // different hardware. Re-baseline rather than record a negative day.
      meterRebased = true;
    } else {
      delta = meterKwh - previousMeterKwh;

      if (delta > MAX_PLAUSIBLE_SAMPLE_DELTA_KWH) {
        // Implausible jump - treat as a new baseline, not consumption.
        delta = 0;
        meterRebased = true;
      }
    }
  }

  const previousDateKey = String(previous.energyDateKey || '');
  const isSameDay = previousDateKey === dateKey;
  const carriedToday = isSameDay ? Math.max(0, toFiniteNumber(previous.energyTodayKwh, 0)) : 0;

  const result = {
    energyMeterKwh: round(meterKwh),
    energyDateKey: dateKey,
    energyTodayKwh: round(carriedToday + delta),
    totalEnergy: round(Math.max(0, toFiniteNumber(previous.totalEnergy, 0)) + delta),
    deltaKwh: round(delta),
    meterRebased,
  };

  if (isSameDay || !previousDateKey) {
    // Nothing to close out: either still the same Manila day, or this outlet has
    // never reported before.
    result.energyPreviousDateKey = String(previous.energyPreviousDateKey || '');
    result.energyPreviousDayKwh = round(toFiniteNumber(previous.energyPreviousDayKwh, 0));
    return result;
  }

  // The Manila day just rolled over. Close out the finished day so the nightly
  // rollup can still find it even though the live accumulator has reset - the
  // two run independently and either can happen first.
  result.energyPreviousDateKey = previousDateKey;
  result.energyPreviousDayKwh = round(toFiniteNumber(previous.energyTodayKwh, 0));
  return result;
};

/**
 * Energy attributable to `dateKey` for one outlet, whichever slot currently
 * holds it. The nightly rollup and the day-rollover in telemetry race with each
 * other, so both orderings have to resolve correctly.
 */
const resolveEnergyForDate = (outletData = {}, dateKey) => {
  if (!dateKey) return 0;

  if (String(outletData.energyPreviousDateKey || '') === dateKey) {
    return Math.max(0, toFiniteNumber(outletData.energyPreviousDayKwh, 0));
  }

  if (String(outletData.energyDateKey || '') === dateKey) {
    return Math.max(0, toFiniteNumber(outletData.energyTodayKwh, 0));
  }

  return 0;
};

module.exports = {
  MAX_PLAUSIBLE_SAMPLE_DELTA_KWH,
  deriveOutletEnergy,
  resolveEnergyForDate,
};
