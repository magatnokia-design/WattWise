import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';

/**
 * Icons, not emoji (Oct 2026). Callers still pass the emoji they always did -
 * about sixty of them across the app - and it is drawn as the matching Ionicon
 * in the tone's colour, so every dialog changed at once and none can be
 * missed. An Ionicons name may be passed directly instead.
 */
const EMOJI_ICONS = {
  '⚠️': 'warning',
  '📡': 'cloud-offline',
  '🔑': 'key',
  '📧': 'mail-unread',
  '✉️': 'mail',
  '🗑️': 'trash',
  '🔌': 'power',
  '📝': 'create',
  '⏳': 'hourglass',
  '🧾': 'receipt',
  '🛡️': 'shield-checkmark',
  '🚪': 'exit',
  '🔔': 'notifications',
  '🔒': 'lock-closed',
  '📱': 'phone-portrait',
  '📋': 'clipboard',
  '✅': 'checkmark-circle',
  '⚡': 'flash',
  '📤': 'share',
  '📷': 'camera',
};

export const dialogIconName = (icon) => {
  if (!icon) return null;
  if (EMOJI_ICONS[icon]) return EMOJI_ICONS[icon];
  return /^[a-z0-9-]+$/.test(icon) ? icon : 'information-circle';
};

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
  primary: { accent: COLORS.primary, tint: '#ECF8EF' },
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
              <Ionicons name={dialogIconName(icon)} size={24} color={palette.accent} />
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
    shadowColor: '#00401F',
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
