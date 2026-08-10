const logger = require('firebase-functions/logger');
const { resolveUserContact, enqueueEmail } = require('../lib/mailQueue');
const { createNotification } = require('../lib/notifications');

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

    const receiptDate = String(after.date || date || '').trim();
    const outlet1Name = String(after.outlet1Name || 'Outlet 1').trim();
    const outlet2Name = String(after.outlet2Name || 'Outlet 2').trim();

    // The notification is written before the recipient lookup so a user with no
    // resolvable email still gets the summary in-app and on their phone.
    await createNotification({
      userId,
      type: 'receipt',
      title: 'Daily summary ready',
      message: `You used ${totalEnergy.toFixed(3)} kWh on ${receiptDate}, about PHP ${billTotal.toFixed(2)}.`,
      metadata: {
        date: receiptDate,
        totalEnergy,
        billTotal,
      },
    });

    const contact = await resolveUserContact(userId);
    if (!contact?.email) {
      logger.info('Receipt email skipped: missing recipient', { userId, date });
      return null;
    }

    await enqueueEmail({
      toEmail: contact.email,
      subject: `WattWise daily summary - ${receiptDate}`,
      heading: 'Your daily energy summary',
      intro: `Here is your usage for ${receiptDate}.`,
      rows: [
        [outlet1Name, `${outlet1Energy.toFixed(3)} kWh`],
        [outlet2Name, `${outlet2Energy.toFixed(3)} kWh`],
        ['Total energy', `${totalEnergy.toFixed(3)} kWh`],
        ['Estimated cost', `PHP ${cost.toFixed(2)}`],
        ['Bill total', `PHP ${billTotal.toFixed(2)}`],
        ['Effective rate', `PHP ${billEffectiveRate.toFixed(4)} / kWh`],
        ['Rate plan', String(bill.rateProfileName || '').trim()],
        ['Peak power', `${peakPower.toFixed(2)} W`],
        ['Peak hour', `${peakHour}:00`],
        ['Bill sections', billSectionTotals],
        ['Line items', billLineItems],
      ],
      tag: 'receipt',
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
