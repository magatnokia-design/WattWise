#!/usr/bin/env node
/**
 * Renders one account's monthly statement PDF to a local file. READ-ONLY.
 *
 *   node scripts/render-statement.js <email> <YYYY-MM> [out.pdf]
 *
 * Builds the invoice with the same buildInvoice + renderInvoicePdf the monthly
 * job and the "Email me this statement" button use, from the account's
 * history_daily rows - but writes nothing: no invoice document, no
 * notification, no email. For looking at a statement (a design change, or a
 * month that closed before the account had data) without touching the account.
 *
 * Auth is the Firebase CLI's own login, the same as seed-sample-usage.js.
 * Note: a month built from rows seeded by that script is SAMPLE data, not a
 * measurement - never use it as evidence of anything.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { buildInvoice, getBillingPeriod } = require(path.join(ROOT, 'functions/src/lib/invoice'));
const { renderInvoicePdf } = require(path.join(ROOT, 'functions/src/lib/invoicePdf'));
const { getManilaDateKey } = require(path.join(ROOT, 'functions/src/lib/manilaTime'));

const PROJECT = 'wattwise-fe394';
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const [email, billingMonth, outArg] = process.argv.slice(2);
if (!email || !email.includes('@') || !getBillingPeriod(String(billingMonth || ''))) {
  console.error('Usage: node scripts/render-statement.js <email> <YYYY-MM> [out.pdf]');
  process.exit(1);
}

const accessToken = () => {
  execSync('firebase projects:list', { stdio: 'ignore' });
  const store = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const token = JSON.parse(fs.readFileSync(store, 'utf8'))?.tokens?.access_token;
  if (!token) throw new Error('No Firebase CLI login found. Run `firebase login` first.');
  return token;
};
const TOKEN = accessToken();

const api = async (url, { method = 'GET', body } = {}) => {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': PROJECT,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${json?.error?.message || ''}`);
  return json;
};

const decode = (field) => {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('nullValue' in field) return null;
  if ('timestampValue' in field) return field.timestampValue;
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(decode);
  if ('mapValue' in field) {
    return Object.fromEntries(Object.entries(field.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  }
  return undefined;
};
const docData = (doc) => Object.fromEntries(Object.entries(doc?.fields || {}).map(([k, v]) => [k, decode(v)]));

const main = async () => {
  const lookup = await api(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    { method: 'POST', body: { email: [email] } }
  );
  const user = lookup.users?.[0];
  if (!user) throw new Error(`No account for ${email}`);
  const uid = user.localId;

  const userDoc = docData(await api(`${FIRESTORE}/users/${uid}`));

  // The month's daily rows.
  const rows = await api(`${FIRESTORE}/users/${uid}:runQuery`, {
    method: 'POST',
    body: {
      structuredQuery: {
        from: [{ collectionId: 'history_daily' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: `${billingMonth}-01` } } },
              { fieldFilter: { field: { fieldPath: 'date' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: `${billingMonth}-31` } } },
            ],
          },
        },
      },
    },
  });
  const dailyEntries = rows.filter((row) => row.document).map((row) => docData(row.document));
  const seeded = dailyEntries.filter((entry) => entry.seeded === true).length;

  // The most recent finalized invoice, for the rate fallback - as upsertInvoice does.
  let lastFinalized = null;
  try {
    const invoices = await api(`${FIRESTORE}/users/${uid}/invoices?pageSize=50`);
    lastFinalized = (invoices.documents || [])
      .map(docData)
      .filter((invoice) => invoice.status === 'FINALIZED' && invoice.billingMonth < billingMonth)
      .sort((a, b) => String(b.billingMonth).localeCompare(String(a.billingMonth)))[0] || null;
  } catch (error) {
    lastFinalized = null;
  }

  const invoice = buildInvoice({
    billingMonth,
    dailyEntries,
    lastFinalized,
    userRates: userDoc.supplyRates || null,
    todayKey: getManilaDateKey(new Date()),
    isLifeline: userDoc.isLifeline === true,
  });
  if (!invoice || !(invoice.totalKwh > 0)) {
    throw new Error(`No usage recorded for ${billingMonth} on this account (${dailyEntries.length} rows)`);
  }

  const pdf = await renderInvoicePdf({
    invoice,
    account: { name: user.displayName || userDoc.profileName || userDoc.name || email, email },
  });
  const out = path.resolve(outArg || `Dagitab-${billingMonth}-${email.split('@')[0]}.pdf`);
  fs.writeFileSync(out, pdf);

  console.log(`Wrote ${out} (${pdf.length} bytes)`);
  console.log(`${dailyEntries.length} days, ${invoice.totalKwh} kWh, ₱${invoice.totalAmountDue} - status ${invoice.status}, rates from ${invoice.rateSource}`);
  if (seeded > 0) console.log(`NOTE: ${seeded} of ${dailyEntries.length} days are seeded SAMPLE data, not measurements.`);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
