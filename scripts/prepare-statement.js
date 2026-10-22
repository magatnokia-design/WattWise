#!/usr/bin/env node
/**
 * Creates one month's statement record (users/{uid}/invoices/{YYYY-MM}) for an
 * account, so it appears under Settings -> Monthly statements and can be
 * emailed from there. Dry run unless --write; --remove deletes a record this
 * script made.
 *
 *   node scripts/prepare-statement.js <email> <YYYY-MM>            # dry run
 *   node scripts/prepare-statement.js <email> <YYYY-MM> --write
 *   node scripts/prepare-statement.js <email> <YYYY-MM> --remove
 *
 * WHY THIS EXISTS: processMonthlyInvoice creates a month's record at 00:20 on
 * the 1st. A month whose daily rows were written afterwards - the sample rows
 * from seed-sample-usage.js, written on 22 Oct for August-October - never got
 * one, so the statement list stayed empty and "Email me this statement", the
 * end-to-end test of the PDF and Brevo, could not be reached.
 *
 * The record is built by buildInvoice, the same function upsertInvoice uses,
 * from the same rows and rate fallback. It is marked `seeded: true`, and
 * --remove refuses anything not so marked. Never overwrites a FINALIZED one.
 *
 * Statements built from seeded rows show SAMPLE figures, not measurements.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { buildInvoice, getBillingPeriod } = require(path.join(ROOT, 'functions/src/lib/invoice'));
const { getManilaDateKey } = require(path.join(ROOT, 'functions/src/lib/manilaTime'));

const PROJECT = 'wattwise-fe394';
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const [email, billingMonth] = process.argv.slice(2);
const mode = process.argv.includes('--remove') ? 'remove' : process.argv.includes('--write') ? 'write' : 'dry';
if (!email || !email.includes('@') || !getBillingPeriod(String(billingMonth || ''))) {
  console.error('Usage: node scripts/prepare-statement.js <email> <YYYY-MM> [--write | --remove]');
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

const api = async (url, { method = 'GET', body, allow404 = false } = {}) => {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': PROJECT,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (allow404 && res.status === 404) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${json?.error?.message || ''}`);
  return json;
};

const encode = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { nullValue: null };
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
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
  const invoiceUrl = `${FIRESTORE}/users/${uid}/invoices/${billingMonth}`;
  const existingDoc = await api(invoiceUrl, { allow404: true });
  const existing = existingDoc ? docData(existingDoc) : null;

  if (mode === 'remove') {
    if (!existing) return console.log(`No ${billingMonth} statement record on ${email}. Nothing to remove.`);
    if (existing.seeded !== true) throw new Error('That record was not made by this script - refusing to delete it.');
    await api(invoiceUrl, { method: 'DELETE' });
    return console.log(`Removed the ${billingMonth} statement record from ${email}.`);
  }

  if (existing?.status === 'FINALIZED') {
    throw new Error(`${billingMonth} is already FINALIZED on ${email} - left untouched.`);
  }

  const userDoc = docData(await api(`${FIRESTORE}/users/${uid}`));
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
    throw new Error(`No usage recorded for ${billingMonth} on ${email} - no statement to make.`);
  }

  const seededDays = dailyEntries.filter((entry) => entry.seeded === true).length;
  console.log(`${email} ${billingMonth}: ${dailyEntries.length} days (${seededDays} seeded), `
    + `${invoice.totalKwh} kWh, ₱${invoice.totalAmountDue}, status ${invoice.status}, rates from ${invoice.rateSource}`);
  if (existing) console.log('A record already exists; --write replaces it.');

  if (mode !== 'write') {
    console.log('Dry run - nothing written. Add --write to create it.');
    return;
  }

  await api(invoiceUrl, {
    method: 'PATCH',
    body: { fields: encode({ ...invoice, seeded: true, updatedAt: new Date() }).mapValue.fields },
  });
  console.log(`Written. Sign in as ${email}: Settings -> Monthly statements -> ${billingMonth} -> Email me this statement.`);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
