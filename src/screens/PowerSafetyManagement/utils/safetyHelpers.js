import { COLORS } from '../../../constants/colors';
import { formatRelativeTime } from '../../../utils/datetime';

// Two of the backend's 15 s reading-write intervals plus room for a slow round
// trip. Long enough that a healthy Hub is never called stale between writes,
// short enough that an unplugged one shows within a minute.
export const READINGS_STALE_AFTER_MS = 40000;

/**
 * Whether the safety readings are too old to grade.
 *
 * Has to be asked against the clock, not only when a snapshot arrives: a Hub
 * that goes quiet sends no further snapshot, so a check made on arrival alone
 * kept the last verdict on screen indefinitely - "Normal" from a device that
 * had stopped reporting. Callers re-ask it on a timer.
 *
 * @param {number} lastReadingWriteMs power_safety/settings.lastReadingWriteMs
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export const areReadingsStale = (lastReadingWriteMs, nowMs = Date.now()) => {
  const last = Number(lastReadingWriteMs || 0);
  return !(last > 0 && nowMs - last < READINGS_STALE_AFTER_MS);
};

/**
 * @param {string} stage Last stage the backend graded.
 * @param {boolean} [readingsAreStale] Whether the hardware has stopped
 *   reporting. A stage is a verdict on readings; with no readings there is no
 *   verdict, and this used to fall through `configs[stage] || configs.normal`
 *   to the greenest, largest element on the screen. With the ESP32 unplugged
 *   the page said, at once: six chips "No reading", both cards "Waiting for the
 *   ESP32 to report", and this banner "All systems operating within safe
 *   parameters" - three admissions of ignorance and one assertion of safety, on
 *   the single element a user reads to decide whether anything is wrong.
 *
 * Each stage has its own colour (Oct 2026): green, amber, orange, red. `color`
 * fills icons and bars; `textColor` is a darker shade of the same hue, because
 * amber and orange on their own pale grounds are too faint to read as text.
 * `pulseMs` drives the alert animation - faster the more serious the stage,
 * and null where nothing needs attention.
 */
export const getSafetyStageConfig = (stage, readingsAreStale = false) => {
  if (readingsAreStale) {
    return {
      label: 'No readings',
      short: 'No reading',
      description: 'Hub offline. No readings.',
      icon: 'help-circle',
      color: COLORS.textLight,
      textColor: COLORS.textLight,
      bgColor: '#F3F4F6',
      pulseMs: null,
      // No stage is asserted, so no segment on the bar lights up.
      stale: true,
    };
  }

  const configs = {
    normal: {
      label: 'Normal',
      short: 'Safe',
      description: 'All systems operating within safe parameters',
      icon: 'shield-checkmark',
      color: COLORS.success,
      textColor: COLORS.success,
      bgColor: '#ECF8EF',
      pulseMs: null,
    },
    warning: {
      label: 'Warning',
      short: 'Warning',
      description: 'Getting close to your limits',
      icon: 'warning',
      color: '#F59E0B',
      textColor: '#B45309',
      bgColor: '#FFFBEB',
      pulseMs: 1400,
    },
    limit: {
      label: 'Limit Reached',
      short: 'Limit',
      description: 'At your limit - power will be cut if it goes higher',
      icon: 'alert-circle',
      color: '#F97316',
      textColor: '#C2410C',
      bgColor: '#FFF7ED',
      pulseMs: 1000,
    },
    cutoff: {
      label: 'Cut-off Active',
      short: 'Cut-off',
      description: 'Power was switched off to keep you safe',
      icon: 'flash-off',
      color: COLORS.error,
      textColor: '#B91C1C',
      bgColor: '#FEF2F2',
      pulseMs: 650,
    },
  };

  return configs[stage] || configs.normal;
};

/** The four stages in order, with the colour each lights its bar segment in. */
export const SAFETY_STAGES = ['normal', 'warning', 'limit', 'cutoff'].map((key) => ({
  key,
  label: { normal: 'Normal', warning: 'Warning', limit: 'Limit', cutoff: 'Cut-off' }[key],
  color: getSafetyStageConfig(key).color,
}));

// What each limit may be set to (Oct 2026). A 500 V or 50 A limit used to be
// accepted, and a limit the hardware can never reach protects nothing.
// - Voltage: the PZEM-004T v3 measures 80-260 V, so a maximum above 260 V is a
//   reading the meter cannot produce. Mains here is 230 V nominal and runs
//   ~244 V, so a maximum under 240 V would alarm on a healthy supply.
// - Current: the relay contacts (SRD-05VDC-SL-C) are rated 10 A.
// - Power: the firmware's own 500 W per-outlet cut-off (MAX_OUTLET_POWER_W).
// Keep in step with LIMIT_BOUNDS in functions/src/lib/powerSafety.js, which
// clamps whatever is stored.
export const SAFETY_LIMITS = {
  voltageMin: { label: 'Min volts', min: 180, max: 220, unit: 'V' },
  voltageMax: { label: 'Max volts', min: 240, max: 260, unit: 'V' },
  currentMax: { label: 'Max amps', min: 0.1, max: 10, unit: 'A' },
  powerMax: { label: 'Max watts', min: 1, max: 500, unit: 'W' },
};

/**
 * The first limit outside its allowed range, as a sentence, or null.
 *
 * @param {{voltageMin:number, voltageMax:number, currentMax:number, powerMax:number}} values
 * @returns {string|null}
 */
export const findLimitOutOfRange = (values = {}) => {
  for (const [key, bound] of Object.entries(SAFETY_LIMITS)) {
    const value = Number(values[key]);
    if (!Number.isFinite(value) || value < bound.min || value > bound.max) {
      return `${bound.label} has to be between ${bound.min} and ${bound.max} ${bound.unit}.`;
    }
  }
  return null;
};

// The ratios evaluateSafety grades by, duplicated here for the same reason
// billing.js is: the chips render directly beneath the banner the backend
// grades, and the two disagreeing about one reading is worse than either rule
// alone. Keep in step with WARNING_RATIO and LIMIT_RATIO in
// functions/src/lib/powerSafety.js.
const WARNING_RATIO = 0.8;
const CRITICAL_RATIO = 0.95;

const CRITICAL = { label: 'Critical', color: COLORS.error, bg: '#FEF2F2' };
const WARNING = { label: 'Warning', color: '#F59E0B', bg: '#FFFBEB' };
const NORMAL = { label: 'Normal', color: COLORS.success, bg: '#ECF8EF' };

// Severity order, so a card summarising several metrics can report the worst of
// them rather than whichever one it happened to be written against.
const SEVERITY = { Normal: 0, Warning: 1, Critical: 2 };

/**
 * The worst of several metric gradings.
 *
 * A per-outlet badge summarises voltage, current and power at once, and a
 * summary that tracks only one of them is not a summary. ThresholdCard graded
 * all three and then rendered the voltage one, so an outlet drawing 53.0 W
 * against its own 45 W limit displayed "Normal" - directly beneath a banner
 * reading "Cut-off Active", because the backend had cut the power off over
 * exactly that reading.
 */
export const getWorstStatus = (...statuses) => statuses
  .filter(Boolean)
  .reduce(
    (worst, candidate) => (
      (SEVERITY[candidate.label] ?? 0) > (SEVERITY[worst.label] ?? 0) ? candidate : worst
    ),
    NORMAL
  );

export const getStatusColor = (value, threshold) => {
  // Voltage: a band, graded in or out, with no margin either side.
  //
  // This used to warn above `max * 0.95`, which on a 200-250 V band put Normal
  // at 210-237.5 V. Philippine mains sits at 240-250: the owner reads 245.3 V
  // and 245.7 V, so both chips showed Warning, and would have on essentially
  // every reading forever - directly beneath a backend-graded banner reading
  // "Normal - All systems operating within safe parameters".
  //
  // The proportional rule is right for power, where the ceiling is one the user
  // chose and 90% of it genuinely is approaching a cutoff. Voltage is not like
  // that. Mains sits wherever the utility puts it, the user cannot act on it,
  // and evaluateSafety already treats it as strictly in-band or out - it
  // escalates over-voltage to 'limit' and never to 'cutoff', because switching
  // the load off does not fix a supply problem. A band whose top 5% is
  // permanently occupied is not a margin.
  if (threshold.min !== undefined) {
    return (value < threshold.min || value > threshold.max) ? CRITICAL : NORMAL;
  }

  // Current and power: a ceiling, graded proportionally, on the backend's
  // ratios rather than a separate 0.9 this file used to apply on its own. At 85%
  // of the limit the chip said Normal while the banner above it said Warning.
  const limit = Number(threshold.max) || 0;
  if (limit <= 0) return NORMAL;

  const ratio = value / limit;
  if (ratio >= CRITICAL_RATIO) return CRITICAL;
  if (ratio >= WARNING_RATIO) return WARNING;
  return NORMAL;
};

/**
 * Icon and colour for one row of alert history.
 *
 * Keyed on the `type` handleSafetyAlerts actually writes - `warning`,
 * `high_usage`, `cutoff`, `device` - which is the same taxonomy
 * getNotificationIcon uses. The map was previously keyed on `voltage`,
 * `current` and `power`, none of which are ever emitted, so every row fell
 * through to the default. That default was the red error triangle, which is
 * how "Back to Normal" came to be displayed as a fault. Found from the web
 * repo, where the same mapping is used.
 *
 * The legacy keys are kept because rows written before this fix still carry
 * them, and a stored alert should not change appearance retroactively.
 */
export const getAlertIcon = (type) => {
  const icons = {
    // Written by handleSafetyAlerts.
    device: {
      name: 'checkmark-circle',
      color: COLORS.success,
      bg: '#ECF8EF',
    },
    warning: {
      name: 'warning',
      color: '#F59E0B',
      bg: '#FFFBEB',
    },
    high_usage: {
      name: 'alert-circle',
      color: '#F97316',
      bg: '#FFF7ED',
    },
    cutoff: {
      name: 'flash-off',
      color: COLORS.error,
      bg: '#FEF2F2',
    },

    // Older rows.
    voltage: {
      name: 'flash',
      color: '#F59E0B',
      bg: '#FFFBEB',
    },
    current: {
      name: 'speedometer',
      color: '#F97316',
      bg: '#FFF7ED',
    },
    power: {
      name: 'warning',
      color: COLORS.error,
      bg: '#FEF2F2',
    },
  };

  // Neutral rather than the error triangle: an unrecognised type is an unknown
  // alert, not a severe one, and claiming severity the data does not support is
  // what the old default did.
  return icons[type] || {
    name: 'notifications',
    color: COLORS.textLight,
    bg: '#F3F4F6',
  };
};

export const formatAlertTime = (timestamp) => formatRelativeTime(timestamp);