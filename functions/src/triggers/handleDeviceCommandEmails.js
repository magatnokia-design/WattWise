const logger = require('firebase-functions/logger');
const { getTemplateId, resolveUserContact, sendBrevoTemplateEmail } = require('../lib/brevoEmail');

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

    await sendBrevoTemplateEmail({
      toEmail: contact.email,
      toName: contact.name,
      templateId: getTemplateId('device'),
      params: {
        commandId,
        status,
        action: String(after.action || '').trim(),
        outletId: String(after.outletId || '').trim(),
        reason: String(after.reason || '').trim(),
        source: String(after.source || '').trim(),
        deviceId: String(after.deviceId || '').trim(),
      },
      tags: ['device'],
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
