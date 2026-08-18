import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import { formatMonthLabel } from '../utils/comparisonHelpers';

/**
 * The "which month" control. One slot, one month.
 *
 * This has been two slots with `vs` between them, on the reasoning that an
 * implicit baseline is hard to reason about - you could not see what you were
 * comparing against. True as far as it went, but it fixed the wrong half. The
 * bill card below only ever followed the left slot, so the right one governed
 * part of the screen and not the rest, with nothing marking where its influence
 * stopped. Two visible slots made that ambiguity look deliberate.
 *
 * The baseline is now always the preceding month and is named in the sentence
 * that reports the change, which is where it is actually needed.
 */
const MonthComparePicker = ({ monthOptions, month, onSelect }) => {
  const [open, setOpen] = useState(false);

  const handlePick = useCallback((value) => {
    onSelect(value);
    setOpen(false);
  }, [onSelect]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.slot}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <View style={styles.slotText}>
          <Text style={styles.slotCaption}>Month</Text>
          <Text style={styles.slotValue}>{formatMonthLabel(month)}</Text>
        </View>
        <Text style={styles.slotHint}>Change ▾</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Select month</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {monthOptions.map((option) => {
                const selected = option.value === month;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => handlePick(option.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {formatMonthLabel(option.value)}
                    </Text>
                    {selected ? <Text style={styles.check}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  slotText: {
    flex: 1,
  },
  slotCaption: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 2,
  },
  slotValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  slotHint: {
    flexShrink: 0,
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 16,
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  optionSelected: {
    backgroundColor: COLORS.background,
  },
  optionText: {
    fontSize: 14,
    color: COLORS.text,
  },
  optionTextSelected: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  check: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
  },
});

export default MonthComparePicker;
