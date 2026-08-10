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
import { formatMonthShort, formatMonthLabel } from '../utils/comparisonHelpers';

/**
 * The "what am I comparing" control: two explicit slots with `vs` between them.
 *
 * Both sides are pickable. The previous design had a single month stepper and
 * an implicit "previous month" other side, which is what made the comparison
 * hard to reason about - you could not see what you were comparing against.
 */
const MonthComparePicker = ({ monthOptions, monthA, monthB, onSelectA, onSelectB }) => {
  const [openSide, setOpenSide] = useState(null);

  const handlePick = useCallback((month) => {
    if (openSide === 'A') onSelectA(month);
    if (openSide === 'B') onSelectB(month);
    setOpenSide(null);
  }, [openSide, onSelectA, onSelectB]);

  const activeValue = openSide === 'A' ? monthA : monthB;

  const renderSlot = (side, value, caption) => (
    <TouchableOpacity
      style={styles.slot}
      onPress={() => setOpenSide(side)}
      activeOpacity={0.7}
    >
      <Text style={styles.slotCaption}>{caption}</Text>
      <Text style={styles.slotValue}>{formatMonthShort(value)}</Text>
      <Text style={styles.slotHint}>Tap to change ▾</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {renderSlot('A', monthA, 'This month')}
        <View style={styles.vsWrap}>
          <Text style={styles.vs}>vs</Text>
        </View>
        {renderSlot('B', monthB, 'Compared to')}
      </View>

      <Modal
        visible={openSide !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenSide(null)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOpenSide(null)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>
              {openSide === 'A' ? 'Select month' : 'Compare against'}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {monthOptions.map((option) => {
                const selected = option.value === activeValue;
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
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  slot: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  slotCaption: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 2,
  },
  slotValue: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  slotHint: {
    fontSize: 10,
    color: COLORS.primary,
    marginTop: 3,
    fontWeight: '600',
  },
  vsWrap: {
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  vs: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textLight,
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
