import { COLORS } from '../../../constants/colors';
import { formatRelativeTime } from '../../../utils/datetime';

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
 */
export const getSafetyStageConfig = (stage, readingsAreStale = false) => {
  if (readingsAreStale) {
    return {
      label: 'No readings',
      description: 'The WattWise Hub has stopped reporting, so nothing can be graded right now',
      icon: 'help-circle',
      color: COLORS.textLight,
      bgColor: '#F9FAFB',
      // No stage is asserted, so no segment on the bar lights up.
      stale: true,
    };
  }

  const configs = {
    normal: {
      label: 'Normal',
      description: 'All systems operating within safe parameters',
      icon: 'shield-checkmark',
      color: COLORS.success,
      bgColor: '#ECFDF5',
    },
    warning: {
      label: 'Warning',
      description: 'Parameters approaching safety limits',
      icon: 'warning',
      color: '#F59E0B',
      bgColor: '#FFFBEB',
    },
    limit: {
      label: 'Limit Reached',
      description: 'One or more parameters at maximum safe level',
      icon: 'alert',
      color: '#F97316',
      bgColor: '#FFF7ED',
    },
    cutoff: {
      label: 'Cut-off Active',
      description: 'Power automatically disconnected for safety',
      icon: 'flash-off',
      color: COLORS.error,
      bgColor: '#FEF2F2',
    },
  };

  return configs[stage] || configs.normal;
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
const NORMAL = { label: 'Normal', color: COLORS.success, bg: '#ECFDF5' };

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
      bg: '#ECFDF5',
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