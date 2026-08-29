// Forgot Password Screen
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '../../../components/common/Input';
import { Button } from '../../../components/common/Button';
import AppDialog from '../../../components/common/AppDialog';
import { authService } from '../../../services/firebase';
import { COLORS } from '../../../constants/colors';
import { SIZES, FONTS } from '../../../constants/theme';

export const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState(null);

  const validate = () => {
    if (!email) {
      setError('Email is required');
      return false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Email is invalid');
      return false;
    }
    setError('');
    return true;
  };

const handleResetPassword = async () => {
  if (!validate()) return;

  setLoading(true);
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const result = await authService.resetPassword(normalizedEmail);
    
    if (!result.success) {
      throw { code: result.code, message: result.error };
    }

    // Three things the plain "check your inbox" message left out, each of which
    // produces the same dead end - the handler reporting the link as expired or
    // already used, with no clue which:
    //   - Firebase reset links last one hour.
    //   - Sending a new one invalidates every earlier link for the account, so
    //     hunting through older emails after re-requesting always fails.
    //   - The sender has a poor reputation and routinely lands in spam, which is
    //     what makes people re-request in the first place.
    setDialog({
      icon: '✉️',
      tone: 'primary',
      title: 'Reset link sent',
      message:
        `Sent to ${normalizedEmail}.\n\n`
        + '• The link expires in 1 hour.\n'
        + '• Check your spam folder — it arrives from support@wattwise.site.\n'
        + '• If you request another, only the newest link works.',
      confirmLabel: 'Back to sign in',
      onConfirm: () => navigation.navigate('Login'),
    });
  } catch (error) {
    // Tone separates a fault the person can correct from one that only needs
    // waiting out. The OS dialog could express neither, so every failure here
    // looked the same as every other.
    const notFound = error.code === 'auth/user-not-found' || error.code === 'not-found';
    const badEmail = error.code === 'auth/invalid-email' || error.code === 'invalid-argument';

    if (error.code === 'auth/too-many-requests') {
      setDialog({
        icon: '⏳',
        tone: 'warning',
        title: 'Too many attempts',
        message: 'Wait a few minutes before requesting another reset link.',
      });
    } else if (notFound || badEmail) {
      setDialog({
        icon: '📧',
        tone: 'danger',
        title: notFound ? 'No account with that email' : 'That email looks wrong',
        message: notFound
          ? 'Nothing is registered to that address. Check the spelling, or create an account.'
          : 'Enter the address you registered with and try again.',
      });
    } else {
      setDialog({
        icon: '⚠️',
        tone: 'danger',
        title: 'Could not send the link',
        message: error.message || 'Something went wrong. Try again in a moment.',
      });
    }
  } finally {
    setLoading(false);
  }
};

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.logo}>🔒</Text>
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your email address and we'll send you a link to reset your password
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError('');
              }}
              placeholder="Enter your email"
              keyboardType="email-address"
              error={error}
            />

            <Button
              title="Send Reset Link"
              onPress={handleResetPassword}
              loading={loading}
            />

            <TouchableOpacity 
              onPress={() => navigation.navigate('Login')}
              style={styles.backToLogin}
            >
              <Text style={styles.backToLoginText}>← Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {dialog ? (
        <AppDialog
          {...dialog}
          onConfirm={dialog.onConfirm || (() => setDialog(null))}
        />
      ) : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: SIZES.padding * 1.5,
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 40,
  },
  logo: {
    fontSize: 60,
    marginBottom: 16,
  },
  title: {
    ...FONTS.h1,
    color: COLORS.textDark,
    marginBottom: 12,
  },
  subtitle: {
    ...FONTS.body,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  form: {
    flex: 1,
  },
  backToLogin: {
    alignSelf: 'center',
    marginTop: 24,
  },
  backToLoginText: {
    ...FONTS.body,
    color: COLORS.primary,
    fontWeight: '500',
  },
});