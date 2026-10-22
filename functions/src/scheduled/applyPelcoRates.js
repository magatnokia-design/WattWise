const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { getBillingPeriod, previousMonth, STATUS } = require('../lib/invoice');
const { normalizeSupplyRates } = require('../lib/billing');
const { fetchOfficialGenerationRate } = require('../lib/pelcoRates');
const { renderInvoicePdf, formatMonthName } = require('../lib/invoicePdf');
const { resolveUserContact, enqueueEmail } = require('../lib/mailQueue');
const { createNotification } = require('../lib/notifications');
const { getManilaDateKey } = require('../lib/manilaTime');
const { finalizeForUser } = require('../http/finalizeInvoice');

const peso = (value) => `PHP ${(Number(value) || 0).toFixed(2)}`;

/**
 * Finalizes statements by itself once PELCO III posts the month's official
 * generation rate (Oct 2026). Before this, a statement stayed an estimate until
 * the user typed the rate off their paper bill - which most never would.
 *
 * Runs daily. For the last two closed months: if the official rate is not on
 * file yet, fetch PELCO III's PDF (lib/pelcoRates.js); once it is, finalize
 * every statement for that month still PENDING and email the final copy.
 *
 * - The rate is stored once per month in `pelco_rates/{YYYY-MM}` (server-only),
 *   so the PDF is read once, not once per account.
 * - A statement the user already finalized by hand is left alone - their rate
 *   came off their own bill.
 * - Only Generation is published; the other Block 1 lines keep the values the
 *   estimate used.
 * - A month that is not posted yet is simply tried again tomorrow.
 *
 * It also keeps every account on the AUTOMATIC rate current (Oct 2026: "just
 * use Dagitab"): the newest posted rate goes to pelco_rates/latest, and each
 * user whose rateMode is not 'manual' gets it as their Settings generation
 * rate - which is what live costs, daily costs, budgets and the next
 * statement's estimate all price with. A user who typed their own rate is
 * 'manual' and left alone.
 */
async function applyPelcoRates() {
  const db = admin.firestore();
  const todayKey = getManilaDateKey(new Date());
  const lastClosed = previousMonth(todayKey.slice(0, 7));
  const months = [previousMonth(lastClosed), lastClosed].filter((month) => getBillingPeriod(month));

  const summary = [];
  for (const billingMonth of months) {
    const rateRef = db.doc(`pelco_rates/${billingMonth}`);
    let rate = (await rateRef.get()).data() || null;

    if (!rate?.generation) {
      let fetched = null;
      try {
        fetched = await fetchOfficialGenerationRate(billingMonth);
      } catch (error) {
        logger.warn('PELCO III rate fetch failed', { billingMonth, message: error?.message });
      }
      if (!fetched) {
        summary.push({ billingMonth, status: 'not_posted' });
        continue;
      }
      rate = { ...fetched, billingMonth, fetchedAtMs: Date.now() };
      await rateRef.set(rate);
      logger.info('PELCO III official rate stored', rate);
    }

    const finalized = await finalizePendingStatements({ db, billingMonth, rate, todayKey });
    summary.push({ billingMonth, generation: rate.generation, finalized });
  }

  const latest = await refreshLatestRate(db, summary);
  const ratesUpdated = latest ? await syncAutomaticRates(db, latest) : 0;

  logger.info('applyPelcoRates done', { summary, latest, ratesUpdated });
  return { success: true, summary, latest, ratesUpdated };
}

/**
 * pelco_rates/latest: the newest month with a posted rate, never moved back to
 * an older month.
 */
const refreshLatestRate = async (db, summary) => {
  const latestRef = db.doc('pelco_rates/latest');
  const current = (await latestRef.get()).data() || null;
  const newest = summary
    .filter((entry) => Number(entry.generation) > 0)
    .sort((a, b) => b.billingMonth.localeCompare(a.billingMonth))[0];

  if (!newest || (current?.billingMonth && current.billingMonth >= newest.billingMonth)) {
    return current;
  }

  const monthDoc = (await db.doc(`pelco_rates/${newest.billingMonth}`).get()).data() || {};
  const latest = {
    billingMonth: newest.billingMonth,
    generation: newest.generation,
    sourceUrl: monthDoc.sourceUrl || null,
    updatedAtMs: Date.now(),
  };
  await latestRef.set(latest);
  return latest;
};

/** Brings every automatic account to the latest posted generation rate. */
const syncAutomaticRates = async (db, latest) => {
  const generation = Number(latest?.generation);
  if (!(generation > 0)) return 0;

  const usersSnapshot = await db.collection('users').get();
  let updated = 0;
  await Promise.all(usersSnapshot.docs.map(async (userDoc) => {
    const data = userDoc.data() || {};
    if (data.rateMode === 'manual') return;
    if (
      Number(data.supplyRates?.generation) === generation
      && data.ratesSourceMonth === latest.billingMonth
      && data.rateMode === 'auto'
    ) return;

    try {
      await userDoc.ref.set({
        supplyRates: normalizeSupplyRates({ ...(data.supplyRates || {}), generation }),
        supplyRatesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        rateMode: 'auto',
        ratesSourceMonth: latest.billingMonth,
      }, { merge: true });
      updated += 1;
    } catch (error) {
      logger.error('Automatic rate update failed for user', { userId: userDoc.id, message: error?.message });
    }
  }));
  return updated;
};

const finalizePendingStatements = async ({ db, billingMonth, rate, todayKey }) => {
  const usersSnapshot = await db.collection('users').get();
  let count = 0;

  await Promise.all(usersSnapshot.docs.map(async (userDoc) => {
    const userId = userDoc.id;
    try {
      const invoiceDoc = await db.doc(`users/${userId}/invoices/${billingMonth}`).get();
      const invoice = invoiceDoc.exists ? invoiceDoc.data() : null;
      if (!invoice || invoice.status !== STATUS.PENDING) return;

      const supplyRates = normalizeSupplyRates({
        ...(invoice.supplyRates || userDoc.data()?.supplyRates || {}),
        generation: rate.generation,
      });

      const { finalized } = await finalizeForUser({
        db,
        userId,
        billingMonth,
        supplyRates,
        todayKey,
        source: 'pelco_auto',
        sourceUrl: rate.sourceUrl || null,
      });
      count += 1;

      await sendFinalStatement({ userId, billingMonth, invoice: { ...finalized, status: STATUS.FINALIZED } });
    } catch (error) {
      logger.error('Automatic finalization failed for user', {
        userId,
        billingMonth,
        message: error?.message,
      });
    }
  }));

  return count;
};

const sendFinalStatement = async ({ userId, billingMonth, invoice }) => {
  const monthName = formatMonthName(billingMonth);

  await createNotification({
    userId,
    type: 'invoice',
    title: `${monthName} statement is final`,
    message: `PELCO III's official rate is in. Your ${monthName} bill comes to ${peso(invoice.totalAmountDue)} `
      + `for ${Number(invoice.totalKwh || 0).toFixed(2)} kWh.`,
    metadata: { billingMonth, totalKwh: invoice.totalKwh, totalAmountDue: invoice.totalAmountDue },
  });

  const contact = await resolveUserContact(userId);
  if (!contact?.email) return;

  const pdf = await renderInvoicePdf({ invoice, account: { name: contact.name, email: contact.email } });
  await enqueueEmail({
    toEmail: contact.email,
    subject: `Your final Dagitab statement for ${monthName}`,
    heading: `${monthName} statement - final`,
    intro: `PELCO III has posted the official generation rate for ${monthName}, and Dagitab has updated `
      + `your statement with it. Nothing for you to do.`,
    rows: [
      ['Billing month', monthName],
      ['Total kWh used', `${Number(invoice.totalKwh || 0).toFixed(2)} kWh`],
      ['Amount due', peso(invoice.totalAmountDue)],
      ['Generation rate', `${peso(invoice.supplyRates?.generation)} / kWh (official)`],
    ],
    attachments: [{
      filename: `Dagitab-${billingMonth}.pdf`,
      content: pdf.toString('base64'),
      encoding: 'base64',
      contentType: 'application/pdf',
    }],
    tag: 'invoice',
  });
};

module.exports = { applyPelcoRates, finalizePendingStatements, refreshLatestRate, syncAutomaticRates };
