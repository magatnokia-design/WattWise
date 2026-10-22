import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pickGoogleAccount,
  forgetGoogleAccount,
  GOOGLE_SIGN_IN_UNAVAILABLE,
} from '../src/services/auth/googleSignIn.js';

/*
 * The contract that keeps Expo Go usable: when the native Google module cannot
 * be loaded, "Continue with Google" reports GOOGLE_SIGN_IN_UNAVAILABLE instead
 * of throwing while the bundle loads. A top-level import would take down every
 * screen in Expo Go, including the sign-in screen.
 *
 * Under node the load fails for a different reason than in Expo Go (there is no
 * CommonJS `require` in an ES module here; in Expo Go the native lookup throws),
 * but both land in the same catch, and that catch is what this pins down.
 */

test('a missing native module reports unavailable rather than throwing on import', async () => {
  await assert.rejects(pickGoogleAccount(), (error) => {
    assert.equal(error.code, GOOGLE_SIGN_IN_UNAVAILABLE);
    return true;
  });
});

test('forgetting the Google account is a no-op when the module is missing', async () => {
  // Sign-out calls this after Firebase sign-out; it must never be the reason
  // signing out fails.
  await assert.doesNotReject(forgetGoogleAccount());
});
