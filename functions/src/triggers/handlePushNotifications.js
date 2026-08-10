const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { sendPushNotifications } = require('../lib/pushSender');

/**
 * Mirrors the precedence in `userService.getUserPreferences` on the client: a
 * legacy top-level `notificationsEnabled` wins, then the newer
 * `preferences.notificationsEnabled`, then default-on. Keeping these in step is
 * what makes the Settings toggle actually silence push.
 */
const arePushNotificationsEnabled = (profile) => {
  if (typeof profile?.notificationsEnabled === 'boolean') {
    return profile.notificationsEnabled;
  }

  const preference = profile?.preferences?.notificationsEnabled;
  return typeof preference === 'boolean' ? preference : true;
};

/**
 * Fans a freshly written notification document out to the user's devices.
 *
 * This hangs off the notification document rather than off each alert source,
 * so every existing writer (`handleSafetyAlerts`, `handleBudgetAlerts`,
 * `updateOutletMetrics`) gets push for free and future ones do too - the same
 * write-a-document-and-let-a-trigger-deliver-it shape the `mail` collection
 * uses for email.
 */
const handlePushNotifications = async (event) => {
  const userId = event.params?.userId;
  const notificationId = event.params?.notificationId;
  const notification = event.data?.data();

  if (!userId || !notification) return null;

  const db = admin.firestore();
  const userRef = db.doc(`users/${userId}`);

  try {
    const profile = (await userRef.get()).data() || {};

    if (!arePushNotificationsEnabled(profile)) {
      logger.info('Push skipped: notifications disabled', { userId });
      return null;
    }

    const tokens = profile.pushTokens;
    if (!Array.isArray(tokens) || !tokens.length) return null;

    const result = await sendPushNotifications({
      tokens,
      title: notification.title,
      body: notification.message,
      // Consumed by the tap handler on the client to deep-link the user to the
      // right screen. Firestore values may be undefined; Expo rejects those.
      data: {
        notificationId: notificationId || null,
        type: notification.type || null,
        outlet: notification.outlet || null,
      },
    });

    // A token that reports DeviceNotRegistered is dead for good, so drop it
    // instead of retrying it on every future alert.
    if (result.invalidTokens.length) {
      await userRef.update({
        pushTokens: admin.firestore.FieldValue.arrayRemove(...result.invalidTokens),
      });
      logger.info('Pruned expired push tokens', {
        userId,
        count: result.invalidTokens.length,
      });
    }

    logger.info('Push notification dispatched', {
      userId,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error) {
    // Best-effort: the in-app notification and its email have already landed,
    // so a push failure must not surface as a trigger error.
    logger.error('Failed to dispatch push notification', {
      userId,
      message: error?.message,
    });
  }

  return null;
};

module.exports = { handlePushNotifications, arePushNotificationsEnabled };
