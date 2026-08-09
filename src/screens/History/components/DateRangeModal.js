import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import { DATE_RANGE_PRESETS } from '../utils/historyHelpers';

const DateRangeOption = ({ preset, active, onSelect }) => {
  const handlePress = useCallback(() => {
    onSelect(preset.id);
  }, [onSelect, preset.id]);

  return (
    <TouchableOpacity
      style={[styles.option, active && styles.optionActive]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Text style={[styles.optionText, active && styles.optionTextActive]}>
        {preset.label}
      </Text>
      {active && <Text style={styles.check}>✓</Text>}
    </TouchableOpacity>
  );
};

const DateRangeModal = ({ visible, activeRangeId, onSelect, onClose }) => {
  const handleSelect = useCallback((rangeId) => {
    onSelect(rangeId);
    onClose();
  }, [onSelect, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Filter by Date</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {DATE_RANGE_PRESETS.map((preset) => (
            <DateRangeOption
              key={preset.id}
              preset={preset}
              active={preset.id === activeRangeId}
              onSelect={handleSelect}
            />
          ))}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    fontSize: 16,
    color: COLORS.textLight,
    padding: 4,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  optionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  optionText: {
    fontSize: 14,
    color: COLORS.text,
  },
  optionTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  check: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
  },
});

export default DateRangeModal;
