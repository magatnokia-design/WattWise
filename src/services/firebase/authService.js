// Firebase Authentication Service
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  reload,
  updateProfile,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "firebase/auth";
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from "./config";
import { userService } from './userService';
import {
  getActivePushToken,
  clearActivePushToken,
} from '../notifications/activePushToken';

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

/**
 * How long sign-out waits for the push-token cleanup before going ahead.
 *
 * Long enough that the write normally completes on a working connection, short
 * enough that a user on a bad one is not left holding a button that appears
 * dead. Sign-out itself is not on this budget - only the cleanup before it.
 */
const PUSH_CLEANUP_TIMEOUT_MS = 3000;

const isExpectedAuthError = (code) => [
  'auth/invalid-credential',
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/too-many-requests',
  'auth/network-request-failed',
  'auth/email-already-in-use',
  'auth/invalid-email',
  'auth/weak-password',
  // Returned when the project's server-side password policy rejects a password.
  // Distinct from auth/weak-password, which is Firebase's own fixed minimum -
  // this one is our configured rule, and it is the code that actually fires now
  // that the policy is enforced server-side rather than only in the form.
  'auth/password-does-not-meet-requirements',
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
        await httpsCallable(functions, 'sendVerificationEmail')();
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
  // Goes through a callable rather than Firebase's own sendEmailVerification:
  // this project cannot edit Firebase's templates or point them at WattWise's
  // own page, so its mail is unbranded and lands on firebaseapp.com. The
  // callable generates the same code and sends our message instead.
  sendVerificationEmail: async () => {
    try {
      if (!auth.currentUser) {
        return { success: false, error: 'Not signed in.' };
      }

      const callable = httpsCallable(functions, 'sendVerificationEmail');
      const response = await callable();

      return {
        success: true,
        alreadyVerified: response?.data?.alreadyVerified === true,
      };
    } catch (error) {
      const code = typeof error?.code === 'string'
        ? error.code.replace('functions/', '')
        : error?.code;

      if (code === 'resource-exhausted') {
        return { success: false, error: error?.message || 'Wait a minute before trying again.' };
      }

      console.error('Send verification email error:', error);
      return { success: false, error: error?.details || error?.message };
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
        // Bounded, because this is the slow half of signing out and it must
        // never become the reason someone cannot sign out at all. A Firestore
        // write resolves when the server acknowledges it, so with no
        // connection this promise simply stays pending - and an unbounded
        // `await` here left the user tapping a button that did nothing.
        //
        // Losing the cleanup is the lesser harm: a stale token means the old
        // account may push to this phone until the next sign-in re-registers
        // it, whereas losing the sign-out strands the user in the account.
        // Offline the write cannot land anyway.
        await Promise.race([
          userService.removePushToken(userId, pushToken),
          new Promise((resolve) => setTimeout(resolve, PUSH_CLEANUP_TIMEOUT_MS)),
        ]);
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

      // One call, not two. The callable generates the reset code and sends the
      // branded email itself - Firebase's own mail cannot be edited on this
      // project and always links to its hosted page. It reports a missing
      // account the same way the old existence check did, so the separate
      // checkUserExistsByEmail round trip is no longer needed.
      const callable = httpsCallable(functions, 'sendPasswordResetEmail');
      await callable({ email: normalizedEmail });

      return { success: true };
    } catch (error) {
      const rawCode = typeof error?.code === 'string'
        ? error.code.replace('functions/', '')
        : error?.code;

      // Presented as the Firebase code both clients already handle. The
      // callable reports a missing account as `not-found`, which every existing
      // error map would have fallen through to a generic message.
      const code = rawCode === 'not-found' ? 'auth/user-not-found' : rawCode;

      if (!isExpectedAuthError(code) && code !== 'resource-exhausted') {
        console.error('Password reset error:', error);
      }

      return {
        success: false,
        error: error?.details || error?.message || 'Failed to send reset email',
        code,
      };
    }
  },

  /**
   * Permanently deletes the signed-in account and everything stored under it.
   *
   * Two gates, and they check different things. The password is proof that the
   * person holding the phone is the account owner rather than someone who
   * picked up an unlocked screen - Firebase requires a recent sign-in to delete
   * an account at all, so this is not an extra hoop, it is the one Firebase
   * already insists on, asked for plainly instead of as a surprise error. The
   * typed email is proof of intent: it cannot be produced by a mis-tap.
   *
   * The data is deleted server-side. Doing it here would mean a phone that
   * loses signal partway through leaves measurements owned by a UID that can no
   * longer sign in to remove them.
   */
  deleteAccount: async (password) => {
    try {
      const user = auth.currentUser;

      if (!user) {
        return { success: false, error: 'No signed-in account', code: 'auth/no-current-user' };
      }

      const email = String(user.email || '').trim();
      if (!email) {
        return {
          success: false,
          error: 'This account has no email address',
          code: 'auth/no-email',
        };
      }

      if (!password) {
        return {
          success: false,
          error: 'Enter your password to confirm',
          code: 'auth/missing-password',
        };
      }

      // Fails with auth/wrong-password on a bad password, which the caller maps
      // to a message rather than treating as a delete failure.
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(email, password)
      );

      const callable = httpsCallable(functions, 'deleteAccount');
      const result = await callable({ confirmEmail: email });

      if (!result?.data?.success) {
        throw new Error(result?.data?.error || 'Failed to delete the account');
      }

      // The Auth user is already gone, so this only clears local session state.
      // Failing here must not be reported as a failed deletion.
      try {
        await signOut(auth);
      } catch {
        // Already signed out by the deletion; nothing to do.
      }

      return {
        success: true,
        deletedCollections: result.data.deletedCollections || [],
        releasedDeviceId: result.data.releasedDeviceId || null,
      };
    } catch (error) {
      const code = typeof error?.code === 'string'
        ? error.code.replace('functions/', '')
        : error?.code;

      return {
        success: false,
        error: error?.details || error?.message || 'Failed to delete the account',
        code,
      };
    }
  },

  // Get current user
  getCurrentUser: () => {
    return auth.currentUser;
  }
};