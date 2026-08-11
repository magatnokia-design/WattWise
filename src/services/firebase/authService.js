// Firebase Authentication Service
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  updateProfile
} from "firebase/auth";
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from "./config";
import { userService } from './userService';
import {
  getActivePushToken,
  clearActivePushToken,
} from '../notifications/activePushToken';

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

      // Best-effort: an account that exists but never got its verification mail
      // is recoverable from the verify screen's resend button, whereas throwing
      // here would leave the account created but the caller reporting failure.
      try {
        await sendEmailVerification(userCredential.user);
      } catch (verificationError) {
        console.warn('Could not send verification email:', verificationError?.message);
      }

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

  // Re-sends the verification email to the signed-in account.
  //
  // Rate limited by Firebase rather than here: repeated taps return
  // auth/too-many-requests, which the caller surfaces as-is.
  sendVerificationEmail: async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        return { success: false, error: 'Not signed in.' };
      }

      if (user.emailVerified) {
        return { success: true, alreadyVerified: true };
      }

      await sendEmailVerification(user);
      return { success: true };
    } catch (error) {
      if (error?.code === 'auth/too-many-requests') {
        return {
          success: false,
          error: 'Too many requests. Wait a minute before trying again.',
        };
      }

      console.error('Send verification email error:', error);
      return { success: false, error: error.message };
    }
  },

  // Re-reads the account from Firebase to pick up a verification that happened
  // in the mail app.
  //
  // Necessary because onAuthStateChanged does not fire when the email is
  // verified elsewhere - the local user object keeps saying emailVerified:false
  // until something reloads it.
  refreshEmailVerified: async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        return { success: false, error: 'Not signed in.' };
      }

      await reload(user);
      return { success: true, emailVerified: auth.currentUser?.emailVerified === true };
    } catch (error) {
      console.error('Reload user error:', error);
      return { success: false, error: error.message };
    }
  },

  // Renames the account.
  //
  // Written to both Firebase Auth and the user document: Auth's displayName is
  // what resolveUserContact reads when addressing emails, and the user document
  // is what the app reads. Letting them drift means email says one name and the
  // app another.
  updateDisplayName: async (displayName) => {
    const name = String(displayName || '').trim();

    if (name.length < 2) {
      return { success: false, error: 'Please enter at least 2 characters.' };
    }

    if (name.length > 60) {
      return { success: false, error: 'That name is too long.' };
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        return { success: false, error: 'Not signed in.' };
      }

      await updateProfile(user, { displayName: name });
      await userService.updateUserProfile(user.uid, { name });

      return { success: true, name };
    } catch (error) {
      console.error('Update display name error:', error);
      return { success: false, error: error.message };
    }
  },

  // Logout user
  logout: async () => {
    try {
      // Unregister this device *before* signing out: Firestore rules only allow
      // the owner to touch their user document, so the write has to happen
      // while the account is still authenticated. Otherwise the old account's
      // alerts would keep pushing to a phone someone else may now be using.
      const pushToken = getActivePushToken();
      const userId = auth.currentUser?.uid;

      if (pushToken && userId) {
        await userService.removePushToken(userId, pushToken);
      }
      clearActivePushToken();

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