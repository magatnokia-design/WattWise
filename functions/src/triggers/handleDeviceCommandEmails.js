const logger = require('firebase-functions/logger');
const { resolveUserContact, enqueueEmail } = require('../lib/mailQueue');

const NOTIFIABLE_STATUSES = new Set(['failed', 'rejected', 'timeout']);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

async function handleDeviceCommandEmails(change, context) {
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

    const contact = await resolveUserContact(userId);
    if (!contact?.email) {
      logger.info('Device email skipped: missing recipient', { userId, commandId });
      return null;
    }

    const outletId = String(after.outletId || '').trim();

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
