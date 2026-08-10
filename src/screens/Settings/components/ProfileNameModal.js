import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS } from '../../../constants/colors';

/**
 * Edits the account's display name.
 *
 * A modal rather than Alert.prompt, which only exists on iOS - on Android that
 * call silently does nothing, so the row would look broken on the platform this
 * app actually ships to.
 */
const ProfileNameModal = ({ visible, currentName, onClose, onSave }) => {
  const { width } = useWindowDimensions();
  const [name, setName] = useState(currentName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setName(currentName || '');
      setSaving(false);
      setError(null);
    }
  }, [visible, currentName]);

  const trimmed = name.trim();
  const canSave = trimmed.length >= 2 && trimmed !== String(currentName || '').trim();

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    setSaving(true);
    const result = await onSave?.(trimmed);
    setSaving(false);

    if (result && result.success === false) {
      setError(result.error || 'Could not save the name.');
      return;
    }

    onClose?.();
  }, [canSave, onSave, onClose, trimmed]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.card, { width: Math.min(width - 48, 380) }]}>
            <Text style={styles.title}>Edit Profile Name</Text>
            <Text style={styles.subtitle}>
              Shown across the app and used to address the emails WattWise sends you.
            </Text>

            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError(null);
              }}
              placeholder="Your name"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="words"
              maxLength={60}
              autoFocus
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.save, (!canSave || saving) && styles.saveDisabled]}
                onPress={handleSave}
                disabled={!canSave || saving}
                activeOpacity={0.8}
              >
                <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  error: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 18,
  },
  cancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  save: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default ProfileNameModal;
