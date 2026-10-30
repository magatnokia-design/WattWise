import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

/**
 * One Settings row. `icon` is an Ionicons name (or a MaterialCommunityIcons one
 * with `iconSet="mci"`, for appliances) (Oct 2026: icons in the logo's
 * green replaced emoji). Compact - 12 px of vertical padding, a 32 px icon tile.
 */
const SettingsRow = ({
  icon,
  iconSet = 'ion',
  label,
  // One short line under the label, e.g. what a switch currently means.
  subtitle,
  value,
  onPress,
  isSwitch,
  switchValue,
  onSwitchChange,
  isDestructive,
  showArrow,
  disabled,
  // An action is running. Shows a spinner in place of the arrow and stops the
  // row being tapped again while it does.
  busy,
  // Dark, bold value - for a figure the row is about (an appliance's watts).
  strongValue,
  // Small icon buttons, e.g. rename and delete. A row with actions is not
  // itself tappable, so pass no onPress alongside them.
  actions,
}) => {
  // `disabled` used to select a dimmed style and nothing else - the
  // TouchableOpacity computed its own disabled state from whether an onPress
  // existed, so a row could look unavailable and still fire on every tap.
  const isInert = disabled || busy || (!onPress && !isSwitch);
  const tint = isDestructive ? COLORS.error : COLORS.primary;
  const Icon = iconSet === 'mci' ? MaterialCommunityIcons : Ionicons;

  return (
    <TouchableOpacity
      style={[styles.row, (disabled || busy) && styles.rowDisabled]}
      onPress={onPress}
      activeOpacity={onPress && !isInert ? 0.7 : 1}
      disabled={isInert}
      accessibilityRole={isSwitch ? 'switch' : onPress ? 'button' : undefined}
    >
      {icon ? (
        <View style={[styles.iconContainer, { backgroundColor: isDestructive ? '#FEF2F2' : '#ECF8EF' }]}>
          <Icon name={icon} size={iconSet === 'mci' ? 18 : 17} color={tint} />
        </View>
      ) : null}

      <View style={styles.labelWrap}>
        <Text style={[styles.label, isDestructive && styles.labelDestructive]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      <View style={styles.rightSide}>
        {value ? (
          <Text style={[styles.value, strongValue && styles.valueStrong]} numberOfLines={1}>{value}</Text>
        ) : null}
        {actions ? (
          <View style={styles.actions}>
            {actions.map(({ icon: actionIcon, label: actionLabel, onPress: onAction, danger }) => (
              <TouchableOpacity
                key={actionIcon}
                onPress={onAction}
                style={styles.actionButton}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={actionLabel}
              >
                <Ionicons name={actionIcon} size={18} color={danger ? COLORS.error : COLORS.primary} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {busy ? (
          <ActivityIndicator size="small" color={tint} />
        ) : isSwitch ? (
          <Switch
            value={switchValue || false}
            onValueChange={onSwitchChange}
            trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
            thumbColor={switchValue ? COLORS.primary : COLORS.white}
          />
        ) : showArrow ? (
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  labelWrap: {
    flex: 1,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 1,
  },
  label: {
    fontSize: 14.5,
    color: COLORS.text,
    fontWeight: '500',
  },
  labelDestructive: {
    color: COLORS.error,
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '55%',
  },
  value: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '500',
    flexShrink: 1,
  },
  valueStrong: {
    color: COLORS.text,
    fontWeight: '700',
    marginRight: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 6,
  },
});

export default SettingsRow;
