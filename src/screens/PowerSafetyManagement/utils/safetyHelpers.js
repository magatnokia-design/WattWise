import { COLORS } from '../../../constants/colors';
import { formatRelativeTime } from '../../../utils/datetime';

export const getSafetyStageConfig = (stage) => {
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

export const getStatusColor = (value, threshold) => {
  // For voltage (has min and max)
  if (threshold.min !== undefined) {
    if (value < threshold.min || value > threshold.max) {
      return {
        label: 'Critical',
        color: COLORS.error,
        bg: '#FEF2F2',
      };
    }
    if (value < threshold.min * 1.05 || value > threshold.max * 0.95) {
      return {
        label: 'Warning',
        color: '#F59E0B',
        bg: '#FFFBEB',
      };
    }
    return {
      label: 'Normal',
      color: COLORS.success,
      bg: '#ECFDF5',
    };
  }

  // For current and power (has only max)
  if (value > threshold.max) {
    return {
      label: 'Critical',
      color: COLORS.error,
      bg: '#FEF2F2',
    };
  }
  if (value > threshold.max * 0.9) {
    return {
      label: 'Warning',
      color: '#F59E0B',
      bg: '#FFFBEB',
    };
  }
  return {
    label: 'Normal',
    color: COLORS.success,
    bg: '#ECFDF5',
  };
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