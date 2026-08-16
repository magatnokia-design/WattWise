const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');

/**
 * Deletes a user's account and everything stored under it.
 *
 * WHY THIS IS A CALLABLE AND NOT A CLIENT DELETE
 *
 * The client can delete its own Auth user, but it cannot delete the data: the
 * Firestore rules let a signed-in user write their own documents one at a time,
 * and a phone that loses signal halfway through leaves an account that is gone
 * from Auth with its measurements still sitting in the database, owned by a UID
 * that can never sign in again to remove them. Doing it server-side makes the
 * whole thing one call that either happened or did not.
 *
 * ORDER MATTERS
 *
 * Data first, Auth user last. If the Auth delete fails, the user can still sign
 * in and try again. Reversed, a failure would strand the data: the rules are
 * scoped to the owner's UID, and there would no longer be an account able to
 * present it.
 *
 * THE DEVICE IS RELEASED, NOT DELETED
 *
 * `devices/{deviceId}` is the pairing record for a physical unit that still
 * exists on someone's wall. Deleting it would leave hardware that cannot be
 * re-paired without being reflashed, so ownership is cleared instead and the
 * unit becomes available to link to another account.
 */

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

async function deleteAccount(request) {
  try {
    const { auth, data } = request || {};

    if (!auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const uid = auth.uid;
    const accountEmail = normalizeEmail(auth.token?.email);
    const confirmEmail = normalizeEmail(data?.confirmEmail);

    // The client asks the user to type their own email before enabling the
    // button. Checking it again here is not redundant: it means no caller can
    // delete an account by calling this directly, and it makes the confirmation
    // part of the contract rather than a UI courtesy.
    if (!accountEmail) {
      throw new HttpsError(
        'failed-precondition',
        'This account has no email address to confirm against'
      );
    }

    if (confirmEmail !== accountEmail) {
      throw new HttpsError(
        'failed-precondition',
        'The email you typed does not match this account'
      );
    }

    const db = admin.firestore();
    const userRef = db.doc(`users/${uid}`);

    // Enumerated rather than hard-coded so a collection added later is still
    // removed. A hard-coded list is exactly the kind of thing that silently
    // stops being complete.
    const subcollections = await userRef.listCollections();
    const collectionNames = subcollections.map((collection) => collection.id).sort();

    // Release any paired hardware before the user document goes, since that is
    // where the device id is recorded.
    const userSnapshot = await userRef.get();
    const userData = userSnapshot.exists ? (userSnapshot.data() || {}) : {};
    const deviceId = String(
      userData.deviceId || userData.device?.deviceId || userData.esp32?.deviceId || ''
    ).trim();

    let releasedDeviceId = null;
    if (deviceId) {
      const deviceRef = db.doc(`devices/${deviceId}`);
      const deviceSnapshot = await deviceRef.get();

      // Only release a device this account actually owns. A stale id left on the
      // user document must not detach someone else's unit.
      if (deviceSnapshot.exists && String((deviceSnapshot.data() || {}).userId || '') === uid) {
        await deviceRef.set({
          userId: admin.firestore.FieldValue.delete(),
          releasedAt: admin.firestore.FieldValue.serverTimestamp(),
          releasedReason: 'account_deleted',
        }, { merge: true });
        releasedDeviceId = deviceId;
      }
    }

    // Removes the user document and every subcollection beneath it.
    await db.recursiveDelete(userRef);

    await admin.auth().deleteUser(uid);

    logger.info('Account deleted', {
      userId: uid,
      collections: collectionNames,
      releasedDeviceId,
    });

    return {
      success: true,
      deletedCollections: collectionNames,
      releasedDeviceId,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      logger.warn('Account deletion rejected', {
        code: error.code,
        message: error.message,
      });
      throw error;
    }

    logger.error('Error deleting account:', {
      message: error?.message,
      stack: error?.stack,
    });

    throw new HttpsError('internal', 'Failed to delete the account. Please try again.');
  }
}

module.exports = { deleteAccount };
