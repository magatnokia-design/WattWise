const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

/**
 * The power figure written onto a switch event in `history_logs`.
 *
 * The rule is one line long and was wrong in all three places that wrote it, so
 * it lives here instead: **only a switch-off carries a wattage.**
 *
 * A switch-off records the draw measured just before the relay opened, which is
 * the useful figure - "it was pulling 61 W when I killed it". A switch-on has
 * nothing to measure. The outlet was off, and whatever load is about to be
 * connected has not drawn anything yet; the reading only develops over the
 * seconds *after* the log row is written.
 *
 * What made this a correctness bug rather than a cosmetic one is what
 * `outletData.power` actually holds at that moment. It is the last telemetry the
 * device posted, and after a switch-off the device has not yet posted a zero -
 * so it still contains the reading from *before* that switch-off. Logging it on
 * the next switch-on credited the new event with the previous session's wattage.
 * A lamp switched off at 15.2 W and back on seconds later recorded 14.9 W
 * against the switch-on: a measurement of an outlet that was drawing nothing.
 *
 * On the History screen that showed up as a POWER column where some ON rows had
 * a figure and others did not, with no rule a user could infer - because the
 * value was decided by whether telemetry happened to land between the two
 * toggles, which is a race, not a property of the outlet.
 *
 * Existing rows are left as they are. They record what the system believed at
 * the time, and rewriting history to make a column look tidier is a worse
 * failure than the untidy column.
 *
 * @param {boolean} turningOn True when the event switches the outlet on.
 * @param {object} outletData The outlet document as it stands before the switch.
 * @returns {number} Watts to record; always 0 for a switch-on.
 */
const resolveLogPower = (turningOn, outletData = {}) => {
  if (turningOn) return 0;

  const parsed = Number(outletData?.power);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Ack statuses that mean the switch in the log never actually happened, or at
 * least was never confirmed to have happened.
 */
const UNCONFIRMED_ACK_STATUS = new Set(['timeout', 'failed', 'rejected']);

/**
 * Marks a history row as a switch the hardware never confirmed.
 *
 * Every writer of `history_logs` records the switch at the moment it is
 * *requested* - before the ESP32 has seen it, because the device only learns
 * about a command when it next polls `getDeviceCommand`. That ordering is
 * deliberate (the log must survive the function instance freezing), but it left
 * the History screen unable to tell the two cases apart: a row saying "OFF"
 * looked identical whether the relay opened or the hub was off the network the
 * whole time. During a demo that is the worst possible failure mode - the screen
 * confidently states something the hardware never did.
 *
 * The link is a `historyLogId` carried in the command's own metadata, so the
 * command document knows which row to come back and correct. `update` rather
 * than `set(..., {merge: true})` on purpose: merge would *create* the row if the
 * id were ever wrong, inventing a switch event that never happened.
 *
 * Only ever writes the failing direction. A command that succeeds leaves no
 * mark, so an unannotated row keeps meaning what it always meant.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} args.historyLogId  Document id from the command's metadata.
 * @param {string} args.status        Normalized ack status (timeout/failed/rejected).
 * @param {string} [args.commandId]   Recorded so a row can be traced to its command.
 * @returns {Promise<boolean>} True when a row was annotated.
 */
const markHistoryLogUnconfirmed = async ({
  userId,
  historyLogId,
  status,
  commandId = null,
}) => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const logId = String(historyLogId || '').trim();

  if (!userId || !logId || !UNCONFIRMED_ACK_STATUS.has(normalizedStatus)) {
    return false;
  }

  try {
    await admin.firestore()
      .doc(`users/${userId}/history_logs/${logId}`)
      .update({
        delivery: {
          confirmed: false,
          status: normalizedStatus,
          commandId: commandId || null,
          markedAtMs: Date.now(),
        },
      });
    return true;
  } catch (error) {
    // A missing row is not worth failing the notification for - the user still
    // gets told the command failed, they just do not get the badge on the row.
    logger.warn('Could not mark history log unconfirmed', {
      userId,
      historyLogId: logId,
      status: normalizedStatus,
      message: error?.message,
    });
    return false;
  }
};

module.exports = {
  resolveLogPower,
  markHistoryLogUnconfirmed,
  UNCONFIRMED_ACK_STATUS,
};
