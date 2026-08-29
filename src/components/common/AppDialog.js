import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../../constants/colors';

/**
 * The app's own dialog, replacing `Alert.alert`.
 *
 * `Alert.alert` renders whatever the OS decides. On the test handset that is a
 * dark grey slab with cyan text - a palette this app does not contain anywhere
 * else, dropped on top of a green-and-white screen. It also cannot show an icon,
 * cannot mark a destructive action as destructive on Android, and looks
 * different on every manufacturer's skin, so the same build does not look like
 * the same app twice.
 *
 * Deliberately not a general-purpose modal: one title, one message, at most two
 * actions. Anything needing more than that is a screen, not a dialog.
 *
 * Mount it conditionally - `{state ? <AppDialog .../> : null}` - rather than
 * leaving it mounted with `visible={false}`. React Native still renders a
 * Modal's children while it is hidden.
 *
 * `onDismiss` exists for the one case the two-button rule does not cover: a
 * dialog whose *cancel* slot carries a real second choice rather than "go
 * away". Backing out of that must not perform either choice, and without a
 * separate handler it would perform the cancel one.
 */
const TONES = {
  primary: { accent: COLORS.primary, tint: '#ECFDF5' },
  danger: { accent: COLORS.error, tint: '#FEF2F2' },
  warning: { accent: COLORS.warning, tint: '#FFFBEB' },
};

export const AppDialog = ({
  visible = true,
  icon,
  title,
  message,
  tone = 'primary',
  confirmLabel = 'OK',
  cancelLabel,
  onConfirm,
  onCancel,
  onDismiss,
  confirmDisabled = false,
}) => {
  const palette = TONES[tone] || TONES.primary;

  // The tap-outside and hardware-back route. Falls back to confirm only when
  // there is no cancel - a one-button dialog is an acknowledgement, so
  // dismissing it and pressing OK mean the same thing. With two buttons they do
  // not, and backing out must never be read as consent.
  const dismiss = onDismiss || onCancel || (cancelLabel ? undefined : onConfirm);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {icon ? (
            <View style={[styles.iconWrap, { backgroundColor: palette.tint }]}>
              <Text style={styles.icon}>{icon}</Text>
            </View>
          ) : null}

          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.actions}>
            {cancelLabel ? (
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onCancel}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>{cancelLabel}</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: palette.accent },
                confirmDisabled && styles.buttonDisabled,
              ]}
              onPress={onConfirm}
              disabled={confirmDisabled}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 22,
    // Android ignores shadow*, iOS ignores elevation; both are set so the card
    // lifts off the dimmed screen on either.
    elevation: 6,
    shadowColor: '#064E3B',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  icon: {
    fontSize: 22,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    letterSpacing: -0.3,
  },
  message: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textLight,
  },
  actions: {
    marginTop: 22,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    minWidth: 96,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textLight,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default AppDialog;
