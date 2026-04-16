// Firebase Authentication Service
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile
} from "firebase/auth";
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from "./config";

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const isExpectedAuthError = (code) => [
  'auth/invalid-credential',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/too-many-requests',
  'auth/network-request-failed',
  'auth/email-already-in-use',
  'auth/invalid-email',
  'auth/weak-password',
].includes(code);

export const authService = {
  // Register new user
  register: async (email, password, displayName) => {
    try {
      const normalizedEmail = normalizeEmail(email);
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      await updateProfile(userCredential.user, { displayName });
      return { success: true, user: userCredential.user };
    } catch (error) {
      if (!isExpectedAuthError(error?.code)) {
        console.error('Registration error:', error);
      }
      return { success: false, error: error.message, code: error.code };
    }
  },

  // Login user
  login: async (email, password) => {
    try {
      const normalizedEmail = normalizeEmail(email);
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      if (!isExpectedAuthError(error?.code)) {
        console.error('Login error:', error);
      }
      return { success: false, error: error.message, code: error.code };
    }
  },

  // Logout user
  logout: async () => {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: error.message };
    }
  },

  // Forgot password
  resetPassword: async (email) => {
    try {
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail) {
        return {
          success: false,
          code: 'auth/invalid-email',
          error: 'Invalid email address',
        };
      }

      // Enforce reset only for existing Auth users.
      const checkUserExistsByEmail = httpsCallable(functions, 'checkUserExistsByEmail');
      const checkResult = await checkUserExistsByEmail({ email: normalizedEmail });

      if (!checkResult?.data?.exists) {
        return {
          success: false,
          code: 'auth/user-not-found',
          error: 'No account found with this email',
        };
      }

      await sendPasswordResetEmail(auth, normalizedEmail);
      return { success: true };
    } catch (error) {
      const code = typeof error?.code === 'string'
        ? error.code.replace('functions/', '')
        : error?.code;

      if (!isExpectedAuthError(code)) {
        console.error('Password reset error:', error);
      }

      return {
        success: false,
        error: error?.details || error?.message || 'Failed to send reset email',
        code,
      };
    }
  },

  // Get current user
  getCurrentUser: () => {
    return auth.currentUser;
  }
};