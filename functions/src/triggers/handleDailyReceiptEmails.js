const logger = require('firebase-functions/logger');
const { getTemplateId, resolveUserContact, sendBrevoTemplateEmail } = require('../lib/brevoEmail');

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function handleDailyReceiptEmails(change, context) {
  try {
    const { userId, date } = context.params;
    const after = change.after.exists ? change.after.data() : null;

    if (!after || change.before.exists) {
      return null;
    }

    const contact = await resolveUserContact(userId);
    if (!contact?.email) {
      logger.info('Receipt email skipped: missing recipient', { userId, date });
      return null;
    }

    const totalEnergy = toNumber(after.totalEnergy);
    const cost = toNumber(after.cost);
    const outlet1Energy = toNumber(after.outlet1Energy);
    const outlet2Energy = toNumber(after.outlet2Energy);
    const peakPower = toNumber(after.peakPower);
    const peakHour = toNumber(after.peakHour, 0);

    await sendBrevoTemplateEmail({
      toEmail: contact.email,
      toName: contact.name,
      templateId: getTemplateId('receipt'),
      params: {
        date: String(after.date || date || '').trim(),
        outlet1Name: String(after.outlet1Name || 'Outlet 1').trim(),
        outlet2Name: String(after.outlet2Name || 'Outlet 2').trim(),
        outlet1Energy: Number(outlet1Energy.toFixed(3)),
        outlet2Energy: Number(outlet2Energy.toFixed(3)),
        totalEnergy: Number(totalEnergy.toFixed(3)),
        cost: Number(cost.toFixed(2)),
        peakPower: Number(peakPower.toFixed(2)),
        peakHour,
        currency: 'PHP',
      },
      tags: ['receipt'],
    });

    return null;
  } catch (error) {
    logger.error('Error sending daily receipt email', {
      message: error?.message,
      stack: error?.stack,
    });
    return null;
  }
}

module.exports = { handleDailyReceiptEmails };
