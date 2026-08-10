const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { buildInvoice, getBillingPeriod, previousMonth, STATUS } = require('../lib/invoice');
const { renderInvoicePdf, formatMonthName } = require('../lib/invoicePdf');
const { resolveUserContact, enqueueEmail } = require('../lib/mailQueue');
const { getManilaDateKey } = require('../lib/manilaTime');

const peso = (value) => `PHP ${(Number(value) || 0).toFixed(2)}`;

/**
 * Loads the most recent FINALIZED invoice, used as the rate fallback for a
 * period whose official rates have not been published yet.
 */
const loadLastFinalized = async (db, userId) => {
  const snapshot = await db
    .collection(`users/${userId}/invoices`)
    .where('status', '==', STATUS.FINALIZED)
    .orderBy('billingMonth', 'desc')
    .limit(1)
    .get();

  return snapshot.empty ? null : snapshot.docs[0].data();
};

const loadMonthDays = async (db, userId, billingMonth) => {
  const snapshot = await db
    .collection(`users/${userId}/history_daily`)
    .where('date', '>=', `${billingMonth}-01`)
    .where('date', '<=', `${billingMonth}-31`)
    .get();

  return snapshot.docs.map((doc) => doc.data());
};

/**
 * Builds and stores an invoice for one user and month. Shared by the monthly
 * close and by the daily refresh of the open period.
 */
const upsertInvoice = async ({ db, userId, billingMonth, todayKey, isLifeline }) => {
  const [dailyEntries, lastFinalized] = await Promise.all([
    loadMonthDays(db, userId, billingMonth),
    loadLastFinalized(db, userId),
  ]);

  const invoice = buildInvoice({
    billingMonth,
    dailyEntries,
    lastFinalized,
    todayKey,
    isLifeline,
  });

  if (!invoice) return null;

  const ref = db.doc(`users/${userId}/invoices/${billingMonth}`);
  const existing = await ref.get();

  // A finalized invoice is immutable - never overwrite it with a fresh estimate.
  if (existing.exists && existing.data()?.status === STATUS.FINALIZED) {
    return existing.data();
  }

  await ref.set({
    ...invoice,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return invoice;
};

/**
 * Scheduled: runs shortly after midnight Manila on the 1st of each month.
 *
 * Closes the month that just ended, moving it to PENDING, and emails the user a
 * PDF statement. The figures are explicitly an estimate: PELCO III publishes a
 * month's rate only after the period closes, so the user finalizes later by
 * entering the official rate.
 */
async function processMonthlyInvoice() {
  const db = admin.firestore();
  const todayKey = getManilaDateKey(new Date());
  const billingMonth = previousMonth(todayKey.slice(0, 7));

  if (!billingMonth || !getBillingPeriod(billingMonth)) {
    logger.error('Could not resolve the billing month to close', { todayKey });
    return { success: false };
  }

  logger.info('Closing monthly invoices', { billingMonth });

  const usersSnapshot = await db.collection('users').get();
  let sent = 0;

  await Promise.all(usersSnapshot.docs.map(async (userDoc) => {
    const userId = userDoc.id;

    try {
      const invoice = await upsertInvoice({
        db,
        userId,
        billingMonth,
        todayKey,
        isLifeline: userDoc.data()?.isLifeline === true,
      });

      if (!invoice) return;

      // Nothing measured: no statement worth sending.
      if (!(invoice.totalKwh > 0)) {
        logger.info('Skipping statement: no usage recorded', { userId, billingMonth });
        return;
      }

      const contact = await resolveUserContact(userId);
      if (!contact?.email) return;

      const pdf = await renderInvoicePdf({
        invoice,
        account: { name: contact.name, email: contact.email },
      });

      await enqueueEmail({
        toEmail: contact.email,
        subject: `Your WattWise statement for ${formatMonthName(billingMonth)}`,
        heading: `${formatMonthName(billingMonth)} statement`,
        intro:
          `Your billing period has closed. This statement is an estimate of ${peso(invoice.totalAmountDue)} ` +
          'based on the most recent published rate - PELCO III releases each month\'s official rate after the ' +
          'period ends. Open WattWise and enter the official rate to finalize it.',
        rows: [
          ['Billing month', formatMonthName(billingMonth)],
          ['Reading period', `${invoice.readingDateFrom} to ${invoice.readingDateTo}`],
          ['Billing days', String(invoice.billingDays)],
          ['Total kWh used', `${invoice.totalKwh.toFixed(2)} kWh`],
          ['Estimated amount due', peso(invoice.totalAmountDue)],
          ['Effective rate', `${peso(invoice.effectiveRate)} / kWh`],
        ],
        attachments: [{
          filename: `WattWise-${billingMonth}.pdf`,
          content: pdf.toString('base64'),
          encoding: 'base64',
          contentType: 'application/pdf',
        }],
        tag: 'invoice',
      });

      sent += 1;
    } catch (userError) {
      logger.error('Monthly invoice failed for user', {
        userId,
        billingMonth,
        message: userError?.message,
      });
    }
  }));

  logger.info('Monthly invoices processed', { billingMonth, sent });
  return { success: true, billingMonth, sent };
}

module.exports = { processMonthlyInvoice, upsertInvoice };
