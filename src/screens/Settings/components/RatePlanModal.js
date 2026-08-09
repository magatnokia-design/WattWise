import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS } from '../../../constants/colors';

const buildOptionLabel = (profile) => {
  if (!profile) return '';
  const name = String(profile.name || '').trim();
  return name || 'Rate Plan';
};

const buildOptionSub = (profile) => {
  if (!profile) return '';
  const effectiveFrom = String(profile.effectiveFrom || '').trim();
  if (!effectiveFrom) return 'Effective date: unknown';
  return `Effective from ${effectiveFrom}`;
};

const RatePlanModal = ({
  visible,
  currentProfileId,
  profiles = [],
  onClose,
  onSave,
}) => {
  const { width } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState(currentProfileId || null);
  const [saving, setSaving] = useState(false);
  const options = useMemo(() => {
    const base = [{
      id: null,
      name: 'Auto (by date)',
      description: 'Selects the best profile based on the bill date',
    }];

    const profileOptions = Array.isArray(profiles) ? profiles.map((profile) => ({
      id: profile.id,
      name: buildOptionLabel(profile),
      description: buildOptionSub(profile),
    })) : [];

    return base.concat(profileOptions);
  }, [profiles]);

  useEffect(() => {
    if (visible) {
      setSelectedId(currentProfileId || null);
      setSaving(false);
    }
  }, [visible, currentProfileId]);

  const handleClose = useCallback(() => {
    if (saving) return;
    onClose();
  }, [saving, onClose]);

  const handleSave = useCallback(async () => {
    if (!onSave) {
      onClose();
      return;
    }

    setSaving(true);

    try {
      const result = await onSave(selectedId);
      if (!result?.success) {
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }, [onSave, onClose, selectedId]);

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
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Rate Plan</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSub}>
            Choose a rate plan for bill estimates. Auto mode picks the latest plan by date.
          </Text>

          <ScrollView style={styles.optionList} showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const isSelected = selectedId === option.id;
              return (
                <TouchableOpacity
                  key={option.id ?? 'auto'}
                  style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                  onPress={() => setSelectedId(option.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{option.name}</Text>
                    <Text style={styles.optionSub}>{option.description}</Text>
                  </View>
                  <Text style={styles.optionCheck}>{isSelected ? '✓' : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

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
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
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
    maxHeight: '80%'
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
    marginBottom: 16,
  },
  optionList: {
    maxHeight: 320,
    marginBottom: 16,
  },
  optionRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  optionRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}10`,
  },
  optionText: {
    flex: 1,
    marginRight: 12,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  optionSub: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
  },
  optionCheck: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    width: 18,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default RatePlanModal;
