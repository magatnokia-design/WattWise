import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../../constants/colors';
import { authService } from '../../services/firebase';
import {
  GOOGLE_SIGN_IN_UNAVAILABLE,
  GOOGLE_SIGN_IN_IN_PROGRESS,
  GOOGLE_PLAY_SERVICES_MISSING,
  GOOGLE_NOT_CONFIGURED,
} from '../../services/auth/googleSignIn';

/**
 * "or" + "Continue with Google", for the Login and Register screens.
 *
 * One component for both because the action is the same on each: Google
 * either signs into the account for that address or creates it. There is no
 * separate "sign up with Google".
 *
 * Failures come back through `onError` as an AppDialog payload, so each screen
 * shows them in the dialog it already owns. A cancelled picker is not an error
 * and reports nothing.
 *
 * The button follows Google's branding rules - white, the four-colour G,
 * "Continue with Google" - which are a condition of using the logo, so it
 * deliberately does not take the app's green.
 */

const GOOGLE_ERRORS = {
  [GOOGLE_SIGN_IN_UNAVAILABLE]: {
    icon: '📱',
    tone: 'warning',
    title: 'Not available here',
    message: 'Google sign-in works in the installed Dagitab app, not in Expo Go. Use your email and password here instead.',
  },
  [GOOGLE_PLAY_SERVICES_MISSING]: {
    icon: '⚠️',
    tone: 'warning',
    title: 'Google Play services needed',
    message: 'This phone needs Google Play services to sign in with Google. Update it from the Play Store, or use your email and password.',
  },
  [GOOGLE_NOT_CONFIGURED]: {
    icon: '⚠️',
    tone: 'danger',
    title: 'Google sign-in is not set up',
    message: 'This copy of the app is not registered with Google yet. Use your email and password for now.',
  },
  [GOOGLE_SIGN_IN_IN_PROGRESS]: null,
  'auth/network-request-failed': {
    icon: '📡',
    tone: 'warning',
    title: 'No connection',
    message: 'Dagitab could not reach the server. Check your internet connection, then try again.',
  },
  'auth/user-disabled': {
    icon: '🔒',
    tone: 'danger',
    title: 'Account disabled',
    message: 'This account has been turned off. Contact support@dagitab.site.',
  },
};

const FALLBACK = {
  icon: '⚠️',
  tone: 'danger',
  title: 'Could not sign in with Google',
  message: 'Something went wrong. Try again, or use your email and password.',
};

// Google's "G", four colours, as published in its sign-in branding kit.
const GoogleG = ({ size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

export const GoogleSignInButton = ({ onError, disabled = false }) => {
  const [busy, setBusy] = useState(false);

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await authService.signInWithGoogle();
      if (result.success) {
        // Navigation follows from the auth state change, as for a password
        // sign-in. Last-login is best-effort and must not hold the screen, and
        // is skipped for a brand-new account: its user document is still being
        // created by useAuth, and an update to a missing document fails.
        if (!result.isNewUser) {
          const { userService } = require('../../services/firebase');
          userService.updateLastLogin(result.user.uid);
        }
        return;
      }
      if (result.cancelled) return;

      const known = GOOGLE_ERRORS[result.code];
      if (known === null) return; // a second tap while the picker is open
      onError?.(known || FALLBACK);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={styles.divider}>
        <View style={styles.rule} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.rule} />
      </View>

      <TouchableOpacity
        style={[styles.button, (disabled || busy) && styles.buttonDisabled]}
        onPress={handlePress}
        disabled={disabled || busy}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
      >
        {busy ? (
          <ActivityIndicator color={COLORS.textLight} />
        ) : (
          <>
            <GoogleG />
            <Text style={styles.label}>Continue with Google</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 12,
    color: COLORS.textLight,
    fontSize: 13,
  },
  button: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F1F1F',
  },
});

export default GoogleSignInButton;
