const test = require('node:test');
const assert = require('node:assert/strict');

const { wasPricedWithPeriodFlats } = require('../src/lib/repriceDaily');
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

test('a whole row is repriced without its energy moving', () => {
  const { repriceDailyRow } = require('../src/lib/repriceDaily');

  // Shaped like the 11 Aug row: 0.14 kWh across both outlets, priced at P6.97.
  const row = {
    date: '2026-08-11',
    totalEnergy: 0.14,
    outlet1Energy: 0.1,
    outlet2Energy: 0.04,
    cost: 6.97,
    bill: { includePeriodFlats: true },
    applianceBreakdown: [
      { name: "Nokia's Fan", energy: 0.1, cost: 4.98, outlet: 1 },
      { name: 'Nokia Charger', energy: 0.04, cost: 1.99, outlet: 2 },
    ],
  };

  const result = repriceDailyRow(row);
  assert.ok(result, 'the row still charged the flats, so it is repriced');

  const { update, change } = result;

  assert.equal(change.previousCost, 6.97, 'what the row said before');

  // Priced at the default profile, because this fixture carries no rates of its
  // own - so the drop is measured against the same profile rather than against
  // the stored 6.97, which came from the account's own rates.
  const expected = calculatePelcoIIIBill(0.14, { includePeriodFlats: false }).totals.total;
  assert.equal(update.cost, expected);
  assert.ok(update.cost < 2, 'centavos of electricity, not pesos of fees');

  // The energy is never rewritten - only money is in the update.
  assert.equal(update.totalEnergy, undefined);
  assert.equal(update.outlet1Energy, undefined);

  // The split still adds up to the whole.
  assert.equal(
    Number((update.outlet1Cost + update.outlet2Cost).toFixed(2)),
    Number(update.cost.toFixed(2))
  );

  // Breakdown entries keep their names and energy, and are recosted.
  assert.equal(update.applianceBreakdown.length, 2);
  assert.equal(update.applianceBreakdown[0].name, "Nokia's Fan");
  assert.equal(update.applianceBreakdown[0].energy, 0.1);
  assert.ok(update.applianceBreakdown[0].cost < 4.98);
});

test('a row already priced without the flats is left untouched', () => {
  const { repriceDailyRow } = require('../src/lib/repriceDaily');

  const clean = { totalEnergy: 0.5, cost: 4.94, bill: { includePeriodFlats: false } };
  assert.equal(repriceDailyRow(clean), null, 'the nightly sweep must be a no-op here');
});
