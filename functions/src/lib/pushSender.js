const logger = require('firebase-functions/logger');

// Expo's push service relays to FCM/APNs on our behalf, so this backend never
// holds FCM credentials directly - the only thing it needs is the ExpoPushToken
// the client registered. One request carries at most 100 messages.
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const MAX_MESSAGES_PER_REQUEST = 100;

// Tokens look like `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`. Anything else is
// either a stale FCM token from an older build or junk, and Expo rejects the
// whole request if one bad entry is included - so they're filtered up front.
const EXPO_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

const isExpoPushToken = (value) => typeof value === 'string' &&
  EXPO_TOKEN_PATTERN.test(value.trim());

/**
 * Drops malformed and duplicate tokens. A user with the app on two devices has
 * two tokens; a user who reinstalled may have the same token twice.
 */
const normalizeTokens = (tokens) => {
  const seen = new Set();

  (Array.isArray(tokens) ? tokens : []).forEach((token) => {
    if (!isExpoPushToken(token)) return;
    seen.add(token.trim());
  });

  return [...seen];
};

const chunkTokens = (tokens, size = MAX_MESSAGES_PER_REQUEST) => {
  const chunks = [];
  for (let index = 0; index < tokens.length; index += size) {
    chunks.push(tokens.slice(index, index + size));
  }
  return chunks;
};

const buildMessage = ({ token, title, body, data }) => ({
  to: token,
  title: String(title || 'WattWise'),
  body: String(body || ''),
  sound: 'default',
  // Safety cutoffs and budget breaches are time-sensitive, so they should wake
  // the device rather than wait for the next maintenance window.
  priority: 'high',
  channelId: 'default',
  ...(data && Object.keys(data).length ? { data } : {}),
});

/**
 * Sends one notification to every supplied token.
 *
 * Returns `invalidTokens` so the caller can prune them - Expo reports
 * `DeviceNotRegistered` once an app is uninstalled or the token is rotated, and
 * a token that returns it will never work again.
 *
 * Never throws: a failed push must not roll back the notification document that
 * triggered it.
 */
const sendPushNotifications = async ({
  tokens,
  title,
  body,
  data,
  fetchImpl = fetch,
}) => {
  const recipients = normalizeTokens(tokens);
  if (!recipients.length) {
    return { sent: 0, failed: 0, invalidTokens: [], skipped: true };
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens = [];

  for (const batch of chunkTokens(recipients)) {
    const messages = batch.map((token) => buildMessage({ token, title, body, data }));

    try {
      const response = await fetchImpl(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        failed += batch.length;
        logger.warn('Expo push request rejected', {
          status: response.status,
          count: batch.length,
        });
        continue;
      }

      const payload = await response.json();
      const receipts = Array.isArray(payload?.data) ? payload.data : [];

      // Receipts come back index-aligned with the messages we posted.
      receipts.forEach((receipt, index) => {
        if (receipt?.status === 'ok') {
          sent += 1;
          return;
        }

        failed += 1;
        if (receipt?.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(batch[index]);
        }
      });
    } catch (error) {
      failed += batch.length;
      logger.error('Expo push request failed', {
        message: error?.message,
        count: batch.length,
      });
    }
  }

  return { sent, failed, invalidTokens, skipped: false };
};

module.exports = {
  EXPO_PUSH_ENDPOINT,
  isExpoPushToken,
  normalizeTokens,
  chunkTokens,
  buildMessage,
  sendPushNotifications,
};
