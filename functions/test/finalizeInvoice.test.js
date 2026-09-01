const test = require('node:test');
const assert = require('node:assert');

const { resolveEstimateBaseline } = require('../src/http/finalizeInvoice');

/**
 * `estimateTotalBeforeFinalize` has to keep meaning one thing: what the month
 * cost before any official rate was applied to it.
 *
 * Re-finalizing is allowed - a rate can be typed wrong, or revised by PELCO III
 * - and the naive baseline (the stored total) is the PREVIOUS FINAL on the
 * second run. Taking it would overwrite the only record of the estimate and
 * report a delta of zero against itself.
 */

test('a month with no stored invoice has no baseline', () => {
  assert.equal(resolveEstimateBaseline(null), null);
  assert.equal(resolveEstimateBaseline(undefined), null);
});

test('a first finalize measures against the estimate on the document', () => {
  const baseline = resolveEstimateBaseline({
    status: 'PENDING',
    totalAmountDue: 79.39,
  });

  assert.equal(baseline, 79.39);
});

test('a re-finalize keeps the original estimate, not the previous final', () => {
  // What the document looks like after one finalize: the total is now the
  // finalized figure, and the estimate it started from is recorded separately.
  const afterFirstFinalize = {
    status: 'FINALIZED',
    totalAmountDue: 84.10,
    estimateTotalBeforeFinalize: 79.39,
  };

  assert.equal(
    resolveEstimateBaseline(afterFirstFinalize),
    79.39,
    'still measured against the estimate, not against 84.10'
  );
});

test('re-finalizing twice does not drift the baseline', () => {
  let doc = { status: 'PENDING', totalAmountDue: 79.39 };

  const first = resolveEstimateBaseline(doc);
  doc = {
    status: 'FINALIZED',
    totalAmountDue: 84.10,
    estimateTotalBeforeFinalize: first,
  };

  const second = resolveEstimateBaseline(doc);
  doc = {
    status: 'FINALIZED',
    totalAmountDue: 81.55,
    estimateTotalBeforeFinalize: second,
  };

  assert.equal(resolveEstimateBaseline(doc), 79.39, 'three finalizes, one baseline');
});

test('a finalized document missing its baseline falls back to the stored total', () => {
  // Invoices finalized before `estimateTotalBeforeFinalize` was recorded, and
  // the August 2026 document finalized in the window before the fix deployed.
  const baseline = resolveEstimateBaseline({
    status: 'FINALIZED',
    totalAmountDue: 79.39,
  });

  assert.equal(baseline, 79.39);
});

test('an unusable stored total is reported as no baseline rather than as zero', () => {
  // A delta against a fabricated 0 would claim the bill rose by its whole value.
  assert.equal(resolveEstimateBaseline({ status: 'PENDING' }), null);
  assert.equal(resolveEstimateBaseline({ status: 'PENDING', totalAmountDue: null }), null);
  assert.equal(resolveEstimateBaseline({ status: 'PENDING', totalAmountDue: 'n/a' }), null);
});

test('a zero total is a real figure and is kept', () => {
  // A month that measured nothing genuinely costs nothing, and that is a
  // baseline, not a missing value.
  assert.equal(resolveEstimateBaseline({ status: 'PENDING', totalAmountDue: 0 }), 0);
});
