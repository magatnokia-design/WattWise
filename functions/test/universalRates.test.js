const test = require('node:test');
const assert = require('node:assert/strict');

const { calculatePelcoIIIBill, UNIVERSAL_RATES } = require('../src/lib/billing');

const findItem = (bill, key) =>
  (bill.items.otherCharges || []).find((item) => item.key === key)
  || (bill.items.government || []).find((item) => item.key === key);

// Block 1 rates from the 153 kWh statement of 22 Aug 2026, so the bill below is
// a real one rather than an invented shape.
const BILL_153 = {
  generation: 6.7704,
  generationRateAdj: -0.0306,
  transmission: 0.9706,
  transmissionCostAdj: 0,
  ancillary: 0,
  systemLoss: 0.6199,
  systemLossAdj: 0,
};

test('block 3 rates can be supplied per bill', () => {
  // PELCO III re-sets these between periods. Until they could be passed in, a
  // statement printed with different values could not be reproduced at all.
  const bill = calculatePelcoIIIBill(153, {
    supplyRates: BILL_153,
    universalRates: { ucME: 0.1993, fitAll: 0.1189 },
  });

  assert.equal(findItem(bill, 'ucME').rate, 0.1993);
  assert.equal(findItem(bill, 'fitAll').rate, 0.1189);
});

test('supplying one rate leaves the others at their defaults', () => {
  // Merged, not replaced: a caller reproducing a statement should only have to
  // type the rates that actually moved on it.
  const bill = calculatePelcoIIIBill(153, {
    supplyRates: BILL_153,
    universalRates: { ucME: 0.1993 },
  });

  assert.equal(findItem(bill, 'ucME').rate, 0.1993);
  assert.equal(findItem(bill, 'fitAll').rate, UNIVERSAL_RATES.fitAll);
  assert.equal(findItem(bill, 'ucStrandedDebt').rate, UNIVERSAL_RATES.ucStrandedDebt);
});

test('omitting universalRates changes nothing for existing callers', () => {
  // Every current call site passes only supplyRates. Their results must not
  // move by a centavo.
  const without = calculatePelcoIIIBill(153, { supplyRates: BILL_153 });
  const explicitNull = calculatePelcoIIIBill(153, {
    supplyRates: BILL_153,
    universalRates: null,
  });

  assert.equal(without.totals.total, explicitNull.totals.total);
  assert.equal(findItem(without, 'ucME').rate, UNIVERSAL_RATES.ucME);
});

test('the 153 kWh statement reproduces once its own block 3 is supplied', () => {
  // The bill charged PHP 1,684.62. With block 3 frozen the model returned
  // 1,719.16 - 2.05% high, and every one of the nine statements read on
  // 22 Aug 2026 erred in the same direction. That was the frozen block, not the
  // tariff logic.
  const billed = 1684.62;

  const frozen = calculatePelcoIIIBill(153, { supplyRates: BILL_153 });
  const supplied = calculatePelcoIIIBill(153, {
    supplyRates: BILL_153,
    universalRates: { ucME: 0.1993, fitAll: 0.1189 },
  });

  const pct = (value) => Math.abs(value - billed) / billed * 100;

  assert.ok(pct(frozen.totals.total) > 2, `frozen was ${pct(frozen.totals.total).toFixed(2)}%`);
  assert.ok(
    pct(supplied.totals.total) < 0.75,
    `supplied should land inside 0.75%, got ${pct(supplied.totals.total).toFixed(2)}%`
  );
});

test('the defaults themselves are unchanged', () => {
  // The constants stay as they were; only their reachability changed. If these
  // move, every stored historical figure computed against them moves too.
  assert.equal(UNIVERSAL_RATES.ucME, 0.2763);
  assert.equal(UNIVERSAL_RATES.fitAll, 0.2011);
  assert.equal(UNIVERSAL_RATES.ucStrandedDebt, 0.0428);
});
