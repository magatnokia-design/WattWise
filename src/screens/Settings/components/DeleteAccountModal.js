import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS } from '../../../constants/colors';

/**
 * Two-step confirmation for deleting an account.
 *
 * Step one tells the user what goes, itemised, before offering any way to
 * proceed. Step two asks them to type their own email address and their
 * password.
 *
 * The steps are separated on purpose. A single dialog with a warning and a red
 * button gets dismissed by reflex; making the destructive action live on a
 * second screen means nobody reaches it without having read a list of what they
 * are about to lose. The typed email cannot be produced by a mis-tap, and the
 * password is what Firebase requires anyway to delete an account - asked for
 * plainly here rather than thrown back as an error afterwards.
 */

// What actually gets removed. Written as user-facing nouns rather than
// collection names, but it is the same list the callable enumerates.
const DELETED_ITEMS = [
  ['👤', 'Your account', 'Email, name and sign-in. You will not be able to sign in again.'],
  ['⚡', 'All energy readings', 'Every voltage, current and power measurement recorded for both outlets.'],
  ['🧾', 'Usage history and bills', 'Daily records, monthly statements and any past bills you entered for comparison.'],
  ['🔌', 'Learned appliances', 'Every appliance signature WattWise measured and you confirmed.'],
  ['💰', 'Budget and alerts', 'Your monthly budget, spending records and all notifications.'],
  ['⏱️', 'Schedules and safety settings', 'Timers, countdowns and your power safety thresholds.'],
];

export const DeleteAccountModal = ({ visible, email, onClose, onConfirm }) => {
  const [step, setStep] = useState(1);
  const [typedEmail, setTypedEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const accountEmail = String(email || '').trim();

  const emailMatches = useMemo(
    () => typedEmail.trim().toLowerCase() === accountEmail.toLowerCase() && !!accountEmail,
    [typedEmail, accountEmail]
  );

  const canDelete = emailMatches && password.length > 0 && !deleting;

  const reset = useCallback(() => {
    setStep(1);
    setTypedEmail('');
    setPassword('');
    setError('');
    setDeleting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (deleting) return;
    reset();
    onClose();
  }, [deleting, onClose, reset]);

  const handleDelete = useCallback(async () => {
    if (!canDelete) return;

    setError('');
    setDeleting(true);
    const result = await onConfirm(password);
    setDeleting(false);

    if (!result?.success) {
      // A wrong password is by far the most likely failure and reads as a bug
      // if reported as "could not delete".
      const wrongPassword =
        result?.code === 'auth/wrong-password' ||
        result?.code === 'auth/invalid-credential';

      setError(
        wrongPassword
          ? 'That password is not correct.'
          : result?.error || 'Could not delete the account. Please try again.'
      );
      return;
    }

    reset();
  }, [canDelete, onConfirm, password, reset]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centering}
        >
          <View style={styles.card}>
            <Text style={styles.title}>
              {step === 1 ? 'Delete your account?' : 'Confirm deletion'}
            </Text>

            {step === 1 ? (
              <>
                <Text style={styles.lead}>
                  This permanently deletes everything below. It cannot be undone,
                  and WattWise keeps no copy you could ask to have restored.
                </Text>

                <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                  {DELETED_ITEMS.map(([icon, label, detail]) => (
                    <View key={label} style={styles.item}>
                      <Text style={styles.itemIcon}>{icon}</Text>
                      <View style={styles.itemText}>
                        <Text style={styles.itemLabel}>{label}</Text>
                        <Text style={styles.itemDetail}>{detail}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.notice}>
                  <Text style={styles.noticeText}>
                    Your WattWise unit is not deleted. It is released from this
                    account so it can be paired again — the hardware keeps working
                    and nothing needs reflashing.
                  </Text>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.secondary} onPress={handleClose}>
                    <Text style={styles.secondaryText}>Keep my account</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.danger}
                    onPress={() => setStep(2)}
                  >
                    <Text style={styles.dangerText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.lead}>
                  Type your email address and password to confirm. This is the
                  last step — the account is deleted immediately afterwards.
                </Text>

                {error ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Text style={styles.label}>
                  Type <Text style={styles.labelEmail}>{accountEmail}</Text>
                </Text>
                <TextInput
                  style={[styles.input, typedEmail && !emailMatches ? styles.inputError : null]}
                  value={typedEmail}
                  onChangeText={(value) => {
                    setTypedEmail(value);
                    setError('');
                  }}
                  placeholder="Your email address"
                  placeholderTextColor={COLORS.textLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!deleting}
                />

                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setError('');
                  }}
                  placeholder="Your password"
                  placeholderTextColor={COLORS.textLight}
                  secureTextEntry
                  autoCapitalize="none"
                  editable={!deleting}
                />

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.secondary}
                    onPress={() => (deleting ? null : setStep(1))}
                    disabled={deleting}
                  >
                    <Text style={styles.secondaryText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.danger, !canDelete ? styles.dangerDisabled : null]}
                    onPress={handleDelete}
                    disabled={!canDelete}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Text style={styles.dangerText}>Delete forever</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
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
  },
  centering: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  lead: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 19,
    marginBottom: 14,
  },
  list: {
    maxHeight: 260,
  },
  item: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  itemIcon: {
    fontSize: 15,
    marginRight: 10,
    marginTop: 1,
  },
  itemText: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  itemDetail: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
  },
  notice: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    lineHeight: 17,
  },
  label: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 6,
  },
  labelEmail: {
    fontWeight: '700',
    color: COLORS.text,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 14,
    backgroundColor: COLORS.white,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  secondary: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginRight: 8,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  danger: {
    backgroundColor: COLORS.error,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerDisabled: {
    opacity: 0.45,
  },
  dangerText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default DeleteAccountModal;
