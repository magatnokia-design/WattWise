const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { fetchPushReceipts } = require('../lib/pushSender');

// Expo needs a few minutes before a receipt exists, and keeps it for 24 hours.
const RECEIPT_READY_AFTER_MS = 5 * 60 * 1000;
const RECEIPT_GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_BATCHES_PER_RUN = 20;

/**
 * Scheduled function: reads the delivery outcome of pushes sent earlier.
 *
 * `handlePushNotifications` can only learn that Expo *accepted* a message. Two
 * pushes were logged as sent and never arrived, with nothing recording a
 * problem, because acceptance was being read as delivery. This is the other
 * half: it fetches the receipt, reports what actually happened, and prunes the
 * tokens that turn out to be dead.
 *
 * Runs on a schedule rather than inside the trigger because a receipt is not
 * available for several minutes - far longer than a Firestore trigger should
 * ever sit waiting.
 *
 * A ticket Expo has not answered yet is left alone and retried on the next run.
 * Absence means "no answer", never "delivered", so discarding one would put the
 * blind spot straight back.
 */
async function checkPushReceipts() {
  const db = admin.firestore();
  const now = Date.now();

  const pendingBatches = await db
    .collection('push_tickets')
    .where('createdAtMs', '<=', now - RECEIPT_READY_AFTER_MS)
    .orderBy('createdAtMs')
    .limit(MAX_BATCHES_PER_RUN)
    .get();

  if (pendingBatches.empty) return { success: true, checked: 0 };

  let delivered = 0;
  let failed = 0;
  let pruned = 0;

  for (const doc of pendingBatches.docs) {
    const data = doc.data() || {};
    const ticketTokens = data.ticketTokens && typeof data.ticketTokens === 'object'
      ? data.ticketTokens
      : {};
    const ticketIds = Object.keys(ticketTokens);

    // Expo has stopped keeping these, so no answer is ever coming.
    if (!ticketIds.length || now - Number(data.createdAtMs || 0) > RECEIPT_GIVE_UP_AFTER_MS) {
      await doc.ref.delete();
      continue;
    }

    const result = await fetchPushReceipts({ ticketIds });

    delivered += result.delivered.length;

    const failures = Object.entries(result.failedIds);
    failed += failures.length;

    if (failures.length) {
      // Logged individually: the error names the cause, and these are the only
      // record that a promised alert did not arrive. `MismatchSenderId` or a
      // credential error here means every push is failing, not just this one.
      failures.forEach(([ticketId, error]) => {
        logger.error('Push was accepted but not delivered', {
          userId: data.userId,
          error,
          token: ticketTokens[ticketId],
        });
      });

      // Only DeviceNotRegistered is permanent. A credential problem is ours to
      // fix, and removing a working token because of it would be destructive.
      const deadTokens = [...new Set(failures
        .filter(([, error]) => error === 'DeviceNotRegistered')
        .map(([ticketId]) => ticketTokens[ticketId])
        .filter(Boolean))];

      if (deadTokens.length && data.userId) {
        await db.doc(`users/${data.userId}`).update({
          pushTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens),
        }).catch((error) => {
          logger.warn('Could not prune dead push tokens', {
            userId: data.userId,
            message: error?.message,
          });
        });
        pruned += deadTokens.length;
      }
    }

    // Keep only what is still unanswered, so the next run asks about less.
    if (result.pending.length) {
      const remaining = {};
      result.pending.forEach((id) => {
        if (ticketTokens[id]) remaining[id] = ticketTokens[id];
      });

      await doc.ref.update({
        ticketTokens: remaining,
        attempts: Number(data.attempts || 0) + 1,
        lastCheckedAtMs: now,
      });
    } else {
      await doc.ref.delete();
    }
  }

  logger.info('Push receipts checked', {
    batches: pendingBatches.size,
    delivered,
    failed,
    pruned,
  });

  return { success: true, checked: pendingBatches.size, delivered, failed, pruned };
}

module.exports = { checkPushReceipts, RECEIPT_READY_AFTER_MS, RECEIPT_GIVE_UP_AFTER_MS };
