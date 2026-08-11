import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../components/common/Button';
import { authService } from '../../../services/firebase';
import { COLORS } from '../../../constants/colors';
import { SIZES, FONTS } from '../../../constants/theme';

/**
 * Shown to a signed-in account whose email address has not been confirmed.
 *
 * Verification happens in the user's mail app, not here, so there is no way for
 * this screen to be told when it completes - onAuthStateChanged does not fire
 * for it. Hence the explicit "I've verified" button, which reloads the account
 * and hands the result back to the navigator.
 */
export const VerifyEmailScreen = ({ email, onVerified }) => {
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState(null);

  const handleCheck = useCallback(async () => {
    setNotice(null);
    setChecking(true);
    const result = await authService.refreshEmailVerified();
    setChecking(false);

    if (!result.success) {
      setNotice({ tone: 'error', text: result.error || 'Could not check. Try again.' });
      return;
    }

    if (!result.emailVerified) {
      setNotice({
        tone: 'error',
        text: 'Not verified yet. Open the link in the email, then tap this again.',
      });
      return;
    }

    onVerified?.();
  }, [onVerified]);

  const handleResend = useCallback(async () => {
    setNotice(null);
    setResending(true);
    const result = await authService.sendVerificationEmail();
    setResending(false);

    if (!result.success) {
      setNotice({ tone: 'error', text: result.error || 'Could not send. Try again.' });
      return;
    }

    setNotice({ tone: 'success', text: 'Sent. Check your inbox, and your spam folder.' });
  }, []);

  const handleSignOut = useCallback(async () => {
    await authService.logout();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.icon}>📧</Text>
        <Text style={styles.title}>Confirm your email</Text>
        <Text style={styles.subtitle}>
          We sent a link to{'\n'}
          <Text style={styles.email}>{email || 'your email address'}</Text>
        </Text>

        <Text style={styles.body}>
          Open it to finish setting up your account. WattWise sends your bills, usage receipts,
          and safety alerts to this address, so it needs to be one you can reach.
        </Text>

        {notice ? (
          <View style={[styles.notice, notice.tone === 'error' ? styles.noticeError : styles.noticeSuccess]}>
            <Text style={[styles.noticeText, notice.tone === 'error' ? styles.noticeTextError : styles.noticeTextSuccess]}>
              {notice.text}
            </Text>
          </View>
        ) : null}

        <Button
          title="I've verified — continue"
          onPress={handleCheck}
          loading={checking}
          style={{ marginTop: 8 }}
        />

        <Button
          title="Resend email"
          onPress={handleResend}
          loading={resending}
          variant="secondary"
          style={{ marginTop: 12 }}
        />

        <Button
          title="Sign out"
          onPress={handleSignOut}
          variant="secondary"
          style={{ marginTop: 12 }}
        />

        <Text style={styles.hint}>
          Wrong address? Sign out and register again — the unverified account will not be used.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SIZES.padding * 1.5,
  },
  icon: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 16,
  },
  title: {
    ...FONTS.h1,
    color: COLORS.textDark,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    ...FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 18,
  },
  email: {
    color: COLORS.text,
    fontWeight: '700',
  },
  body: {
    ...FONTS.small,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
  },
  notice: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  noticeError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  noticeSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  noticeText: {
    ...FONTS.small,
    lineHeight: 18,
  },
  noticeTextError: {
    color: COLORS.error,
  },
  noticeTextSuccess: {
    color: COLORS.primaryDark,
  },
  hint: {
    ...FONTS.small,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 17,
  },
});

export default VerifyEmailScreen;
