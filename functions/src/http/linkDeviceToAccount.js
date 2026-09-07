const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { recordSecurityEvent, EVENT_TYPES } = require('../lib/securityEvents');

const MAX_FIELD_LENGTH = 128;
const MIN_TOKEN_LENGTH = 8;

const clean = (value) => String(value ?? '').trim().slice(0, MAX_FIELD_LENGTH);

/**
 * What is written to the account a device is taken away from.
 *
 * Every field in `DEVICE_LOOKUP_FIELDS` must be nulled here. That list is what
 * `resolveUserByDeviceId` searches when `devices/{deviceId}` is missing, and it
 * throws `409 Ambiguous device assignment` the moment two user documents answer
 * to the same deviceId. A detach that misses one field arms that failure and
 * leaves no trace until something else deletes the device document - at which
 * point the Hub stops authenticating and no amount of re-pairing fixes it,
 * because re-pairing does not touch the accounts that were never cleared.
 *
 * This previously merged `{ active: false, unlinkedAt }` into `device`, which
 * left `device.deviceId` in place: a merge writes the keys it is given and
 * leaves the rest of the map alone. The flat `deviceId` was cleared and the
 * nested one was not, so every past owner stayed matchable. It also kept
 * `esp32Linked` true in Settings, which is the same bug seen from the app.
 *
 * `active: false` and `unlinkedAt` stay, because the account should be able to
 * show that a Hub left it rather than that one was never there.
 */
const buildDetachedOwnerFields = (unlinkedAt) => ({
  deviceId: null,
  deviceToken: null,
  previousDeviceToken: null,
  previousDeviceTokenValidUntilMs: null,
  device: {
    deviceId: null,
    token: null,
    previousToken: null,
    previousTokenValidUntilMs: null,
    active: false,
    unlinkedAt,
  },
  // Legacy shape. Nulled even on accounts that never had it, so the rule stays
  // "every lookup field is cleared" rather than "every lookup field we expect
  // to be set is cleared" - the second is the one that rots.
  esp32: { deviceId: null },
});

/**
 * Binds an ESP32 to the calling account, including taking it over from another
 * account.
 *
 * Security rules only let a client write `devices/{deviceId}` it already owns,
 * so a second account scanning the same unit is rejected client-side. Transfers
 * therefore have to happen here, with admin privileges.
 *
 * Possession of the device token is the proof of ownership: it is what
 * deviceSecurity.js already trusts on every hardware request, and it is what
 * the printed pairing label carries. A caller presenting the correct token for
 * an existing device is treated as its rightful owner.
 */
async function linkDeviceToAccount(request) {
  try {
    const { auth, data } = request || {};

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const deviceId = clean(data?.deviceId);
    const deviceToken = clean(data?.deviceToken || data?.token);

    if (!deviceId) {
      throw new HttpsError('invalid-argument', 'deviceId is required');
    }

    if (!deviceToken || deviceToken.length < MIN_TOKEN_LENGTH) {
      throw new HttpsError('invalid-argument', 'A device token of at least 8 characters is required');
    }

    const db = admin.firestore();
    const userId = auth.uid;
    const deviceRef = db.doc(`devices/${deviceId}`);
    const userRef = db.doc(`users/${userId}`);

    const outcome = await db.runTransaction(async (tx) => {
      const [deviceDoc, userDoc] = await Promise.all([tx.get(deviceRef), tx.get(userRef)]);

      const existing = deviceDoc.exists ? (deviceDoc.data() || {}) : null;
      const previousOwnerId = existing?.userId || null;
      const isTransfer = !!previousOwnerId && previousOwnerId !== userId;

      if (isTransfer) {
        // Only the holder of the current token may take the device over.
        const storedToken = clean(existing.deviceToken);
        if (storedToken && storedToken !== deviceToken) {
          throw new HttpsError(
            'permission-denied',
            'This device is linked to another account and the token does not match.'
          );
        }
      }

      const nowMs = Date.now();

      tx.set(deviceRef, {
        userId,
        deviceId,
        deviceToken,
        active: true,
        health: {
          status: 'online',
          statusReason: isTransfer ? 'transferred' : 'linked',
          linkedAtMs: nowMs,
          updatedAtMs: nowMs,
        },
        transferredFromUserId: isTransfer ? previousOwnerId : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      tx.set(userRef, {
        uid: userId,
        deviceId,
        deviceToken,
        device: {
          deviceId,
          token: deviceToken,
          linkedAt: userDoc.exists && userDoc.data()?.device?.linkedAt
            ? userDoc.data().device.linkedAt
            : admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          active: true,
        },
      }, { merge: true });

      return { isTransfer, previousOwnerId };
    });

    // Detach the device from the previous owner so two accounts never claim it.
    // Outside the transaction: a different user document is not read above, and
    // a stale pointer there is recoverable while a failed link is not.
    if (outcome.isTransfer && outcome.previousOwnerId) {
      try {
        await db.doc(`users/${outcome.previousOwnerId}`).set(
          buildDetachedOwnerFields(admin.firestore.FieldValue.serverTimestamp()),
          { merge: true }
        );

        // The losing side gets the entry that matters most: their Hub left the
        // account and they did not do it. Deliberately no mention of who took
        // it - a user's security log is not a place to learn another user's id.
        await recordSecurityEvent(outcome.previousOwnerId, EVENT_TYPES.DEVICE_UNLINKED, {
          deviceId,
          reason: 'claimed by another account',
        });
      } catch (detachError) {
        logger.warn('Device linked but previous owner not detached', {
          deviceId,
          previousOwnerId: outcome.previousOwnerId,
          message: detachError?.message,
        });
      }
    }

    await recordSecurityEvent(
      userId,
      outcome.isTransfer ? EVENT_TYPES.DEVICE_TRANSFERRED : EVENT_TYPES.DEVICE_LINKED,
      { deviceId }
    );

    logger.info('Device linked to account', {
      userId,
      deviceId,
      transferred: outcome.isTransfer,
    });

    return { success: true, deviceId, transferred: outcome.isTransfer };
  } catch (error) {
    if (error instanceof HttpsError) {
      logger.warn('Device link rejected', { code: error.code, message: error.message });
      throw error;
    }

    logger.error('Error linking device:', { message: error?.message, stack: error?.stack });
    throw new HttpsError('internal', error?.message || 'Failed to link device');
  }
}

module.exports = { linkDeviceToAccount, buildDetachedOwnerFields };
