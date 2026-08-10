const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { buildInvoice, buildFinalizationDelta, getBillingPeriod, STATUS } = require('../lib/invoice');
const { getManilaDateKey } = require('../lib/manilaTime');

// Block 1 fields the user may supply from the official rate posting.
const SUPPLY_RATE_KEYS = [
  'generation',
  'generationRateAdj',
  'transmission',
  'transmissionCostAdj',
  'ancillary',
  'systemLoss',
  'systemLossAdj',
  'transDemand',
  'transDemandAdj',
  'icera',
  'gram',
];

// Rates are per-kWh figures a few pesos in size; anything outside this is a typo.
const MAX_RATE = 50;

const normalizeSupplyRates = (raw = {}) => {
  const rates = {};

  for (const key of SUPPLY_RATE_KEYS) {
    if (raw[key] === undefined || raw[key] === null || raw[key] === '') continue;

    const value = Number(raw[key]);
    if (!Number.isFinite(value)) {
      throw new HttpsError('invalid-argument', `${key} must be a number`);
    }
    if (Math.abs(value) > MAX_RATE) {
      throw new HttpsError('invalid-argument', `${key} looks out of range (${value})`);
    }

    rates[key] = value;
  }

  if (!Number.isFinite(rates.generation) || rates.generation <= 0) {
    throw new HttpsError('invalid-argument', 'A generation rate is required to finalize');
  }

  return rates;
};

/**
 * Locks a billing month to the official PELCO III rates for that month.
 *
 * Until this runs an invoice is an estimate priced with the previous month's
 * rates, because the official figure does not exist until after the period
 * closes. Finalizing recomputes with the real rates and records the difference
 * from the estimate, so the shift reads as expected rather than as a bug.
 */
async function finalizeInvoice(request) {
  try {
    const { auth, data } = request || {};

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const billingMonth = String(data?.billingMonth || '').trim();
    if (!getBillingPeriod(billingMonth)) {
      throw new HttpsError('invalid-argument', 'billingMonth must be in YYYY-MM form');
    }

    const period = getBillingPeriod(billingMonth);
    const todayKey = getManilaDateKey(new Date());

    // Finalizing an open period would lock in a partial month.
    if (todayKey <= period.readingDateTo) {
      throw new HttpsError(
        'failed-precondition',
        'This billing period is still open. It can be finalized once the period ends.'
      );
    }

    const supplyRates = normalizeSupplyRates(data?.supplyRates || data);

    const db = admin.firestore();
    const userId = auth.uid;
    const invoiceRef = db.doc(`users/${userId}/invoices/${billingMonth}`);

    const [existingDoc, userDoc, daysSnapshot] = await Promise.all([
      invoiceRef.get(),
      db.doc(`users/${userId}`).get(),
      db.collection(`users/${userId}/history_daily`)
        .where('date', '>=', `${billingMonth}-01`)
        .where('date', '<=', `${billingMonth}-31`)
        .get(),
    ]);

    const existing = existingDoc.exists ? existingDoc.data() : null;
    const estimateTotal = existing?.totalAmountDue ?? null;

    const finalized = buildInvoice({
      billingMonth,
      dailyEntries: daysSnapshot.docs.map((doc) => doc.data()),
      officialRates: supplyRates,
      todayKey,
      isLifeline: userDoc.data()?.isLifeline === true,
    });

    if (!finalized) {
      throw new HttpsError('internal', 'Could not rebuild the invoice');
    }

    const delta = estimateTotal === null
      ? null
      : buildFinalizationDelta(estimateTotal, finalized.totalAmountDue);

    await invoiceRef.set({
      ...finalized,
      status: STATUS.FINALIZED,
      finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Kept so the user can see how close the estimate was, month over month.
      estimateTotalBeforeFinalize: estimateTotal,
      finalizationDelta: delta,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info('Invoice finalized', {
      userId,
      billingMonth,
      total: finalized.totalAmountDue,
      difference: delta?.difference ?? null,
    });

    return {
      success: true,
      billingMonth,
      totalAmountDue: finalized.totalAmountDue,
      effectiveRate: finalized.effectiveRate,
      delta,
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      logger.warn('Finalize invoice rejected', { code: error.code, message: error.message });
      throw error;
    }

    logger.error('Error finalizing invoice:', { message: error?.message, stack: error?.stack });
    throw new HttpsError('internal', error?.message || 'Failed to finalize invoice');
  }
}

module.exports = { finalizeInvoice };
