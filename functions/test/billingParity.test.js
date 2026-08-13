const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const functionsCopy = require('../src/lib/billing');

/**
 * `calculatePelcoIIIBill` exists in three places by design - Functions, the
 * phone app, and the web client - because each runs in a context that cannot
 * import the others. Nothing has ever enforced that they agree, and a drift
 * would not surface as a failure: it would surface as the phone and the website
 * quoting a user two different totals for the same month.
 *
 * `billing.test.js` proves the Functions copy against four real PELCO III
 * sample bills, exact to the centavo. This file proves the other two produce
 * identical output for identical input. Together those give the whole claim:
 * the Functions copy is correct, and the others match it.
 *
 * That is why no expected totals appear below. Restating them here would create
 * a second set of numbers to keep in step - the exact problem being guarded
 * against. Equality with the proven copy is the assertion.
 */

const REPO_ROOT = path.join(__dirname, '..', '..');
const PHONE_COPY = path.join(REPO_ROOT, 'src', 'utils', 'billing.js');
const WEB_COPY = path.join(
  REPO_ROOT, '..', 'WattWise-Web', 'src', 'utils', 'billing.js'
);

/**
 * Loads an ES-module copy from a CommonJS test.
 *
 * The client copies use `export const`, and Node reads a `.js` file under a
 * package without `"type": "module"` as CommonJS - so requiring one is a syntax
 * error. Copying the bytes to a `.mjs` file changes only how Node classifies
 * it, leaving the source itself untouched. Both files are self-contained with
 * no imports, so relocating them resolves nothing differently.
 */
const loadEsmCopy = async (absolutePath) => {
  const source = fs.readFileSync(absolutePath, 'utf8');
  const tempFile = path.join(
    os.tmpdir(),
    `wattwise-billing-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`
  );

  fs.writeFileSync(tempFile, source);

  try {
    return await import(pathToFileURL(tempFile).href);
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
};

// Real PELCO III sample bills, plus the edges a month can actually land on: a
// meter that recorded nothing, the lifeline subsidy, and usage past the
// distribution blocks. Inputs only - see the note above on why.
const CASES = [
  { kwh: 94, supplyRates: { generation: 6.2295, generationRateAdj: -0.0306, transmission: 1.2729, systemLoss: 0.5499 }, isLifeline: true },
  { kwh: 116, supplyRates: { generation: 5.5719, generationRateAdj: -0.0306, transmission: 1.3875, systemLoss: 0.5111 } },
  { kwh: 135, supplyRates: { generation: 5.5034, generationRateAdj: -0.0306, transmission: 0.5382, ancillary: 0.8858, systemLoss: 0.5373 } },
  { kwh: 216, supplyRates: { generation: 5.5924, generationRateAdj: -0.0306, transmission: 1.5257, systemLoss: 0.5301 } },
  { kwh: 0, supplyRates: null },
  { kwh: 1, supplyRates: null },
  { kwh: 350, supplyRates: null, isLifeline: true },
  { kwh: 1200, supplyRates: { generation: 6.0, generationRateAdj: -0.05, transmission: 1.4, systemLoss: 0.52 } },
  { kwh: 47.5, supplyRates: { generation: 5.8 } },
];

const SHARED_CONSTANTS = [
  'RATE_EFFECTIVE_DATE',
  'DISTRIBUTION_RATES',
  'METERING_FLAT',
  'UNIVERSAL_RATES',
  'VAT_RATE',
  'EVAT_SUPPLY_FACTOR',
  'DEFAULT_GEN_RATE_ADJ',
  'DEFAULT_SUPPLY_RATES',
  'SUPPLY_RATE_FIELDS',
  'RATE_PROFILES',
];

const assertParity = (label, clientCopy) => {
  for (const key of SHARED_CONSTANTS) {
    assert.deepEqual(
      clientCopy[key],
      functionsCopy[key],
      `${label}: ${key} differs from the Functions copy`
    );
  }

  for (const testCase of CASES) {
    const options = {
      supplyRates: testCase.supplyRates,
      isLifeline: testCase.isLifeline,
    };

    assert.deepEqual(
      clientCopy.calculatePelcoIIIBill(testCase.kwh, options),
      functionsCopy.calculatePelcoIIIBill(testCase.kwh, options),
      `${label}: ${testCase.kwh} kWh produces a different bill from the Functions copy`
    );

    // The rate every live figure is priced with - per-hour cost, today's cost,
    // the per-outlet split. It is independent of kWh, so one call per rate set
    // covers it.
    assert.equal(
      typeof clientCopy.marginalRatePerKwh,
      'function',
      `${label}: marginalRatePerKwh is missing - live costs will be priced with `
        + 'effectiveRate, which divides the fixed period charges by whatever '
        + 'energy has accumulated and reports thousands of pesos per kWh'
    );

    assert.deepEqual(
      clientCopy.marginalRatePerKwh(options),
      functionsCopy.marginalRatePerKwh(options),
      `${label}: marginal rate differs from the Functions copy`
    );
  }
};

test('the phone app bills identically to Functions', async () => {
  const phoneCopy = await loadEsmCopy(PHONE_COPY);
  assertParity('phone', phoneCopy);
});

test('the web client bills identically to Functions', async (t) => {
  // The web client lives in a sibling repository, so it is present on a
  // development machine and absent anywhere else. Skipping keeps this suite
  // runnable on its own without ever quietly passing when the file *is* there.
  if (!fs.existsSync(WEB_COPY)) {
    t.skip(`web client not found at ${WEB_COPY}`);
    return;
  }

  const webCopy = await loadEsmCopy(WEB_COPY);
  assertParity('web', webCopy);
});
