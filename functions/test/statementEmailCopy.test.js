const test = require('node:test');
const assert = require('node:assert');

const { statementEmailCopy } = require('../src/scheduled/processMonthlyInvoice');

/**
 * Re-sending a FINALIZED month (Settings > Statements, phone or web) used to
 * mail a PDF stamped FINAL inside an email calling it "an estimate" that
 * Dagitab "will update", and to leave an "estimated bill" notification in the
 * app. October 2026 for a real account did exactly that on 1 Nov 2026.
 */

const october = {
  billingMonth: '2026-10',
  readingDateFrom: '2026-10-01',
  readingDateTo: '2026-10-31',
  billingDays: 31,
  totalKwh: 13.7136,
  totalAmountDue: 175.78,
  effectiveRate: 12.82,
  supplyRates: { generation: 7.753 },
};

const allText = (copy) => [copy.subject, copy.heading, copy.intro, copy.note,
  ...copy.rows.flat()].join(' ');

test('a finalized month is described as final, never as an estimate', () => {
  const copy = statementEmailCopy({ invoice: { ...october, status: 'FINALIZED' }, billingMonth: '2026-10' });

  assert.match(copy.heading, /final/i);
  assert.match(copy.subject, /final/i);
  assert.doesNotMatch(allText(copy), /estimate/i);
  assert.doesNotMatch(allText(copy), /will update/i);
  assert.ok(copy.rows.some(([label, value]) => label === 'Amount due' && value === 'PHP 175.78'));
  assert.ok(copy.rows.some(([label, value]) => label === 'Generation rate' && /7\.75/.test(value)));
});

test('a finalized month raises no "estimated bill" notification', () => {
  const copy = statementEmailCopy({ invoice: { ...october, status: 'FINALIZED' }, billingMonth: '2026-10' });
  assert.strictEqual(copy.notification, null);
});

test('a month just closed is still an estimate, with its notification', () => {
  const copy = statementEmailCopy({ invoice: { ...october, status: 'PENDING' }, billingMonth: '2026-10' });

  assert.match(copy.intro, /estimate/i);
  assert.ok(copy.rows.some(([label]) => label === 'Estimated amount due'));
  assert.match(copy.notification.message, /estimated bill is PHP 175\.78 for 13\.71 kWh/);
});
