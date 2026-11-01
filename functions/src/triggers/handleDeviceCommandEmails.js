const logger = require('firebase-functions/logger');
const { resolveUserContact, enqueueEmail } = require('../lib/mailQueue');
const { createNotification } = require('../lib/notifications');
const { markHistoryLogUnconfirmed } = require('../lib/historyLog');

const NOTIFIABLE_STATUSES = new Set(['failed', 'rejected', 'timeout']);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

/**
 * What a failed switch says to the user (Nov 2026: plain words, on request).
 *
 * The old alert printed the machinery - status "timeout", reason
 * "manual_toggle", source, device and command id - and left the reader to work
 * out what it meant. A timeout almost always means the Hub is offline
 * (unplugged or off Wi-Fi), so it says that. failed/rejected mean the Hub
 * answered and could not do it, which is a different instruction.
 */
const describeFailure = ({ status, action, outletNumber }) => {
  const outlet = Number.isInteger(outletNumber) ? `Outlet ${outletNumber}` : 'Your outlet';
  const verb = action === 'off' ? 'turn off' : action === 'on' ? 'turn on' : 'switch';
  const title = `${outlet} didn't ${verb}`;

  if (status === 'timeout') {
    return {
      title,
      message: 'The Hub may be offline. Check that it is plugged in and on Wi-Fi, then try again.',
    };
  }
  return {
    title,
    message: 'The Hub could not do it. Try again, and check the Hub if it keeps happening.',
  };
};

async function handleDeviceCommandEmails(event) {
  // See the note in handleDailyReceiptEmails: v2 passes one event, not
  // (change, context). This threw on `context.params` every time, which is why
  // a failed outlet command never produced the email it promises.
  const change = event.data;
  const context = { params: event.params || {} };

  try {
    const { userId, commandId } = context.params;
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;

    if (!after) {
      return null;
    }

    const delivery = after.delivery || {};
    const status = normalizeStatus(
      delivery.lastAckStatus || after.acknowledgment?.status || delivery.status
    );
    const previousStatus = normalizeStatus(
      before?.delivery?.lastAckStatus || before?.acknowledgment?.status || before?.delivery?.status
    );

    if (!NOTIFIABLE_STATUSES.has(status) || status === previousStatus) {
      return null;
    }

    const outletId = String(after.outletId || '').trim();
    const outletNumber = parseInt(outletId.replace('outlet', ''), 10);

    // The History row was written when the switch was *requested*, so it
    // currently reads as though it happened. Correct it before anything else:
    // the notification below points the user straight at that screen, and the
    // row it lands on has to already agree with the notification.
    await markHistoryLogUnconfirmed({
      userId,
      historyLogId: after.metadata?.historyLogId,
      status,
      commandId,
    });

    // A toggle that never reached the ESP32 is the one failure the user most
    // needs to know about immediately - they think the outlet switched and it
    // did not. Push first, then fall through to the email.
    const action = String(after.action || '').trim().toLowerCase();
    const copy = describeFailure({ status, action, outletNumber });

    // The details sit in a nested object on purpose: both clients' notification
    // detail lists skip objects, so they stay on record without being printed
    // under the alert as "Reason  manual_toggle".
    await createNotification({
      userId,
      type: 'device',
      title: copy.title,
      message: copy.message,
      outlet: Number.isNaN(outletNumber) ? null : outletNumber,
      metadata: {
        commandId,
        command: { status, action, reason: String(after.reason || '').trim() },
      },
    });

    const contact = await resolveUserContact(userId);
    if (!contact?.email) {
      logger.info('Device email skipped: missing recipient', { userId, commandId });
      return null;
    }

    await enqueueEmail({
      toEmail: contact.email,
      subject: `Dagitab: ${copy.title}`,
      heading: copy.title,
      intro: copy.message,
      rows: [],
      note: 'Nothing was switched, so the outlet is still the way it was.',
      tag: 'device',
    });

    return null;
  } catch (error) {
    logger.error('Error sending device command email', {
      message: error?.message,
      stack: error?.stack,
    });
    return null;
  }
}

module.exports = { handleDeviceCommandEmails, describeFailure };
