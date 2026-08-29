// Login Screen
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  TouchableOpacity,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '../../../components/common/Input';
import { Button } from '../../../components/common/Button';
import { Wordmark } from '../../../components/common/Wordmark';
import AppDialog from '../../../components/common/AppDialog';
import { authService } from '../../../services/firebase';
import { COLORS } from '../../../constants/colors';
import { SIZES, FONTS } from '../../../constants/theme';

/**
 * What each sign-in failure says, and how it looks.
 *
 * These went through `Alert.alert`, which renders the OS dialog - on this
 * handset a dark grey slab with cyan text, a palette the app contains nowhere
 * else. It also cannot carry an icon or distinguish a network fault from a
 * wrong password, so every failure looked identical and none of them looked
 * like WattWise.
 *
 * Tone does the sorting: `warning` for something outside the account that will
 * pass, `danger` for something the person has to correct. Each message ends on
 * the action to take, because an error that only names the fault leaves the
 * reader where it found them.
 */
const SIGN_IN_ERRORS = {
  'auth/invalid-credential': {
    icon: '🔑',
    tone: 'danger',
    title: 'Those details did not match',
    message: 'The email and password do not match an account. Check both and try again — or reset the password if you cannot recall it.',
  },
  'auth/wrong-password': {
    icon: '🔑',
    tone: 'danger',
    title: 'Those details did not match',
    message: 'The email and password do not match an account. Check both and try again — or reset the password if you cannot recall it.',
  },
  'auth/user-not-found': {
    icon: '🔑',
    tone: 'danger',
    title: 'Those details did not match',
    message: 'The email and password do not match an account. Check both and try again — or create an account if you have not registered.',
  },
  'auth/too-many-requests': {
    icon: '⏳',
    tone: 'warning',
    title: 'Too many attempts',
    message: 'Sign-in is paused for a few minutes after several failed tries. Wait a moment, then try again, or reset your password.',
  },
  'auth/network-request-failed': {
    icon: '📡',
    tone: 'warning',
    title: 'No connection',
    message: 'WattWise could not reach the server. Check your internet connection — and any VPN or firewall — then try again. Nothing was sent.',
  },
};

const FALLBACK_SIGN_IN_ERROR = {
  icon: '⚠️',
  tone: 'danger',
  title: 'Could not sign in',
  message: 'Something went wrong while signing in. Try again in a moment.',
};

// The code is the authority; a raw Firebase message is only ever a last resort,
// because those are written for developers and read as noise on a login screen.
export const resolveSignInError = (error) => {
  const known = SIGN_IN_ERRORS[error?.code];
  if (known) return known;
  if (error?.message) return { ...FALLBACK_SIGN_IN_ERROR, message: error.message };
  return FALLBACK_SIGN_IN_ERROR;
};

export const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [dialog, setDialog] = useState(null);

  // Clears a field's validation message as soon as the user edits it.
  //
  // Without this the message outlives the mistake: "Password must be at least 6
  // characters" stayed on screen while the user typed a longer one, so the form
  // sat there contradicting its own contents. `RegisterScreen` and
  // `ForgotPasswordScreen` already did this; only this screen was missed.
  const clearFieldError = (field) => {
    setErrors((previous) => (previous[field] ? { ...previous, [field]: '' } : previous));
  };
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors = {};
    
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

const handleLogin = async () => {
  if (!validate()) return;

  setLoading(true);
  try {
    const result = await authService.login(email.trim(), password);
    
    if (!result.success) {
      throw { code: result.code, message: result.error };
    }

    // Update last login
    if (result.user?.uid) {
      const { userService } = require('../../../services/firebase');
      await userService.updateLastLogin(result.user.uid);
    }
    
    // Navigation handled by AppNavigator
  } catch (error) {
    setDialog(resolveSignInError(error));
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
            {/* The disc version: this screen is on a light background, where a
                white bolt alone would be invisible. */}
            <Image
              source={require('../../../../assets/logo-mark.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Wordmark style={styles.wordmark} />
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Login to your account</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                clearFieldError('email');
              }}
              placeholder="Enter your email"
              keyboardType="email-address"
              error={errors.email}
            />

            <Input
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                clearFieldError('password');
              }}
              placeholder="Enter your password"
              secureTextEntry
              showPasswordToggle
              error={errors.password}
            />

            <TouchableOpacity 
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgotPassword}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <Button
              title="Login"
              onPress={handleLogin}
              loading={loading}
            />

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.signupLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Mounted conditionally: React Native renders a Modal’s children even
          while it is hidden, so a permanently-mounted one is live UI. */}
      {dialog ? (
        <AppDialog
          {...dialog}
          confirmLabel="Got it"
          onConfirm={() => setDialog(null)}
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
    marginTop: 40,
    marginBottom: 40,
  },
  logo: {
    width: 72,
    height: 72,
    marginBottom: 12,
  },
  // Sits tight under the disc so the two read as one lockup rather than as two
  // separate things that happen to be stacked.
  wordmark: {
    ...FONTS.h1,
    color: COLORS.textDark,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  title: {
    ...FONTS.h1,
    color: COLORS.textDark,
    marginBottom: 8,
  },
  subtitle: {
    ...FONTS.body,
    color: COLORS.textLight,
  },
  form: {
    flex: 1,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    ...FONTS.body,
    color: COLORS.primary,
    fontWeight: '500',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  signupText: {
    ...FONTS.body,
    color: COLORS.textLight,
  },
  signupLink: {
    ...FONTS.body,
    color: COLORS.primary,
    fontWeight: '600',
  },
});