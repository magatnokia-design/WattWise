#!/usr/bin/env node
/**
 * Fills one account with daily usage so its screens can be tried out.
 * SAMPLE DATA - generated, not measured. Every row carries `seeded: true`.
 *
 *   node scripts/seed-sample-usage.js <email>            dry run: prints what it would write
 *   node scripts/seed-sample-usage.js <email> --write    writes it
 *   node scripts/seed-sample-usage.js <email> --remove   deletes every seeded row again
 *
 * Writes users/{uid}/history_daily/{date} for 1 Aug 2026 to yesterday, and the
 * spending fields of users/{uid}/budget/{month}, in the same shape and priced
 * by the same calculatePelcoIIIBill call processDailyRollup uses - so History,
 * Analytics, Compare Usage and the Budget range card read it like rolled-up
 * days. It never touches outlets, devices, invoices or anything not seeded.
 *
 * `seeded: true` matters twice. handleDailyReceiptEmails skips seeded rows; a
 * new history_daily row otherwise sends a notification, an email and a push,
 * so the script refuses to --write unless that function was deployed after the
 * guard was committed. And --remove finds the rows by it.
 *
 * Runs as you: it uses the Firebase CLI's login (run `firebase login` first),
 * so it can only reach a project that login can reach.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { calculatePelcoIIIBill } = require(path.join(ROOT, 'functions/src/lib/billing'));
const { getDaysInManilaMonth, getManilaDateKey } = require(path.join(ROOT, 'functions/src/lib/manilaTime'));

const PROJECT = 'wattwise-fe394';
const REGION = 'asia-southeast1';
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const START_DATE = '2026-08-01';

const email = process.argv[2];
const mode = process.argv.includes('--remove') ? 'remove' : process.argv.includes('--write') ? 'write' : 'dry';
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/seed-sample-usage.js <email> [--write | --remove]');
  process.exit(1);
}

// --- auth: the Firebase CLI's own token -------------------------------------
const accessToken = () => {
  // Any CLI call refreshes the stored token if it has expired.
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

// --- Firestore REST value encoding ------------------------------------------
const encode = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
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
  if ('mapValue' in field) {
    return Object.fromEntries(Object.entries(field.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  }
  return undefined;
};

// --- sample generator ---------------------------------------------------------
// Deterministic per date, so re-running writes the same figures.
const rand = (seedText) => {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

const OUTLET1 = { name: 'Electric Fan', watts: [42, 58], hours: [6, 11] };
const OUTLET2 = { name: 'Laptop Charger', watts: [35, 62], hours: [3, 8] };

const dayUsage = (dateKey) => {
  const r = rand(dateKey);
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  const between = ([a, b]) => a + (b - a) * r();

  const fanHours = between(OUTLET1.hours) + (weekend ? 2 : 0);
  const fanWatts = between(OUTLET1.watts);
  const laptopHours = between(OUTLET2.hours) * (weekend ? 0.6 : 1);
  const laptopWatts = between(OUTLET2.watts);
  // A day now and then with the laptop away.
  const laptopOff = r() < 0.08;

  return {
    outlet1Energy: Number(((fanHours * fanWatts) / 1000).toFixed(3)),
    outlet2Energy: laptopOff ? 0 : Number(((laptopHours * laptopWatts) / 1000).toFixed(3)),
    peakPower: Number(Math.max(fanWatts + 6 * r(), laptopOff ? 0 : laptopWatts + 18 * r()).toFixed(1)),
    peakHour: 13 + Math.floor(r() * 8),
  };
};

const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// --- main ---------------------------------------------------------------------
const main = async () => {
  const lookup = await api(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    { method: 'POST', body: { email: [email] } }
  );
  const user = lookup.users?.[0];
  if (!user) throw new Error(`No account for ${email}.`);
  const uid = user.localId;
  console.log(`Account: ${email} (uid ${uid})`);

  if (mode === 'remove') {
    const found = await api(`${FIRESTORE}/users/${uid}:runQuery`, {
      method: 'POST',
      body: {
        structuredQuery: {
          from: [{ collectionId: 'history_daily' }],
          where: { fieldFilter: { field: { fieldPath: 'seeded' }, op: 'EQUAL', value: { booleanValue: true } } },
        },
      },
    });
    const names = found.filter((row) => row.document).map((row) => row.document.name);
    for (let i = 0; i < names.length; i += 400) {
      await api(`${FIRESTORE}:commit`, {
        method: 'POST',
        body: { writes: names.slice(i, i + 400).map((name) => ({ delete: name })) },
      });
    }
    console.log(`Removed ${names.length} seeded daily rows. Budget spending recomputes at the next nightly rollup.`);
    return;
  }

  // The account's own rates, exactly as the rollup prices with them.
  let supplyRates = null;
  let rateProfileId = null;
  try {
    const profile = await api(`${FIRESTORE}/users/${uid}`);
    supplyRates = decode(profile.fields?.supplyRates) || null;
    rateProfileId = decode(profile.fields?.rateProfileId) || null;
  } catch {
    // No user document yet: priced at the defaults, as the rollup would.
  }

  const yesterday = addDays(getManilaDateKey(new Date()), -1);
  const rows = [];
  for (let key = START_DATE; key <= yesterday; key = addDays(key, 1)) {
    const u = dayUsage(key);
    const totalEnergy = Number((u.outlet1Energy + u.outlet2Energy).toFixed(3));
    const bill = calculatePelcoIIIBill(totalEnergy, {
      date: new Date(Date.parse(`${key}T04:00:00Z`)),
      supplyRates,
      profileId: rateProfileId,
      includePeriodFlats: false,
      daysInPeriod: 1,
      billingDays: getDaysInManilaMonth(key),
    });
    const cost = Number(bill.totals.total.toFixed(2));
    const outlet1Cost = totalEnergy > 0 ? Number((cost * (u.outlet1Energy / totalEnergy)).toFixed(2)) : 0;
    const outlet2Cost = totalEnergy > 0 ? Number((cost - outlet1Cost).toFixed(2)) : 0;
    const applianceBreakdown = [
      { applianceName: OUTLET1.name, energyKwh: u.outlet1Energy, cost: outlet1Cost, outlets: [1] },
      ...(u.outlet2Energy > 0
        ? [{ applianceName: OUTLET2.name, energyKwh: u.outlet2Energy, cost: outlet2Cost, outlets: [2] }]
        : []),
    ];
    rows.push({
      date: key,
      outlet1Energy: u.outlet1Energy,
      outlet2Energy: u.outlet2Energy,
      outlet1Name: OUTLET1.name,
      outlet2Name: OUTLET2.name,
      outlet1Cost,
      outlet2Cost,
      totalEnergy,
      cost,
      bill,
      applianceBreakdown,
      peakPower: u.peakPower,
      peakHour: u.peakHour,
      createdAt: new Date(),
      seeded: true,
    });
  }

  // Month spending, as recomputeMonthlyBudget computes it: the month's total
  // energy priced once, with the monthly flat, split by each outlet's share.
  const months = {};
  for (const row of rows) {
    const m = row.date.slice(0, 7);
    months[m] = months[m] || { energy: 0, outlet1: 0 };
    months[m].energy += row.totalEnergy;
    months[m].outlet1 += row.outlet1Energy;
  }
  const budgets = Object.entries(months).map(([month, t]) => {
    const total = calculatePelcoIIIBill(t.energy, {
      supplyRates, profileId: rateProfileId, includePeriodFlats: t.energy > 0,
    }).totals.total;
    const outlet1Spending = t.energy > 0 ? Number((total * (t.outlet1 / t.energy)).toFixed(2)) : 0;
    return {
      month,
      kwh: t.energy,
      fields: {
        month,
        currentSpending: Number(total.toFixed(2)),
        outlet1Spending,
        outlet2Spending: Number((total - outlet1Spending).toFixed(2)),
        lastUpdated: new Date(),
      },
    };
  });

  console.log(`\nDaily rows: ${rows.length} (${rows[0].date} to ${rows[rows.length - 1].date})`);
  for (const b of budgets) {
    console.log(`  ${b.month}: ${b.kwh.toFixed(2)} kWh, spending P${b.fields.currentSpending.toFixed(2)}`);
  }
  console.log(`  e.g. ${rows[0].date}: fan ${rows[0].outlet1Energy} kWh, laptop ${rows[0].outlet2Energy} kWh, P${rows[0].cost}`);

  if (mode === 'dry') {
    console.log('\nDry run - nothing written. Add --write to write it.');
    return;
  }

  // Refuse unless the receipt trigger already skips seeded rows.
  const guardCommittedAt = execSync(
    'git log -1 --format=%cI -S"after.seeded === true" -- functions/src/triggers/handleDailyReceiptEmails.js',
    { cwd: ROOT, encoding: 'utf8' }
  ).trim();
  const service = await api(`https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/services/handledailyreceiptemails`);
  if (!guardCommittedAt || new Date(service.updateTime) < new Date(guardCommittedAt)) {
    throw new Error(
      `handleDailyReceiptEmails was last deployed ${service.updateTime}, before the seeded-row guard `
      + `(${guardCommittedAt || 'not committed'}). Deploy it first or every row sends an email:\n`
      + '  firebase deploy --only functions:handleDailyReceiptEmails'
    );
  }

  const writes = [
    ...rows.map((row) => ({
      update: { name: `projects/${PROJECT}/databases/(default)/documents/users/${uid}/history_daily/${row.date}`, fields: encode(row).mapValue.fields },
    })),
    // Merge only the spending fields, so a budget the user set is kept.
    ...budgets.map((b) => ({
      update: { name: `projects/${PROJECT}/databases/(default)/documents/users/${uid}/budget/${b.month}`, fields: encode(b.fields).mapValue.fields },
      updateMask: { fieldPaths: Object.keys(b.fields) },
    })),
  ];
  for (let i = 0; i < writes.length; i += 400) {
    await api(`${FIRESTORE}:commit`, { method: 'POST', body: { writes: writes.slice(i, i + 400) } });
  }
  console.log(`\nWrote ${rows.length} daily rows and ${budgets.length} budget months.`);
};

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
