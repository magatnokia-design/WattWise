/**
 * Native "Continue with Google" for the phone app.
 *
 * Google's account picker hands back an ID token; Firebase turns that into a
 * session with GoogleAuthProvider.credential + signInWithCredential (done in
 * authService). This module only talks to Google.
 *
 * Loaded lazily, on purpose. @react-native-google-signin is a native module, and
 * Expo Go does not contain it: a top-level import throws while the bundle loads,
 * which would take down every screen in Expo Go - including the sign-in screen
 * used to test everything else. Loaded on tap, a missing module becomes one
 * "needs the installed app" message instead.
 *
 * Android signs in through an OAuth client registered in Firebase against
 * package com.magat_nokia.WattWise and the release keystore's SHA-1
 * (4A:9E:BA:EB:...:9B:03:6F:F6, read from the v1.1.32 APK on 22 Oct 2026). A
 * build signed with any other key fails with DEVELOPER_ERROR (code 10) - that
 * is a fingerprint missing from Firebase, not a bug in this file.
 */

// The project's *web* OAuth client (client_type 3 in google-services.json).
// Google issues the ID token for this audience, which is the one Firebase Auth
// verifies against - the Android client only proves the app's identity. A
// public identifier, like the Firebase API key.
const GOOGLE_WEB_CLIENT_ID =
  '421489842338-c30e362j45re82uh89313j66d8bth8cr.apps.googleusercontent.com';

let cached = null;

const loadModule = () => {
  if (cached) return cached;
  try {
    // eslint-disable-next-line global-require
    const mod = require('@react-native-google-signin/google-signin');
    mod.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    cached = mod;
    return mod;
  } catch {
    return null;
  }
};

export const GOOGLE_SIGN_IN_UNAVAILABLE = 'google/unavailable';
export const GOOGLE_SIGN_IN_CANCELLED = 'google/cancelled';
export const GOOGLE_SIGN_IN_IN_PROGRESS = 'google/in-progress';
export const GOOGLE_PLAY_SERVICES_MISSING = 'google/play-services';
// Android CommonStatusCodes.DEVELOPER_ERROR, reported as the string "10": this
// build's signing key or package is not registered in Firebase.
export const GOOGLE_NOT_CONFIGURED = 'google/not-configured';

// The module's status codes are runtime constants read from the native side,
// so they are mapped here, where the module is already loaded, rather than
// compared by callers that should not have to load it.
const normalizeCode = (mod, error) => {
  const { statusCodes } = mod;
  switch (error?.code) {
    case statusCodes.SIGN_IN_CANCELLED: return GOOGLE_SIGN_IN_CANCELLED;
    case statusCodes.IN_PROGRESS: return GOOGLE_SIGN_IN_IN_PROGRESS;
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE: return GOOGLE_PLAY_SERVICES_MISSING;
    case '10': return GOOGLE_NOT_CONFIGURED;
    default: return error?.code;
  }
};

/**
 * Opens Google's account picker. Resolves to { idToken } or rejects with an
 * Error whose `code` is one of the constants above, a Google status code, or
 * the raw error's own code.
 */
export const pickGoogleAccount = async () => {
  const mod = loadModule();
  if (!mod) {
    const error = new Error('Google sign-in is not available in this build.');
    error.code = GOOGLE_SIGN_IN_UNAVAILABLE;
    throw error;
  }

  const { GoogleSignin, isSuccessResponse } = mod;

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      const error = new Error('Sign-in was cancelled.');
      error.code = GOOGLE_SIGN_IN_CANCELLED;
      throw error;
    }

    const idToken = response.data?.idToken;
    if (!idToken) {
      // Happens when webClientId is wrong: Google signs the user in but issues
      // no token for an audience it does not recognise.
      throw new Error('Google did not return an ID token.');
    }
    return { idToken };
  } catch (error) {
    if (error && typeof error === 'object') error.code = normalizeCode(mod, error);
    throw error;
  }
};

/**
 * Forgets which Google account was picked, so the next "Continue with Google"
 * shows the chooser again instead of silently reusing the last account - on a
 * shared phone that would sign the next person into the previous one's home.
 * Best-effort: signing out of Firebase is what actually ends the session.
 */
export const forgetGoogleAccount = async () => {
  const mod = loadModule();
  if (!mod) return;
  try {
    await mod.GoogleSignin.signOut();
  } catch {
    // Nothing to forget, or Play Services unavailable; neither blocks sign-out.
  }
};
