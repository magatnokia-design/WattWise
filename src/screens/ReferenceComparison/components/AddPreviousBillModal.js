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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

const AddPreviousBillModal = ({ visible, selectedMonth, previousData, onClose, onSave, onDelete }) => {
  const [kWh, setKWh] = useState('');
  const [cost, setCost] = useState('');
  const [outlet1, setOutlet1] = useState('');
  const [outlet2, setOutlet2] = useState('');

  useEffect(() => {
    if (visible) {
      setKWh(previousData.kWh > 0 ? previousData.kWh.toString() : '');
      setCost(previousData.cost > 0 ? previousData.cost.toString() : '');
      setOutlet1(previousData.outlet1 > 0 ? previousData.outlet1.toString() : '');
      setOutlet2(previousData.outlet2 > 0 ? previousData.outlet2.toString() : '');
    }
  }, [visible, previousData]);

  const getPreviousMonthLabel = () => {
    const date = new Date(selectedMonth + '-01');
    date.setMonth(date.getMonth() - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const handleSave = () => {
    const kWhValue = parseFloat(kWh);
    const costValue = parseFloat(cost);
    const outlet1Value = parseFloat(outlet1) || 0;
    const outlet2Value = parseFloat(outlet2) || 0;

    if (!kWh || isNaN(kWhValue) || kWhValue < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid energy usage (kWh)');
      return;
    }

    if (!cost || isNaN(costValue) || costValue < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid cost amount');
      return;
    }

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

    Alert.alert(
      'Delete previous bill?',
      `This will remove ${getPreviousMonthLabel()} comparison data.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await onDelete();
            if (result?.success) {
              onClose();
            } else {
              Alert.alert('Delete failed', result?.error || 'Please try again.');
            }
          },
        },
      ]
    );
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
            <Text style={styles.title}>Previous Bill Data</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.monthBadge}>
              <Ionicons name="calendar" size={16} color={COLORS.primary} />
              <Text style={styles.monthText}>{getPreviousMonthLabel()}</Text>
            </View>

            <Text style={styles.description}>
              Enter your previous month's electricity bill details for comparison
            </Text>

            {/* Energy Usage Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Energy Usage (kWh) *</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={kWh}
                  onChangeText={setKWh}
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
                  onChangeText={setCost}
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
                This data will be used to compare with your current month's usage
              </Text>
            </View>
          </ScrollView>

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
    marginBottom: 24,
    lineHeight: 20,
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