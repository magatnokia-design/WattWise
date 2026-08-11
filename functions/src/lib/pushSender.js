const logger = require('firebase-functions/logger');

// Expo's push service relays to FCM/APNs on our behalf, so this backend never
// holds FCM credentials directly - the only thing it needs is the ExpoPushToken
// the client registered. One request carries at most 100 messages.
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPT_ENDPOINT = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_MESSAGES_PER_REQUEST = 100;
const MAX_RECEIPT_IDS_PER_REQUEST = 300;

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
 * What comes back from Expo's send endpoint is a **ticket**, not a receipt. A
 * ticket only means Expo accepted the message for delivery; whether FCM or APNs
 * actually took it is reported later, in a receipt fetched separately by id.
 *
 * That distinction is not academic. Two pushes were logged here as `sent: 1`
 * and never reached the phone, with nothing anywhere recording a problem,
 * because a ticket was being treated as proof of delivery. `ticketIds` is
 * returned so `checkPushReceipts` can close that gap.
 *
 * `invalidTokens` still reports the failures Expo can see immediately -
 * `DeviceNotRegistered` for an uninstalled app. The ones only a receipt reveals
 * are pruned by the scheduled check instead.
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
    return { sent: 0, failed: 0, invalidTokens: [], ticketIds: {}, skipped: true };
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens = [];
  // Ticket id -> the token it was issued for, so a receipt that fails later can
  // be traced back to the device that should be pruned.
  const ticketIds = {};

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
      const tickets = Array.isArray(payload?.data) ? payload.data : [];

      // Tickets come back index-aligned with the messages we posted.
      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'ok') {
          sent += 1;
          // Accepted, not delivered. Keep the id so the receipt can be read.
          if (ticket.id) ticketIds[ticket.id] = batch[index];
          return;
        }

        failed += 1;
        if (ticket?.details?.error === 'DeviceNotRegistered') {
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

  return { sent, failed, invalidTokens, ticketIds, skipped: false };
};

/**
 * Reads the delivery outcome for previously issued tickets.
 *
 * This is where a push that Expo accepted but FCM refused finally becomes
 * visible. Common causes are a missing or rotated FCM credential, and an app
 * that has been uninstalled since the ticket was issued.
 *
 * Expo omits ids it has no answer for yet rather than reporting them as
 * failures, so an absent id means "ask again later", never "delivered". They
 * are returned as `pending` so the caller can retry instead of discarding them.
 *
 * Never throws, for the same reason as the sender.
 */
const fetchPushReceipts = async ({ ticketIds, fetchImpl = fetch }) => {
  const ids = [...new Set((Array.isArray(ticketIds) ? ticketIds : [])
    .filter((id) => typeof id === 'string' && id.trim()))];

  if (!ids.length) {
    return { delivered: [], failedIds: {}, pending: [], errored: false };
  }

  const delivered = [];
  const failedIds = {};
  const pending = [];
  let errored = false;

  for (let index = 0; index < ids.length; index += MAX_RECEIPT_IDS_PER_REQUEST) {
    const batch = ids.slice(index, index + MAX_RECEIPT_IDS_PER_REQUEST);

    try {
      const response = await fetchImpl(EXPO_RECEIPT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ ids: batch }),
      });

      if (!response.ok) {
        errored = true;
        pending.push(...batch);
        logger.warn('Expo receipt request rejected', {
          status: response.status,
          count: batch.length,
        });
        continue;
      }

      const payload = await response.json();
      const receipts = payload?.data && typeof payload.data === 'object' ? payload.data : {};

      batch.forEach((id) => {
        const receipt = receipts[id];

        // Not answered yet - Expo keeps receipts for 24h, so retry later.
        if (!receipt) {
          pending.push(id);
          return;
        }

        if (receipt.status === 'ok') {
          delivered.push(id);
          return;
        }

        failedIds[id] = receipt.details?.error || receipt.message || 'unknown';
      });
    } catch (error) {
      errored = true;
      pending.push(...batch);
      logger.error('Expo receipt request failed', {
        message: error?.message,
        count: batch.length,
      });
    }
  }

  return { delivered, failedIds, pending, errored };
};

module.exports = {
  EXPO_PUSH_ENDPOINT,
  EXPO_RECEIPT_ENDPOINT,
  isExpoPushToken,
  normalizeTokens,
  chunkTokens,
  buildMessage,
  sendPushNotifications,
  fetchPushReceipts,
};
