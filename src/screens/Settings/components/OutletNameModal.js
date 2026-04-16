import React, { useState, useEffect, useCallback } from 'react';
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

const OutletNameModal = ({ visible, outletNumber, currentName, onClose, onSave }) => {
  const { width } = useWindowDimensions();
  const [name, setName] = useState(currentName || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(currentName || '');
      setError('');
      setSaving(false);
    }
  }, [visible, currentName]);

  const handleClose = useCallback(() => {
    if (saving) return;
    setError('');
    onClose();
  }, [saving, onClose]);

  const handleSave = useCallback(async () => {
    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
      setError('Outlet name is required');
      return;
    }

    if (trimmedName.length > 30) {
      setError('Outlet name must be 30 characters or less');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await onSave(trimmedName);
      if (!result?.success) {
        setError(result?.error || 'Failed to update outlet name');
        return;
      }

      onClose();
    } finally {
      setSaving(false);
    }
  }, [name, onSave, onClose]);

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
            <Text style={styles.modalTitle}>Outlet {outletNumber} Name</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.closeBtn}>x</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSub}>Customize the label shown across dashboard and history.</Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError('');
            }}
            placeholder={`Outlet ${outletNumber}`}
            placeholderTextColor={COLORS.textLight}
            maxLength={30}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
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

export default OutletNameModal;
