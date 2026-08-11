const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { processInvoiceForUser } = require('../scheduled/processMonthlyInvoice');
const { getBillingPeriod, previousMonth } = require('../lib/invoice');
const { getManilaDateKey } = require('../lib/manilaTime');
const { consumeThrottle } = require('../lib/authEmails');

/**
 * Re-sends a monthly statement to the signed-in account.
 *
 * Two purposes, and the second is why it exists at all:
 *
 * 1. Statements go out once a month and are easy to lose. Asking for a copy
 *    should not mean waiting for the next billing period.
 * 2. It runs `processInvoiceForUser` - the exact code path the scheduled job
 *    uses - so the PDF attachment can be proven against the live SMTP transport
 *    on any ordinary day, rather than first being exercised at 00:20 on the 1st
 *    of a month with nobody watching. The attachment is the one part of the mail
 *    pipeline that has never run through Brevo.
 *
 * Scoped to the caller's own account: the user id comes from the session, never
 * from the request, so this cannot be aimed at somebody else's statement or
 * inbox.
 */
async function sendInvoiceEmail(request) {
  const uid = request?.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in first');
  }

  const db = admin.firestore();
  const todayKey = getManilaDateKey(new Date());
  const currentMonth = todayKey.slice(0, 7);
  const requested = String(request?.data?.billingMonth || '').trim();
  const billingMonth = requested || previousMonth(currentMonth);

  if (!billingMonth || !getBillingPeriod(billingMonth)) {
    throw new HttpsError('invalid-argument', 'Give a billing month as YYYY-MM');
  }

  // A period that has not closed has no final reading to bill, and the invoice
  // builder assumes a closed one. Refusing is clearer than emailing a total that
  // changes again tomorrow.
  if (billingMonth >= currentMonth) {
    throw new HttpsError(
      'failed-precondition',
      'That billing period has not closed yet'
    );
  }

  let userDoc;
  try {
    userDoc = await db.doc(`users/${uid}`).get();
  } catch (error) {
    logger.error('Could not load the account for a statement', {
      uid,
      message: error?.message,
    });
    throw new HttpsError('internal', 'Could not load your account');
  }

  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'No account found');
  }

  // Rendering a PDF on every tap is the expensive part, so this is throttled on
  // the same one-per-minute window the auth mail uses.
  const throttleKeyEmail = userDoc.data()?.email || uid;
  const allowed = await consumeThrottle(db, String(throttleKeyEmail), 'invoiceEmail');
  if (!allowed) {
    throw new HttpsError(
      'resource-exhausted',
      'A statement was just sent. Check your inbox, and your spam folder.'
    );
  }

  let result;
  try {
    result = await processInvoiceForUser({
      db,
      userId: uid,
      billingMonth,
      todayKey,
      isLifeline: userDoc.data()?.isLifeline === true,
      userRates: userDoc.data()?.supplyRates || null,
    });
  } catch (error) {
    logger.error('Statement resend failed', {
      uid,
      billingMonth,
      message: error?.message,
    });
    throw new HttpsError('internal', 'Could not build your statement');
  }

  if (!result.sent) {
    // `no_usage` is the ordinary case for a month the device was not running,
    // and it is not an error worth alarming the user about.
    const explanation = {
      no_usage: 'No energy was recorded for that month, so there is nothing to bill',
      no_email: 'This account has no email address',
      no_invoice: 'No statement could be built for that month',
    }[result.reason] || 'No statement could be built for that month';

    throw new HttpsError('failed-precondition', explanation);
  }

  logger.info('Statement queued on request', {
    uid,
    billingMonth,
    pdfBytes: result.pdfBytes,
  });

  return {
    success: true,
    billingMonth,
    totalKwh: result.invoice.totalKwh,
    totalAmountDue: result.invoice.totalAmountDue,
    pdfBytes: result.pdfBytes,
  };
}

module.exports = { sendInvoiceEmail };
