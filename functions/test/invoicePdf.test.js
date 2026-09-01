const test = require('node:test');
const assert = require('node:assert');

const { foldApplianceRows, renderInvoicePdf } = require('../src/lib/invoicePdf');

/**
 * The "WHERE IT WENT" block used to be a bare `slice(0, 6)`.
 *
 * The August 2026 statement went out with six rows adding to 6.72 kWh under a
 * headline of 7.24 kWh, and a percentage column that summed to 92 per cent,
 * because a seventh appliance was dropped without trace. The block asserts a
 * complete decomposition, so anything it cannot show it has to fold rather
 * than discard.
 */

const appliance = (name, energyKwh, cost) => ({
  applianceName: name,
  energyKwh,
  cost,
});

test('a breakdown that fits is printed as it stands', () => {
  const rows = foldApplianceRows([
    appliance('My Ceiling Fan', 3.54, 38.87),
    appliance('Television', 0.79, 8.63),
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].applianceName, 'My Ceiling Fan');
  assert.equal(rows[1].applianceName, 'Television');
});

test('exactly six appliances are all named, with no Other row', () => {
  const rows = foldApplianceRows([
    appliance('One', 1, 1),
    appliance('Two', 1, 1),
    appliance('Three', 1, 1),
    appliance('Four', 1, 1),
    appliance('Five', 1, 1),
    appliance('Six', 1, 1),
  ]);

  assert.equal(rows.length, 6);
  assert.ok(!rows.some((row) => /Other/.test(row.applianceName)));
});

test('the rows always reconcile to the breakdown they came from', () => {
  // The August 2026 shape: six named appliances plus a seventh that the old
  // slice discarded, leaving the printed column 0.52 kWh short of the total.
  const breakdown = [
    appliance('My Ceiling Fan', 3.54, 38.87),
    appliance('Television', 0.79, 8.63),
    appliance("Nokia's Fan", 0.76, 8.28),
    appliance('My Stand Fan', 0.75, 8.25),
    appliance("Nokia's Charger", 0.55, 5.99),
    appliance('LED Lamp', 0.33, 3.57),
    appliance('Desk Lamp', 0.52, 5.8),
  ];

  const rows = foldApplianceRows(breakdown);

  const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);

  assert.equal(
    Number(sum(rows, 'energyKwh').toFixed(3)),
    Number(sum(breakdown, 'energyKwh').toFixed(3)),
    'the printed rows account for every kWh in the breakdown'
  );
  assert.equal(
    Number(sum(rows, 'cost').toFixed(2)),
    Number(sum(breakdown, 'cost').toFixed(2)),
    'and for every peso'
  );
});

test('a single leftover appliance keeps its own name rather than becoming Other', () => {
  const rows = foldApplianceRows([
    appliance('One', 1, 1),
    appliance('Two', 1, 1),
    appliance('Three', 1, 1),
    appliance('Four', 1, 1),
    appliance('Five', 1, 1),
    appliance('Six', 1, 1),
    appliance('Desk Lamp', 0.52, 5.8),
  ]);

  assert.equal(rows.length, 7);
  assert.equal(rows[6].applianceName, 'Desk Lamp');
  assert.equal(rows[6].energyKwh, 0.52);
});

test('several leftovers are folded into one counted Other row', () => {
  const rows = foldApplianceRows([
    appliance('One', 1, 1),
    appliance('Two', 1, 1),
    appliance('Three', 1, 1),
    appliance('Four', 1, 1),
    appliance('Five', 1, 1),
    appliance('Six', 1, 1),
    appliance('Seven', 0.3, 3),
    appliance('Eight', 0.2, 2),
    appliance('Nine', 0.1, 1),
  ]);

  assert.equal(rows.length, 7);
  assert.equal(rows[6].applianceName, 'Other (3 appliances)');
  assert.equal(Number(rows[6].energyKwh.toFixed(2)), 0.6);
  assert.equal(Number(rows[6].cost.toFixed(2)), 6);
});

test('a tail too small to print does not earn a row of its own', () => {
  // Rounds to "0.00 kWh", so a row would add a line explaining nothing.
  const rows = foldApplianceRows([
    appliance('One', 1, 1),
    appliance('Two', 1, 1),
    appliance('Three', 1, 1),
    appliance('Four', 1, 1),
    appliance('Five', 1, 1),
    appliance('Six', 1, 1),
    appliance('Standby', 0.001, 0),
  ]);

  assert.equal(rows.length, 6);
});

test('an absent or malformed breakdown does not throw', () => {
  assert.deepEqual(foldApplianceRows(undefined), []);
  assert.deepEqual(foldApplianceRows(null), []);
  assert.deepEqual(foldApplianceRows([]), []);
});

test('a statement with more appliances than rows still renders', async () => {
  const invoice = {
    billingMonth: '2026-08',
    status: 'PENDING',
    isEstimate: true,
    rateSourceMonth: null,
    readingDateFrom: '2026-08-01',
    readingDateTo: '2026-08-31',
    billingDays: 31,
    daysMeasured: 22,
    totalKwh: 7.236,
    totalAmountDue: 79.39,
    effectiveRate: 10.97,
    applianceBreakdown: [
      appliance('My Ceiling Fan', 3.54, 38.87),
      appliance('Television', 0.79, 8.63),
      appliance("Nokia's Fan", 0.76, 8.28),
      appliance('My Stand Fan', 0.75, 8.25),
      appliance("Nokia's Charger", 0.55, 5.99),
      appliance('LED Lamp', 0.33, 3.57),
      appliance('Desk Lamp', 0.52, 5.8),
    ],
    bill: {
      items: { generationTransmission: [], distribution: [], government: [] },
      totals: {
        generationTransmission: 53.79,
        distribution: 13.66,
        government: 11.94,
        total: 79.39,
      },
    },
  };

  const buffer = await renderInvoicePdf({
    invoice,
    account: { name: 'Nokia Magat', email: 'user@example.com' },
  });

  assert.ok(Buffer.isBuffer(buffer), 'a PDF buffer comes back');
  assert.ok(buffer.length > 1000, 'and it has real content in it');
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
});

test('an invoice predating daysMeasured still renders', async () => {
  const buffer = await renderInvoicePdf({
    invoice: {
      billingMonth: '2026-07',
      status: 'FINALIZED',
      isEstimate: false,
      readingDateFrom: '2026-07-01',
      readingDateTo: '2026-07-31',
      billingDays: 31,
      totalKwh: 4.2,
      totalAmountDue: 46.1,
      effectiveRate: 10.97,
      applianceBreakdown: [appliance('Electric Fan', 4.2, 46.1)],
      bill: {
        items: { generationTransmission: [], distribution: [], government: [] },
        totals: {
          generationTransmission: 31,
          distribution: 9,
          government: 6.1,
          total: 46.1,
        },
      },
    },
    account: { email: 'user@example.com' },
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
});
