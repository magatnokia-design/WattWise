const logger = require('firebase-functions/logger');
const { getTemplateId, resolveUserContact, sendBrevoTemplateEmail } = require('../lib/brevoEmail');

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatCurrency = (value) => {
  return Number(toNumber(value).toFixed(2));
};

const formatLine = (label, amount) => {
  return `${label}: ${formatCurrency(amount).toFixed(2)}`;
};

const formatLineItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .map((item) => formatLine(item.label || item.key || 'Charge', item.amount))
    .join('\n');
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
    const bill = after.bill || {};
    const billTotals = bill.totals || {};
    const billItems = bill.items || {};
    const billTotal = toNumber(billTotals.total, cost);
    const billEffectiveRate = toNumber(bill.effectiveRate, totalEnergy ? (billTotal / totalEnergy) : 0);
    const billSectionTotals = [
      formatLine('Generation & Transmission', billTotals.generationTransmission),
      formatLine('Distribution', billTotals.distribution),
      formatLine('Government Charges', billTotals.government),
      formatLine('Other Charges', billTotals.other),
    ].join('\n');
    const billLineItems = [
      formatLineItems(billItems.generationTransmission),
      formatLineItems(billItems.distribution),
      formatLineItems(billItems.government),
      formatLineItems(billItems.otherCharges),
    ].filter(Boolean).join('\n');

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
        billTotal: Number(billTotal.toFixed(2)),
        billEffectiveRate: Number(billEffectiveRate.toFixed(4)),
        billProfileName: String(bill.rateProfileName || '').trim(),
        billSectionTotals,
        billLineItems,
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
