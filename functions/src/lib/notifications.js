const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

// Types the notification UI knows how to render an icon and colour for - see
// src/screens/Notifications/utils/notificationHelpers.js. Anything else falls
// back to a generic bell, so an unknown type degrades rather than breaking, but
// keeping this list in step keeps the list readable.
const NOTIFICATION_TYPES = new Set([
  'high_usage',
  'warning',
  'cutoff',
  'budget',
  'schedule',
  'device',
  // A charge that has finished, reported by chargingState.js. Informational -
  // it never accompanies an action, unlike 'cutoff'.
  'charge',
  'receipt',
  'invoice',
]);

/**
 * Writes one notification document.
 *
 * Writing here is the whole delivery: `handlePushNotifications` picks the
 * document up and pushes it to the user's devices, and the in-app panel reads
 * the same collection. Callers never talk to Expo directly - the same shape the
 * `mail` collection has for email.
 *
 * Best-effort by design: a notification that fails to write must not fail the
 * alert, schedule, or billing job that produced it.
 */
const createNotification = async ({
  userId,
  type,
  title,
  message,
  outlet = null,
  metadata = {},
}) => {
  if (!userId || !title) {
    logger.info('Notification skipped: missing user or title', { userId, type });
    return { skipped: true };
  }

  if (!NOTIFICATION_TYPES.has(type)) {
    logger.warn('Notification written with an unrecognised type', { userId, type });
  }

  try {
    const doc = await admin.firestore()
      .collection(`users/${userId}/notifications`)
      .add({
        type: type || 'device',
        title,
        message: message || '',
        outlet,
        read: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        metadata: metadata || {},
      });

    return { success: true, id: doc.id };
  } catch (error) {
    logger.error('Failed to create notification', {
      userId,
      type,
      message: error?.message,
    });
    return { success: false };
  }
};

module.exports = { NOTIFICATION_TYPES, createNotification };
