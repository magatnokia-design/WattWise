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

export const getAlertIcon = (type) => {
  const icons = {
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
    cutoff: {
      name: 'flash-off',
      color: COLORS.error,
      bg: '#FEF2F2',
    },
  };

  return icons[type] || icons.power;
};

export const formatAlertTime = (timestamp) => formatRelativeTime(timestamp);