const logger = require('firebase-functions/logger');
const { resolveUserContact, enqueueEmail } = require('../lib/mailQueue');
const { createNotification } = require('../lib/notifications');

const NOTIFIABLE_STATUSES = new Set(['failed', 'rejected', 'timeout']);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

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

    // A toggle that never reached the ESP32 is the one failure the user most
    // needs to know about immediately - they think the outlet switched and it
    // did not. Push first, then fall through to the email.
    await createNotification({
      userId,
      type: 'device',
      title: 'Outlet command failed',
      message: `The ${String(after.action || 'toggle').trim()} command for ${outletId || 'your outlet'} reported "${status}".`,
      outlet: Number.isNaN(outletNumber) ? null : outletNumber,
      metadata: {
        commandId,
        status,
        action: String(after.action || '').trim(),
        reason: String(after.reason || '').trim(),
      },
    });

    const contact = await resolveUserContact(userId);
    if (!contact?.email) {
      logger.info('Device email skipped: missing recipient', { userId, commandId });
      return null;
    }

    await enqueueEmail({
      toEmail: contact.email,
      subject: `WattWise: outlet command ${status}`,
      heading: 'Outlet command did not complete',
      intro: `A command sent to ${outletId || 'your outlet'} reported status "${status}".`,
      rows: [
        ['Outlet', outletId],
        ['Action', String(after.action || '').trim()],
        ['Status', status],
        ['Reason', String(after.reason || '').trim()],
        ['Source', String(after.source || '').trim()],
        ['Device', String(after.deviceId || '').trim()],
        ['Command ID', commandId],
      ],
      note:
        'The outlet did not change state. Check the ESP32 has power and wi-fi, then try again - '
        + 'the app shows a live device status in Settings. Nothing was switched, so the outlet is '
        + 'still in whatever state it was already in.',
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

module.exports = { handleDeviceCommandEmails };
