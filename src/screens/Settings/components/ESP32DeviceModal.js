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
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';

/**
 * Link a Hub by typing its ID and token - the fallback when the QR code cannot
 * be scanned.
 *
 * Opens with both fields EMPTY (Oct 2026). It used to open pre-filled with the
 * linked Hub's ID and its token, which made a form for entering new details
 * look like one that already held them - and put the device secret back on
 * screen to anyone holding the phone. The placeholders show the format.
 */
const ESP32DeviceModal = ({
  visible,
  onClose,
  onSave,
}) => {
  const { width } = useWindowDimensions();
  const [deviceId, setDeviceId] = useState('');
  const [deviceToken, setDeviceToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;

    setDeviceId('');
    setDeviceToken('');
    setShowToken(false);
    setSaving(false);
    setError('');
  }, [visible]);

  const handleClose = useCallback(() => {
    if (saving) return;
    setError('');
    onClose();
  }, [onClose, saving]);

  const handleSave = useCallback(async () => {
    const normalizedDeviceId = String(deviceId || '').trim();
    const normalizedToken = String(deviceToken || '').trim();

    if (!normalizedDeviceId) {
      setError('Enter the Hub ID.');
      return;
    }

    if (!/^[A-Za-z0-9_-]{4,80}$/.test(normalizedDeviceId)) {
      setError('The Hub ID is 4-80 letters, numbers, _ or -.');
      return;
    }

    if (!normalizedToken) {
      setError('Enter the Hub token.');
      return;
    }

    if (normalizedToken.length < 8) {
      setError('The Hub token is at least 8 characters.');
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
        setError(result?.error || 'The Hub could not be linked.');
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
            <View style={styles.headerIcon}>
              <Ionicons name="keypad-outline" size={18} color={COLORS.white} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Enter Hub details</Text>
              <Text style={styles.subtitle}>Printed on the card that came with your Hub</Text>
            </View>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={COLORS.textLight} />
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Hub ID</Text>
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

          <Text style={styles.inputLabel}>Hub token</Text>
          <View style={styles.tokenRow}>
            <TextInput
              style={[styles.input, styles.tokenInput]}
              value={deviceToken}
              onChangeText={(text) => {
                setDeviceToken(text);
                setError('');
              }}
              placeholder="At least 8 characters"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={120}
              secureTextEntry={!showToken}
            />
            <TouchableOpacity
              style={styles.eye}
              onPress={() => setShowToken((value) => !value)}
              accessibilityLabel={showToken ? 'Hide token' : 'Show token'}
            >
              <Ionicons name={showToken ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.textLight} />
            </TouchableOpacity>
          </View>

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
              <Text style={styles.saveText}>{saving ? 'Linking…' : 'Link Hub'}</Text>
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
    backgroundColor: 'rgba(7, 27, 44, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 16,
  },
  modalContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    marginBottom: 12,
  },
  tokenRow: {
    justifyContent: 'center',
  },
  tokenInput: {
    paddingRight: 46,
  },
  eye: {
    position: 'absolute',
    right: 12,
    top: 11,
  },
  errorText: {
    fontSize: 12.5,
    color: COLORS.error,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
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
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default ESP32DeviceModal;
