const { getManilaDateKey } = require('./manilaTime');

/**
 * Per-day outlet accounting: energy, and the day's peak draw.
 *
 * The sensor reports a lifetime cumulative kWh counter held in its own
 * non-volatile memory; the firmware never calls resetEnergy(), so it only ever
 * climbs. Storing that number as `energy` meant every daily rollup recorded the
 * lifetime total as that day's usage, and the monthly budget added the lifetime
 * total again every night.
 *
 * Deltas are derived here rather than on the device so the fix needs no
 * firmware reflash, and so a device swap or power-cycle cannot corrupt history.
 *
 * Peak power lives here too, and deliberately so. It used to be derived in the
 * nightly rollup by scanning `history_logs` for the highest `power` field - but
 * those documents are only written when something *happens* (a toggle, a
 * schedule, a safety cutoff) and each records the draw at that instant. So the
 * "day's peak" was really the highest draw that happened to be flowing when
 * someone pressed a button: switch an outlet on (0 W at that moment), let a fan
 * run at 57 W for hours, and unless the outlet was switched off manually while
 * still drawing, the day peaked at nothing. Observed: 10 and 11 August reported
 * 57.8 W and 57.9 W, 12 August reported none at all, and 13 August reported
 * 53.3 W only because an auto-cutoff fired - and a cutoff samples near the peak
 * by definition, so that number was right by luck.
 *
 * Tracking it here makes it a maximum over every telemetry sample, and it rides
 * the same day boundary as the energy accumulator rather than growing a second
 * date key that could drift from it.
 */

// A single sample cannot plausibly represent more than this much energy at the
// telemetry cadence. A larger jump means the counter was replaced, not consumed.
const MAX_PLAUSIBLE_SAMPLE_DELTA_KWH = 5;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value) => Number(Math.max(0, value).toFixed(4));
// Watts are displayed to one decimal on both clients; storing more precision
// than is ever shown just invites two screens to disagree in the last digit.
const roundWatts = (value) => Number(Math.max(0, value).toFixed(1));

/**
 * @param {object} previous Stored outlet document fields.
 * @param {number} meterReading Cumulative kWh as reported by the device.
 * @param {number} timestampMs Sample time, used to resolve the Manila day.
 * @param {number} [powerW] Instantaneous draw for this sample, folded into the
 *   day's peak. Optional so a caller that only has a meter reading still gets
 *   correct energy - the peak simply does not advance.
 */
const deriveOutletEnergy = (
  previous = {},
  meterReading = 0,
  timestampMs = Date.now(),
  powerW = 0
) => {
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

  // A new Manila day starts the peak from this sample, not from yesterday's high.
  const carriedPeakW = isSameDay ? Math.max(0, toFiniteNumber(previous.peakPowerTodayW, 0)) : 0;
  const carriedPeakAtMs = isSameDay ? toFiniteNumber(previous.peakPowerTodayAtMs, 0) : 0;
  const samplePowerW = Math.max(0, toFiniteNumber(powerW, 0));
  // Strictly greater, so the timestamp stays on the *first* sample to reach the
  // peak. A fan holding a flat 56 W all evening would otherwise keep pushing its
  // peak hour forward and report whenever it was switched off.
  const peakAdvances = samplePowerW > carriedPeakW;

  const result = {
    energyMeterKwh: round(meterKwh),
    energyDateKey: dateKey,
    energyTodayKwh: round(carriedToday + delta),
    totalEnergy: round(Math.max(0, toFiniteNumber(previous.totalEnergy, 0)) + delta),
    deltaKwh: round(delta),
    meterRebased,
    peakPowerTodayW: roundWatts(peakAdvances ? samplePowerW : carriedPeakW),
    peakPowerTodayAtMs: peakAdvances ? timestampMs : carriedPeakAtMs,
  };

  if (isSameDay || !previousDateKey) {
    // Nothing to close out: either still the same Manila day, or this outlet has
    // never reported before.
    result.energyPreviousDateKey = String(previous.energyPreviousDateKey || '');
    result.energyPreviousDayKwh = round(toFiniteNumber(previous.energyPreviousDayKwh, 0));
    result.peakPowerPreviousDayW = roundWatts(toFiniteNumber(previous.peakPowerPreviousDayW, 0));
    result.peakPowerPreviousDayAtMs = toFiniteNumber(previous.peakPowerPreviousDayAtMs, 0);
    return result;
  }

  // The Manila day just rolled over. Close out the finished day so the nightly
  // rollup can still find it even though the live accumulator has reset - the
  // two run independently and either can happen first.
  result.energyPreviousDateKey = previousDateKey;
  result.energyPreviousDayKwh = round(toFiniteNumber(previous.energyTodayKwh, 0));
  result.peakPowerPreviousDayW = roundWatts(toFiniteNumber(previous.peakPowerTodayW, 0));
  result.peakPowerPreviousDayAtMs = toFiniteNumber(previous.peakPowerTodayAtMs, 0);
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

/**
 * The peak draw recorded for `dateKey` on one outlet, with the moment it was
 * measured. Keyed off the same two date fields the energy slots use, so a peak
 * can never be attributed to a different day than the energy beside it.
 *
 * @returns {{powerW: number, atMs: number}}
 */
const resolvePeakForDate = (outletData = {}, dateKey) => {
  if (!dateKey) return { powerW: 0, atMs: 0 };

  if (String(outletData.energyPreviousDateKey || '') === dateKey) {
    return {
      powerW: Math.max(0, toFiniteNumber(outletData.peakPowerPreviousDayW, 0)),
      atMs: toFiniteNumber(outletData.peakPowerPreviousDayAtMs, 0),
    };
  }

  if (String(outletData.energyDateKey || '') === dateKey) {
    return {
      powerW: Math.max(0, toFiniteNumber(outletData.peakPowerTodayW, 0)),
      atMs: toFiniteNumber(outletData.peakPowerTodayAtMs, 0),
    };
  }

  return { powerW: 0, atMs: 0 };
};

module.exports = {
  MAX_PLAUSIBLE_SAMPLE_DELTA_KWH,
  deriveOutletEnergy,
  resolveEnergyForDate,
  resolvePeakForDate,
};
