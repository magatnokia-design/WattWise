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
 *
 * Run time (Oct 2026) rides it too, for the same reason. "How many hours a day
 * does it run" was the one input the appliance cost calculator had to ask the
 * user for, and it is the one people guess worst. It is measured here instead:
 * the interval since the previous sample counts as "on" when that sample drew
 * at least RUNNING_THRESHOLD_W. Display only - like the appliance name it sits
 * beside, nothing billed, budgeted or cut off may read it.
 */

// A single sample cannot plausibly represent more than this much energy at the
// telemetry cadence. A larger jump means the counter was replaced, not consumed.
const MAX_PLAUSIBLE_SAMPLE_DELTA_KWH = 5;

// The detector's own line between "something is running" and "nothing is":
// a run ends when the draw stays under 3 W (applianceDetector.js). An idle
// charger brick or a relay's leakage reads below it.
const RUNNING_THRESHOLD_W = 3;

// The Hub posts every 1.5 s while active and every 5 s idle, and one slow post
// can take up to its 12 s HTTP timeout. A longer silence is a Hub that dropped
// off, and nothing is known about the outlet during it - so it is not counted,
// rather than assumed to have run at the last value seen.
const MAX_ON_TIME_GAP_MS = 30000;

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Volts as reported, or null when the caller did not report any. Zero volts is
 * a measurement ("the meter sees no mains"); null is the absence of one.
 */
const readVoltage = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
};

const round = (value) => Number(Math.max(0, value).toFixed(4));

// Watts are displayed to one decimal on both clients; storing more precision
// than is ever shown just invites two screens to disagree in the last digit.
const roundWatts = (value) => Number(Math.max(0, value).toFixed(1));

const roundSeconds = (value) => Number(Math.max(0, value).toFixed(1));

// A closed-out day keeps "never measured" as null rather than turning it into
// a measured zero on the way through.
const carrySeconds = (value) => {
  const parsed = Number(value);
  return value === undefined || value === null || !Number.isFinite(parsed)
    ? null
    : roundSeconds(parsed);
};

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
  powerW = 0,
  voltageV = undefined
) => {
  const dateKey = getManilaDateKey(new Date(timestampMs));
  const meterKwh = Math.max(0, toFiniteNumber(meterReading, 0));

  const previousMeterKwh = Number(previous.energyMeterKwh);
  const hasBaseline = Number.isFinite(previousMeterKwh);

  // null means "not reported", which is not the same as zero volts. Callers
  // that predate this argument must keep their old behaviour exactly.
  const sampleVoltage = readVoltage(voltageV);
  const previousVoltage = readVoltage(previous.voltage);

  let delta = 0;
  let meterRebased = false;
  let baselineKwh = meterKwh;

  if (hasBaseline) {
    if (sampleVoltage === 0) {
      // The meter is reporting no voltage, so it is not measuring: it has lost
      // its own supply, or the firmware is publishing zeros because the read
      // failed. Either way its counter is not evidence of anything. Hold the
      // baseline where it was instead of moving it down to the zero - a zero
      // baseline is what turns the next live reading into a phantom bill.
      baselineKwh = previousMeterKwh;
    } else if (previousVoltage === 0) {
      // Coming back from a dark meter. The counter kept its own total in NVM
      // across the gap, but nothing here measured what happened during it, so
      // adopt the reading as a new baseline rather than differencing across it.
      //
      // This is what put 1.394 kWh on outlet 2 the instant it was switched back
      // on (22 Aug 2026): the outlet had reported 0 V while off, its baseline
      // had already been dragged to zero, and the first live sample booked the
      // meter's whole lifetime total as one sample's consumption. The stored
      // zero survives this fix, so this branch has to repair it, not just
      // prevent the next one.
      meterRebased = true;
    } else if (meterKwh + 1e-9 < previousMeterKwh) {
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

  // The interval belongs to the state that held during it, which is the
  // previous sample's. One that straddles midnight is booked to the new day -
  // at most 30 s, and splitting it is not worth a second clock.
  const carriedOnSeconds = isSameDay ? Math.max(0, toFiniteNumber(previous.onSecondsToday, 0)) : 0;
  const previousSampleAtMs = toFiniteNumber(previous.onTimeSampleAtMs, 0);
  const gapMs = timestampMs - previousSampleAtMs;
  const intervalWasRunning = previousSampleAtMs > 0
    && gapMs > 0
    && gapMs <= MAX_ON_TIME_GAP_MS
    && toFiniteNumber(previous.onTimeSampleW, 0) >= RUNNING_THRESHOLD_W;

  const result = {
    energyMeterKwh: round(baselineKwh),
    energyDateKey: dateKey,
    energyTodayKwh: round(carriedToday + delta),
    totalEnergy: round(Math.max(0, toFiniteNumber(previous.totalEnergy, 0)) + delta),
    deltaKwh: round(delta),
    meterRebased,
    peakPowerTodayW: roundWatts(peakAdvances ? samplePowerW : carriedPeakW),
    peakPowerTodayAtMs: peakAdvances ? timestampMs : carriedPeakAtMs,
    onSecondsToday: roundSeconds(carriedOnSeconds + (intervalWasRunning ? gapMs / 1000 : 0)),
    // This sample opens the next interval. Stored here rather than read back
    // from the outlet's `power` so the accounting needs nothing but its own
    // fields.
    onTimeSampleAtMs: timestampMs,
    onTimeSampleW: roundWatts(samplePowerW),
  };

  if (isSameDay || !previousDateKey) {
    // Nothing to close out: either still the same Manila day, or this outlet has
    // never reported before.
    result.energyPreviousDateKey = String(previous.energyPreviousDateKey || '');
    result.energyPreviousDayKwh = round(toFiniteNumber(previous.energyPreviousDayKwh, 0));
    result.peakPowerPreviousDayW = roundWatts(toFiniteNumber(previous.peakPowerPreviousDayW, 0));
    result.peakPowerPreviousDayAtMs = toFiniteNumber(previous.peakPowerPreviousDayAtMs, 0);
    result.onSecondsPreviousDay = carrySeconds(previous.onSecondsPreviousDay);
    return result;
  }

  // The Manila day just rolled over. Close out the finished day so the nightly
  // rollup can still find it even though the live accumulator has reset - the
  // two run independently and either can happen first.
  result.energyPreviousDateKey = previousDateKey;
  result.energyPreviousDayKwh = round(toFiniteNumber(previous.energyTodayKwh, 0));
  result.peakPowerPreviousDayW = roundWatts(toFiniteNumber(previous.peakPowerTodayW, 0));
  result.peakPowerPreviousDayAtMs = toFiniteNumber(previous.peakPowerTodayAtMs, 0);
  result.onSecondsPreviousDay = carrySeconds(previous.onSecondsToday);
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

/**
 * Seconds the outlet spent running on `dateKey`, from the same two slots as the
 * energy beside it.
 *
 * Null, not zero, when the slot carries no run time - a day closed out before
 * run-time tracking existed. That is "not measured", and a reader averaging
 * hours a day must skip it rather than count it as a day spent off. (The day
 * the tracking was deployed is measured from the deploy onward only, so it
 * reads short; it is one day, and it ages out of every average.)
 *
 * @returns {number|null}
 */
const resolveOnSecondsForDate = (outletData = {}, dateKey) => {
  if (!dateKey) return null;

  const readSlot = (value) => {
    const parsed = Number(value);
    return value === undefined || value === null || !Number.isFinite(parsed)
      ? null
      : Math.max(0, parsed);
  };

  if (String(outletData.energyPreviousDateKey || '') === dateKey) {
    return readSlot(outletData.onSecondsPreviousDay);
  }

  if (String(outletData.energyDateKey || '') === dateKey) {
    return readSlot(outletData.onSecondsToday);
  }

  return null;
};

module.exports = {
  MAX_PLAUSIBLE_SAMPLE_DELTA_KWH,
  RUNNING_THRESHOLD_W,
  MAX_ON_TIME_GAP_MS,
  deriveOutletEnergy,
  resolveEnergyForDate,
  resolvePeakForDate,
  resolveOnSecondsForDate,
};
