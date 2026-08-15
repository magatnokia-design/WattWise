const test = require('node:test');
const assert = require('node:assert/strict');

const { wasPricedWithPeriodFlats } = require('../src/http/repriceDailyRollups');
const { calculatePelcoIIIBill } = require('../src/lib/billing');

test('a row recording includePeriodFlats false is left alone', () => {
  assert.equal(wasPricedWithPeriodFlats({ bill: { includePeriodFlats: false } }), false);
});

test('a row that charged the flats is selected', () => {
  assert.equal(wasPricedWithPeriodFlats({ bill: { includePeriodFlats: true } }), true);
});

test('a row predating the flag is treated as suspect', () => {
  // The flag was added by the same change that stopped charging the flats, so
  // its absence dates the row to before the fix.
  assert.equal(wasPricedWithPeriodFlats({ bill: {} }), true);
  assert.equal(wasPricedWithPeriodFlats({}), true);
});

test('repricing removes the monthly flat and keeps the electricity', () => {
  // The two rows the web repo reported: 10 Aug at 0.07 kWh billed P6.25 and
  // 11 Aug at 0.14 kWh billed P6.97, each carrying a P5.60 remainder that is
  // the P5.00 metering charge plus VAT on it.
  for (const kwh of [0.07, 0.14]) {
    const withFlats = calculatePelcoIIIBill(kwh, { includePeriodFlats: true });
    const without = calculatePelcoIIIBill(kwh, { includePeriodFlats: false });

    const removed = Number((withFlats.totals.total - without.totals.total).toFixed(2));
    assert.equal(removed, 5.6, `${kwh} kWh should shed exactly the monthly flat`);

    assert.ok(without.totals.total > 0, 'the electricity itself is still charged');
    assert.ok(without.totals.total < 2, 'and it is centavos, not pesos');
  }
});

test('a day with no energy costs nothing once the flat is gone', () => {
  // What made this visible: a day with nothing plugged in still produced a bill.
  const bill = calculatePelcoIIIBill(0, { includePeriodFlats: false });
  assert.equal(bill.totals.total, 0);
});

test('repricing is idempotent', () => {
  const once = calculatePelcoIIIBill(0.07, { includePeriodFlats: false });
  const twice = calculatePelcoIIIBill(once.kwh, { includePeriodFlats: false });
  assert.equal(twice.totals.total, once.totals.total);
});
