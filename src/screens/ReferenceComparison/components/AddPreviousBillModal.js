import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const AddPreviousBillModal = ({ visible, selectedMonth, previousData, onClose, onSave, onDelete }) => {
  const [kWh, setKWh] = useState('');
  const [cost, setCost] = useState('');
  const [outlet1, setOutlet1] = useState('');
  const [outlet2, setOutlet2] = useState('');

  // Both of these stay inside the modal rather than opening a second one on top
  // of it. The error names a field the user can see; the delete confirmation
  // replaces the footer, so the row being deleted stays visible while it is
  // being confirmed.
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (visible) {
      setKWh(previousData.kWh > 0 ? previousData.kWh.toString() : '');
      setCost(previousData.cost > 0 ? previousData.cost.toString() : '');
      setOutlet1(previousData.outlet1 > 0 ? previousData.outlet1.toString() : '');
      setOutlet2(previousData.outlet2 > 0 ? previousData.outlet2.toString() : '');
      setError(null);
      setConfirmingDelete(false);
    }
  }, [visible, previousData]);

  // selectedMonth is the month being billed. It used to be the month *after*,
  // with this helper subtracting one - that indirection is gone now that the
  // screen targets a month directly.
  const getBillMonthLabel = () => {
    const date = new Date(selectedMonth + '-01');
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const handleSave = () => {
    const kWhValue = parseFloat(kWh);
    const costValue = parseFloat(cost);
    const outlet1Value = parseFloat(outlet1) || 0;
    const outlet2Value = parseFloat(outlet2) || 0;

    if (!kWh || isNaN(kWhValue) || kWhValue < 0) {
      setError('Enter the energy usage in kWh, exactly as printed on the bill.');
      return;
    }

    if (!cost || isNaN(costValue) || costValue < 0) {
      setError('Enter the total cost in pesos, exactly as printed on the bill.');
      return;
    }

    setError(null);

    onSave({
      kWh: kWhValue,
      cost: costValue,
      outlet1: outlet1Value,
      outlet2: outlet2Value,
    });
    onClose();
  };

  const hasExistingData = previousData.kWh > 0 || previousData.cost > 0;

  const handleDelete = () => {
    if (!onDelete) return;
    setError(null);
    setConfirmingDelete(true);
  };

  const handleConfirmDelete = async () => {
    const result = await onDelete();

    if (result?.success) {
      onClose();
      return;
    }

    setConfirmingDelete(false);
    setError(result?.error || 'The saved bill could not be deleted. Please try again.');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Actual PELCO III Bill</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.monthBadge}>
              <Ionicons name="calendar" size={16} color={COLORS.primary} />
              <Text style={styles.monthText}>{getBillMonthLabel()}</Text>
            </View>

            {/* The month this is filed under is the month the electricity was
                USED, not the month the paper arrived. Those differ by one, and
                the old copy - "your paper bill for this month" - did not say
                which it meant. Filing a bill a month late compares WattWise's
                August against PELCO's July and quietly reports the gap as
                error. */}
            <Text style={styles.description}>
              Enter the totals printed on your bill for the electricity used in{' '}
              <Text style={styles.descriptionStrong}>{getBillMonthLabel()}</Text>, so WattWise can
              check its estimate against the real thing.
            </Text>

            <View style={styles.periodNote}>
              <Ionicons name="calendar-outline" size={15} color={COLORS.warning} />
              <Text style={styles.periodNoteText}>
                A bill usually arrives the month after the electricity was used, so the bill in your
                hand this month probably belongs to last month. Check the billing period printed on
                it, not the date it was issued.
              </Text>
            </View>

            {/* Energy Usage Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Energy Usage (kWh) *</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={kWh}
                  onChangeText={(text) => {
                    setKWh(text);
                    if (error) setError(null);
                  }}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.textLight}
                />
                <Text style={styles.unit}>kWh</Text>
              </View>
            </View>

            {/* Cost Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Total Cost *</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.currencySymbol}>₱</Text>
                <TextInput
                  style={styles.input}
                  value={cost}
                  onChangeText={(text) => {
                    setCost(text);
                    if (error) setError(null);
                  }}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={COLORS.textLight}
                />
              </View>
            </View>

            {/* Outlet Breakdown (Optional) */}
            <View style={styles.optionalSection}>
              <Text style={styles.sectionTitle}>Outlet Breakdown (Optional)</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Outlet 1 (kWh)</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={outlet1}
                    onChangeText={setOutlet1}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={COLORS.textLight}
                  />
                  <Text style={styles.unit}>kWh</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Outlet 2 (kWh)</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={outlet2}
                    onChangeText={setOutlet2}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={COLORS.textLight}
                  />
                  <Text style={styles.unit}>kWh</Text>
                </View>
              </View>
            </View>

            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={16} color={COLORS.primary} />
              <Text style={styles.infoText}>
                WattWise measures two outlets, so its total will be far below the bill. The check
                that matters is whether its rates price the bill&apos;s own kWh correctly.
              </Text>
            </View>
          </ScrollView>

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {confirmingDelete ? (
            <View style={styles.confirmBar}>
              <Text style={styles.confirmText}>
                Remove the actual bill saved for {getBillMonthLabel()}? This cannot be undone.
              </Text>
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => setConfirmingDelete(false)}
                >
                  <Text style={styles.cancelText}>Keep</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.deleteButton]}
                  onPress={handleConfirmDelete}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.footer}>
              {hasExistingData && (
                <TouchableOpacity
                  style={[styles.button, styles.deleteButton]}
                  onPress={handleDelete}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSave}
              >
                <Text style={styles.saveText}>Save Data</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  monthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primaryLight + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    marginBottom: 12,
  },
  monthText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  description: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 12,
    lineHeight: 20,
  },
  descriptionStrong: {
    fontWeight: '700',
    color: COLORS.textDark,
  },
  // Amber rather than the theme green: this is the one thing on the form a user
  // can get wrong in a way that silently corrupts the comparison.
  periodNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    marginBottom: 24,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  periodNoteText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#92400E',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  unit: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textLight,
    marginLeft: 8,
  },
  optionalSection: {
    marginTop: 8,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight + '10',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.primary,
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.error,
  },
  confirmBar: {
    backgroundColor: '#FEF2F2',
  },
  confirmText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textDark,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.background,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#B91C1C',
  },
});

export default AddPreviousBillModal;