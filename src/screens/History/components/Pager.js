import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const PageButton = ({ icon, label, disabled, onPress }) => (
  <TouchableOpacity
    style={[styles.button, disabled && styles.buttonDisabled]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
  >
    <Ionicons name={icon} size={18} color={disabled ? COLORS.border : COLORS.primary} />
  </TouchableOpacity>
);

/**
 * "‹  Page 2 of 5  ›" under a History list (Oct 2026), so the user steps
 * through a page of rows at a time instead of scrolling. `pageLabel` overrides the
 * middle text where the total is not known yet (the activity log only knows
 * whether there is a next page).
 */
const Pager = ({ page, pageCount, hasPrev, hasNext, onPrev, onNext, pageLabel, busy = false, style }) => {
  // Shown even when everything fits on one page, with both arrows greyed:
  // hiding it made a short Activity tab look as though paging was missing
  // (Oct 2026). The screen hides it when there are no rows at all.

  return (
    <View style={[styles.row, style]}>
      <PageButton icon="chevron-back" label="Previous page" disabled={!hasPrev || busy} onPress={onPrev} />
      <Text style={styles.label}>
        {pageLabel || `Page ${page + 1} of ${pageCount}`}
      </Text>
      <PageButton icon="chevron-forward" label="Next page" disabled={!hasNext || busy} onPress={onNext} />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 12,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: COLORS.background,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    minWidth: 96,
    textAlign: 'center',
  },
});

export default Pager;
