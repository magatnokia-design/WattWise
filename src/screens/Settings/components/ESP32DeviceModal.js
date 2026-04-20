import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { COLORS } from '../../../constants/colors';

const ESP32DeviceModal = ({
  visible,
  currentDeviceId,
  currentDeviceToken,
  onClose,
  onSave,
}) => {
  const { width } = useWindowDimensions();
  const [deviceId, setDeviceId] = useState(currentDeviceId || '');
  const [deviceToken, setDeviceToken] = useState(currentDeviceToken || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;

    setDeviceId(currentDeviceId || '');
    setDeviceToken(currentDeviceToken || '');
    setSaving(false);
    setError('');
  }, [visible, currentDeviceId, currentDeviceToken]);

  const handleClose = useCallback(() => {
    if (saving) return;
    setError('');
    onClose();
  }, [onClose, saving]);

  const handleSave = useCallback(async () => {
    const normalizedDeviceId = String(deviceId || '').trim();
    const normalizedToken = String(deviceToken || '').trim();

    if (!normalizedDeviceId) {
      setError('Device ID is required');
      return;
    }

    if (!/^[A-Za-z0-9_-]{4,80}$/.test(normalizedDeviceId)) {
      setError('Device ID must be 4-80 chars and use only letters, numbers, _ or -');
      return;
    }

    if (!normalizedToken) {
      setError('Device token is required');
      return;
    }

    if (normalizedToken.length < 8) {
      setError('Device token must be at least 8 characters');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await onSave({
        deviceId: normalizedDeviceId,
        deviceToken: normalizedToken,
      });

      if (!result?.success) {
        setError(result?.error || 'Failed to save device settings');
        return;
      }

      onClose();
    } finally {
      setSaving(false);
    }
  }, [deviceId, deviceToken, onSave, onClose]);

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
          <View style={styles.headerRow}>
            <Text style={styles.title}>ESP32 Device</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.closeBtn}>x</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Link your ESP32 credentials to secure hardware updates.
          </Text>

          <Text style={styles.inputLabel}>Device ID</Text>
          <TextInput
            style={styles.input}
            value={deviceId}
            onChangeText={(text) => {
              setDeviceId(text);
              setError('');
            }}
            placeholder="e.g. ESP32_ROOM_A"
            placeholderTextColor={COLORS.textLight}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={80}
          />

          <Text style={styles.inputLabel}>Device Token</Text>
          <TextInput
            style={styles.input}
            value={deviceToken}
            onChangeText={(text) => {
              setDeviceToken(text);
              setError('');
            }}
            placeholder="Set a shared token for ESP32 requests"
            placeholderTextColor={COLORS.textLight}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={120}
            secureTextEntry
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, saving && styles.buttonDisabled]}
              onPress={handleClose}
              activeOpacity={0.7}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.buttonDisabled]}
              onPress={handleSave}
              activeOpacity={0.7}
              disabled={saving}
            >
              <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeBtn: {
    fontSize: 18,
    color: COLORS.textLight,
    padding: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 10,
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
  cancelText: {
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
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default ESP32DeviceModal;
