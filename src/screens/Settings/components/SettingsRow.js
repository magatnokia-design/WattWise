import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { COLORS } from '../../../constants/colors';

const SettingsRow = ({
  icon,
  label,
  value,
  onPress,
  isSwitch,
  switchValue,
  onSwitchChange,
  isDestructive,
  showArrow,
  disabled,
}) => {
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !isSwitch}
    >
      {/* Left Icon */}
      <View style={[styles.iconContainer, { backgroundColor: isDestructive ? '#FEF2F2' : COLORS.primary + '15' }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      {/* Label */}
      <Text style={[styles.label, isDestructive && styles.labelDestructive]}>
        {label}
      </Text>

      {/* Right Side */}
      <View style={styles.rightSide}>
        {value ? (
          <Text style={styles.value}>{value}</Text>
        ) : null}
        {isSwitch ? (
          <Switch
            value={switchValue || false}
            onValueChange={onSwitchChange}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={switchValue ? COLORS.primary : COLORS.white}
          />
        ) : showArrow ? (
          <Text style={styles.arrow}>›</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  icon: {
    fontSize: 18,
  },
  label: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  labelDestructive: {
    color: '#EF4444',
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  value: {
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  arrow: {
    fontSize: 22,
    color: COLORS.textLight,
    fontWeight: '300',
  },
});

export default SettingsRow;