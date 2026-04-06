import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import { validateRate } from '../utils/settingsHelpers';

const ElectricityRateModal = ({ visible, currentRate, onClose, onSave }) => {
  const { width } = useWindowDimensions();
  const [rate, setRate] = useState(currentRate ? String(currentRate) : '');
  const [error, setError] = useState('');

  const handleSave = useCallback(() => {
    if (!validateRate(rate)) {
      setError('Please enter a valid rate (greater than 0)');
      return;
    }
    // TODO: Save to Firebase when backend is ready
    if (onSave) onSave(parseFloat(rate));
    onClose();
  }, [rate, onSave, onClose]);

  const handleClose = useCallback(() => {
    setError('');
    setRate(currentRate ? String(currentRate) : '');
    onClose();
  }, [currentRate, onClose]);

  const handleChangeText = useCallback((text) => {
    setRate(text);
    setError('');
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.modalContainer, { width: width - 32 }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Electricity Rate</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSub}>
            Set your electricity rate to calculate accurate costs.
          </Text>

          {/* Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.currencySymbol}>₱</Text>
            <TextInput
              style={styles.input}
              value={rate}
              onChangeText={handleChangeText}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={COLORS.textLight}
              maxLength={6}
            />
            <Text style={styles.inputSuffix}>/kWh</Text>
          </View>

          {/* Error */}
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          {/* Current Rate */}
          <Text style={styles.currentRate}>
            Current rate: ₱{currentRate ? parseFloat(currentRate).toFixed(2) : '0.00'}/kWh
          </Text>

          {/* Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.7}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 16,
  },
  modalContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    fontSize: 18,
    color: COLORS.textLight,
    padding: 4,
  },
  modalSub: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  inputSuffix: {
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 8,
  },
  currentRate: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
});

export default ElectricityRateModal;