/**
 * Evaluates the power-safety stage from live telemetry.
 *
 * Nothing previously wrote `currentStage`: the Power Safety screen read it, and
 * handleSafetyAlerts triggered on it changing, but no code ever computed it. The
 * stage was therefore permanently 'normal', the user's configured thresholds
 * were never applied to real readings, and the auto-cutoff path could not fire.
 * This is where the stage is now derived, on the telemetry path that actually
 * has the numbers.
 */

const HARD_MAX_POWER_W = 500;

// Philippine residential supply is 230 V nominal. The band is deliberately wide:
// measured mains here sit around 244 V, and a narrow band would flag a healthy
// supply as a fault every time it drifted. Over-voltage escalates to 'limit',
// never 'cutoff' - a supply problem is not fixed by switching the load off.
const DEFAULT_VOLTAGE_MIN = 190;
const DEFAULT_VOLTAGE_MAX = 260;

// Fractions of the configured limit at which each stage begins.
const WARNING_RATIO = 0.8;
const LIMIT_RATIO = 0.95;

// How often the live readings are persisted while the stage is unchanged.
// Writing on every telemetry post would re-trigger handleSafetyAlerts roughly
// once a second for no reason.
const READING_WRITE_INTERVAL_MS = 15000;

const STAGE_RANK = { normal: 0, warning: 1, limit: 2, cutoff: 3 };

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const higherStage = (a, b) => (STAGE_RANK[b] > STAGE_RANK[a] ? b : a);

const stageFromRatio = (ratio) => {
  if (ratio >= 1) return 'cutoff';
  if (ratio >= LIMIT_RATIO) return 'limit';
  if (ratio >= WARNING_RATIO) return 'warning';
  return 'normal';
};

/** Accepts both the nested and the flat threshold shapes the app has written. */
const normalizeThresholds = (raw = {}) => {
  const nested = raw?.voltage || raw?.current || raw?.power;

  const powerMax = nested
    ? toFiniteNumber(raw?.power?.max, HARD_MAX_POWER_W)
    : toFiniteNumber(raw?.powerMax, HARD_MAX_POWER_W);

  return {
    voltageMin: nested
      ? toFiniteNumber(raw?.voltage?.min, DEFAULT_VOLTAGE_MIN)
      : toFiniteNumber(raw?.voltageMin, DEFAULT_VOLTAGE_MIN),
    voltageMax: nested
      ? toFiniteNumber(raw?.voltage?.max, DEFAULT_VOLTAGE_MAX)
      : toFiniteNumber(raw?.voltageMax, DEFAULT_VOLTAGE_MAX),
    currentMax: nested
      ? toFiniteNumber(raw?.current?.max, 10)
      : toFiniteNumber(raw?.currentMax, 10),
    // Never above the hardware ceiling, whatever the stored setting says.
    powerMax: Math.min(powerMax > 0 ? powerMax : HARD_MAX_POWER_W, HARD_MAX_POWER_W),
  };
};

/**
 * @param {object} settings Stored power_safety/settings document (may be null).
 * @param {Array} outlets Validated outlet payloads for this telemetry post.
 * @param {number} totalPowerW Combined draw across outlets.
 * @param {number} nowMs Current time.
 */
const evaluateSafety = ({ settings, outlets = [], totalPowerW = 0, nowMs = Date.now() }) => {
  const thresholds = normalizeThresholds(settings?.thresholds);
  const protectionEnabled = settings?.protectionEnabled !== false;
  const previousStage = String(settings?.currentStage || 'normal');

  const readings = {};
  const reasons = [];
  let stage = 'normal';

  outlets.forEach((outlet) => {
    const key = `outlet${outlet.number}`;
    const power = Math.max(0, toFiniteNumber(outlet.power));
    const current = Math.max(0, toFiniteNumber(outlet.current));
    const voltage = Math.max(0, toFiniteNumber(outlet.voltage));

    readings[key] = { voltage, current, power };

    if (!protectionEnabled) return;

    const powerRatio = thresholds.powerMax > 0 ? power / thresholds.powerMax : 0;
    const currentRatio = thresholds.currentMax > 0 ? current / thresholds.currentMax : 0;
    const worstRatio = Math.max(powerRatio, currentRatio);
    const ratioStage = stageFromRatio(worstRatio);

    if (ratioStage !== 'normal') {
      stage = higherStage(stage, ratioStage);
      reasons.push(
        powerRatio >= currentRatio
          ? `${key} at ${power.toFixed(0)}W of ${thresholds.powerMax}W`
          : `${key} at ${current.toFixed(2)}A of ${thresholds.currentMax}A`
      );
    }

    // Voltage is only meaningful while the outlet is energised. The meter sits
    // on the load side of the relay, so a switched-off outlet reads 0 V - which
    // would otherwise look like a severe under-voltage fault.
    const isEnergised = String(outlet.status || '').toLowerCase() === 'on' && voltage > 0;
    if (isEnergised) {
      if (voltage > thresholds.voltageMax) {
        stage = higherStage(stage, 'limit');
        reasons.push(`${key} over-voltage at ${voltage.toFixed(0)}V`);
      } else if (voltage < thresholds.voltageMin) {
        stage = higherStage(stage, 'warning');
        reasons.push(`${key} under-voltage at ${voltage.toFixed(0)}V`);
      }
    }
  });

  // Combined draw is judged against the same ceiling: two outlets at 60% each
  // is a real problem the per-outlet check cannot see.
  if (protectionEnabled && thresholds.powerMax > 0) {
    const combinedStage = stageFromRatio(totalPowerW / HARD_MAX_POWER_W);
    if (combinedStage !== 'normal') {
      stage = higherStage(stage, combinedStage);
      reasons.push(`combined draw ${totalPowerW.toFixed(0)}W of ${HARD_MAX_POWER_W}W`);
    }
  }

  const stageChanged = stage !== previousStage;
  const lastReadingWriteMs = toFiniteNumber(settings?.lastReadingWriteMs, 0);
  const readingsAreDue = nowMs - lastReadingWriteMs >= READING_WRITE_INTERVAL_MS;

  return {
    stage,
    previousStage,
    stageChanged,
    reasons,
    readings,
    thresholds,
    // Persisting on every post would re-fire the safety trigger continuously.
    shouldWrite: stageChanged || readingsAreDue || !settings,
  };
};

module.exports = {
  HARD_MAX_POWER_W,
  DEFAULT_VOLTAGE_MIN,
  DEFAULT_VOLTAGE_MAX,
  WARNING_RATIO,
  LIMIT_RATIO,
  READING_WRITE_INTERVAL_MS,
  normalizeThresholds,
  evaluateSafety,
};
