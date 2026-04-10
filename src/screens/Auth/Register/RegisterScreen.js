// Register Screen
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView,
  TouchableOpacity,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input } from '../../../components/common/Input';
import { Button } from '../../../components/common/Button';
import { authService, initializationService } from '../../../services/firebase';
import { COLORS } from '../../../constants/colors';
import { SIZES, FONTS } from '../../../constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const RegisterScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validatePassword = (password) => {
    const minLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    return { minLength, hasUpperCase, hasLowerCase, hasNumber };
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else {
      const validation = validatePassword(formData.password);
      if (!validation.minLength) {
        newErrors.password = 'Password must be at least 8 characters';
      } else if (!validation.hasUpperCase || !validation.hasLowerCase || !validation.hasNumber) {
        newErrors.password = 'Password must contain uppercase, lowercase, and number';
      }
    }
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    if (!acceptedTerms) {
      Alert.alert('Error', 'Please accept the terms and conditions');
      return false;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

const handleRegister = async () => {
  if (!validate()) return;

  setLoading(true);
  try {
    // Clear onboarding flag
    await AsyncStorage.removeItem('onboarding_complete');
    
    // Register user with Firebase Auth
    const result = await authService.register(
      formData.email, 
      formData.password, 
      formData.name
    );
    
    if (!result.success) {
      throw new Error(result.error || 'Registration failed');
    }

    // Initialize user data in Firestore
    const initResult = await initializationService.initializeNewUser(
      result.user.uid,
      {
        email: formData.email,
        name: formData.name,
      }
    );

    if (!initResult.success) {
      console.error('Failed to initialize user data:', initResult.error);
      Alert.alert(
        'Warning',
        'Account created but setup incomplete. Please contact support.'
      );
    }

    // User automatically logged in, AppNavigator handles onboarding
  } catch (error) {
    let errorMessage = 'Registration failed';
    
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'Email already in use';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email address';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    Alert.alert('Error', errorMessage);
  } finally {
    setLoading(false);
  }
};

  const passwordValidation = validatePassword(formData.password);

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
            <Text style={styles.logo}>⚡</Text>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Sign up to get started</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Full Name"
              value={formData.name}
              onChangeText={(value) => updateFormData('name', value)}
              placeholder="Enter your name"
              error={errors.name}
            />

            <Input
              label="Email"
              value={formData.email}
              onChangeText={(value) => updateFormData('email', value)}
              placeholder="Enter your email"
              keyboardType="email-address"
              error={errors.email}
            />

            <Input
              label="Password"
              value={formData.password}
              onChangeText={(value) => updateFormData('password', value)}
              placeholder="Create a password"
              secureTextEntry
              showPasswordToggle
              error={errors.password}
            />

            {formData.password.length > 0 && (
              <View style={styles.passwordStrength}>
                <Text style={styles.passwordStrengthTitle}>Password must contain:</Text>
                <Text style={[styles.requirement, passwordValidation.minLength && styles.met]}>
                  {passwordValidation.minLength ? '✓' : '○'} At least 8 characters
                </Text>
                <Text style={[styles.requirement, passwordValidation.hasUpperCase && styles.met]}>
                  {passwordValidation.hasUpperCase ? '✓' : '○'} Uppercase letter
                </Text>
                <Text style={[styles.requirement, passwordValidation.hasLowerCase && styles.met]}>
                  {passwordValidation.hasLowerCase ? '✓' : '○'} Lowercase letter
                </Text>
                <Text style={[styles.requirement, passwordValidation.hasNumber && styles.met]}>
                  {passwordValidation.hasNumber ? '✓' : '○'} Number
                </Text>
              </View>
            )}

            <Input
              label="Confirm Password"
              value={formData.confirmPassword}
              onChangeText={(value) => updateFormData('confirmPassword', value)}
              placeholder="Confirm your password"
              secureTextEntry
              showPasswordToggle
              error={errors.confirmPassword}
            />

            <TouchableOpacity 
              style={styles.termsContainer}
              onPress={() => setAcceptedTerms(!acceptedTerms)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                {acceptedTerms && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.termsText}>
                I agree to the <Text style={styles.termsLink}>Terms & Conditions</Text>
              </Text>
            </TouchableOpacity>

            <Button
              title="Sign Up"
              onPress={handleRegister}
              loading={loading}
              style={{ marginTop: 8 }}
            />

            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLink}>Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    marginTop: 20,
    marginBottom: 30,
  },
  logo: {
    fontSize: 60,
    marginBottom: 16,
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
  passwordStrength: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  passwordStrengthTitle: {
    ...FONTS.small,
    color: COLORS.textDark,
    fontWeight: '600',
    marginBottom: 8,
  },
  requirement: {
    ...FONTS.small,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  met: {
    color: COLORS.success,
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  termsText: {
    ...FONTS.body,
    color: COLORS.textLight,
    flex: 1,
  },
  termsLink: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  loginText: {
    ...FONTS.body,
    color: COLORS.textLight,
  },
  loginLink: {
    ...FONTS.body,
    color: COLORS.primary,
    fontWeight: '600',
  },
});