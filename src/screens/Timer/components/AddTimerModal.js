import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Alert,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { COLORS } from '../../../constants/colors';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const OUTLETS = ['1', '2'];
const ACTIONS = ['ON', 'OFF'];
const TIMER_TYPES = ['countdown', 'scheduled'];

const TimePickerBox = ({ value, onIncrease, onDecrease, label }) => (
  <View style={styles.timePickerBox}>
    <TouchableOpacity onPress={onIncrease} style={styles.timeBtn} activeOpacity={0.7}>
      <Text style={styles.timeBtnText}>▲</Text>
    </TouchableOpacity>
    <Text style={styles.timeValue}>{String(value).padStart(2, '0')}</Text>
    <TouchableOpacity onPress={onDecrease} style={styles.timeBtn} activeOpacity={0.7}>
      <Text style={styles.timeBtnText}>▼</Text>
    </TouchableOpacity>
    <Text style={styles.timeLabel}>{label}</Text>
  </View>
);

const AddTimerModal = ({ visible, onClose, onSave, saving = false }) => {
  const { width, height } = useWindowDimensions();

  const [timerType, setTimerType] = useState('countdown');
  const [selectedOutlet, setSelectedOutlet] = useState('1');
  const [selectedAction, setSelectedAction] = useState('ON');
  const [selectedDays, setSelectedDays] = useState([]);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [schedHours, setSchedHours] = useState(0);
  const [schedMinutes, setSchedMinutes] = useState(0);

  const handleDayToggle = useCallback((day) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }, []);

  const resetForm = useCallback(() => {
    setTimerType('countdown');
    setSelectedOutlet('1');
    setSelectedAction('ON');
    setSelectedDays([]);
    setHours(0);
    setMinutes(0);
    setSeconds(0);
    setSchedHours(0);
    setSchedMinutes(0);
  }, []);

  const handleSave = useCallback(async () => {
    if (timerType === 'countdown' && hours === 0 && minutes === 0 && seconds === 0) {
      Alert.alert('Invalid duration', 'Set a countdown duration greater than 0 seconds.');
      return;
    }

    if (timerType === 'scheduled' && selectedDays.length === 0) {
      Alert.alert('Select repeat days', 'Choose at least one day for a scheduled timer.');
      return;
    }

    const scheduleData = {
      type: timerType,
      outlet: selectedOutlet,
      action: selectedAction,
      days: selectedDays,
      countdownTime: timerType === 'countdown'
        ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : null,
      scheduledTime: timerType === 'scheduled'
        ? `${String(schedHours).padStart(2, '0')}:${String(schedMinutes).padStart(2, '0')}`
        : null,
      active: true,
    };

    if (!onSave) {
      resetForm();
      onClose();
      return;
    }

    const result = await onSave(scheduleData);
    if (result?.success) {
      resetForm();
    }
  }, [
    timerType,
    selectedOutlet,
    selectedAction,
    selectedDays,
    hours,
    minutes,
    seconds,
    schedHours,
    schedMinutes,
    onSave,
    onClose,
    resetForm,
  ]);

  const handleClose = useCallback(() => {
    if (saving) return;
    resetForm();
    onClose();
  }, [resetForm, onClose, saving]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { width: width - 32, maxHeight: height * 0.85 }]}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Timer</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Timer Type Selector */}
            <Text style={styles.sectionLabel}>Timer Type</Text>
            <View style={styles.typeSelector}>
              {TIMER_TYPES.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeBtn, timerType === type && styles.typeBtnActive]}
                  onPress={() => setTimerType(type)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeBtnText, timerType === type && styles.typeBtnTextActive]}>
                    {type === 'countdown' ? '⏱ Countdown' : '🕐 Scheduled'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Outlet Selector */}
            <Text style={styles.sectionLabel}>Select Outlet</Text>
            <View style={styles.rowSelector}>
              {OUTLETS.map(outlet => (
                <TouchableOpacity
                  key={outlet}
                  style={[styles.selectorBtn, selectedOutlet === outlet && styles.selectorBtnActive]}
                  onPress={() => setSelectedOutlet(outlet)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.selectorBtnText, selectedOutlet === outlet && styles.selectorBtnTextActive]}>
                    Outlet {outlet}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Action Selector */}
            <Text style={styles.sectionLabel}>Action</Text>
            <View style={styles.rowSelector}>
              {ACTIONS.map(action => (
                <TouchableOpacity
                  key={action}
                  style={[
                    styles.selectorBtn,
                    selectedAction === action && styles.selectorBtnActive,
                    selectedAction === action && action === 'OFF' && styles.selectorBtnOff,
                  ]}
                  onPress={() => setSelectedAction(action)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.selectorBtnText, selectedAction === action && styles.selectorBtnTextActive]}>
                    {action === 'ON' ? '🟢 Turn ON' : '🔴 Turn OFF'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Countdown Timer */}
            {timerType === 'countdown' && (
              <>
                <Text style={styles.sectionLabel}>Set Duration</Text>
                <View style={styles.timePickerRow}>
                  <TimePickerBox
                    value={hours}
                    onIncrease={() => setHours(h => (h + 1) % 24)}
                    onDecrease={() => setHours(h => (h - 1 + 24) % 24)}
                    label="HH"
                  />
                  <Text style={styles.timeSeparator}>:</Text>
                  <TimePickerBox
                    value={minutes}
                    onIncrease={() => setMinutes(m => (m + 1) % 60)}
                    onDecrease={() => setMinutes(m => (m - 1 + 60) % 60)}
                    label="MM"
                  />
                  <Text style={styles.timeSeparator}>:</Text>
                  <TimePickerBox
                    value={seconds}
                    onIncrease={() => setSeconds(s => (s + 1) % 60)}
                    onDecrease={() => setSeconds(s => (s - 1 + 60) % 60)}
                    label="SS"
                  />
                </View>
              </>
            )}

            {/* Scheduled Time */}
            {timerType === 'scheduled' && (
              <>
                <Text style={styles.sectionLabel}>Set Time</Text>
                <View style={styles.timePickerRow}>
                  <TimePickerBox
                    value={schedHours}
                    onIncrease={() => setSchedHours(h => (h + 1) % 24)}
                    onDecrease={() => setSchedHours(h => (h - 1 + 24) % 24)}
                    label="HH"
                  />
                  <Text style={styles.timeSeparator}>:</Text>
                  <TimePickerBox
                    value={schedMinutes}
                    onIncrease={() => setSchedMinutes(m => (m + 1) % 60)}
                    onDecrease={() => setSchedMinutes(m => (m - 1 + 60) % 60)}
                    label="MM"
                  />
                </View>

                {/* Days Selector */}
                <Text style={styles.sectionLabel}>Repeat Days</Text>
                <View style={styles.daysContainer}>
                  {DAYS.map(day => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayBtn, selectedDays.includes(day) && styles.dayBtnActive]}
                      onPress={() => handleDayToggle(day)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayBtnText, selectedDays.includes(day) && styles.dayBtnTextActive]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, saving && styles.buttonDisabled]}
                onPress={handleClose}
                activeOpacity={0.7}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.buttonDisabled]}
                onPress={handleSave}
                activeOpacity={0.7}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Timer'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
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
    marginBottom: 20,
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
    marginBottom: 8,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  typeBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  typeBtnTextActive: {
    color: COLORS.white,
  },
  rowSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  selectorBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  selectorBtnOff: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  selectorBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  selectorBtnTextActive: {
    color: COLORS.white,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  timePickerBox: {
    alignItems: 'center',
  },
  timeBtn: {
    padding: 8,
  },
  timeBtnText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '700',
  },
  timeValue: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 60,
    textAlign: 'center',
  },
  timeLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
  },
  timeSeparator: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  dayBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  dayBtnTextActive: {
    color: COLORS.white,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 8,
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
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default AddTimerModal;