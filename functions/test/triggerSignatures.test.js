const test = require('node:test');
const assert = require('node:assert/strict');
const logger = require('firebase-functions/logger');

const { handleDailyReceiptEmails } = require('../src/triggers/handleDailyReceiptEmails');
const { handleBudgetAlerts } = require('../src/triggers/handleBudgetAlerts');
const { handleSafetyAlerts } = require('../src/triggers/handleSafetyAlerts');
const { handleDeviceCommandEmails } = require('../src/triggers/handleDeviceCommandEmails');

/**
 * Every Firestore trigger here is registered with **v2** `onDocumentWritten`,
 * which calls the handler with a single event object - `event.data` for the
 * before/after pair and `event.params` for the path wildcards.
 *
 * Four of them were written against the v1 signature `(change, context)`. Under
 * v2 that made `context` undefined, so `context.params` threw on the first line
 * of the handler. Each is wrapped in try/catch that logs and returns null, so
 * nothing surfaced: no error to the caller, no retry, no alert. The daily
 * summary, budget alerts, device-failure emails and safety alerts had simply
 * never run, and it took deliberately firing one to notice.
 *
 * The failure is invisible at runtime by construction, so it needs catching
 * here. Each handler is given a v2-shaped event on a path that returns early
 * without touching Firestore, and the assertion is that nothing was logged as
 * an error. A handler reverted to `(change, context)` throws instead, logs, and
 * fails.
 */

const withCapturedErrors = async (run) => {
  const original = logger.error;
  const captured = [];

  logger.error = (...args) => captured.push(args);
  try {
    await run();
  } finally {
    logger.error = original;
  }

  return captured;
};

// A snapshot pair shaped the way the v2 SDK supplies it.
const v2Event = ({ params, before = null, after = null }) => ({
  params,
  data: {
    before: { exists: before !== null, data: () => before, ref: {} },
    after: { exists: after !== null, data: () => after, ref: {} },
  },
});

const CASES = [
  {
    name: 'handleDailyReceiptEmails',
    handler: handleDailyReceiptEmails,
    // An update rather than a creation - the handler declines these.
    event: v2Event({
      params: { userId: 'user-1', date: '2026-07-15' },
      before: { date: '2026-07-15' },
      after: { date: '2026-07-15' },
    }),
  },
  {
    name: 'handleBudgetAlerts',
    handler: handleBudgetAlerts,
    // No budget set, so there is nothing to alert against.
    event: v2Event({
      params: { userId: 'user-1', month: '2026-07' },
      after: { monthlyBudget: 0, currentSpending: 0 },
    }),
  },
  {
    name: 'handleSafetyAlerts',
    handler: handleSafetyAlerts,
    // Stage unchanged, so no alert is due.
    event: v2Event({
      params: { userId: 'user-1' },
      before: { currentStage: 'normal' },
      after: { currentStage: 'normal' },
    }),
  },
  {
    name: 'handleDeviceCommandEmails',
    handler: handleDeviceCommandEmails,
    // Deleted document: nothing to report.
    event: v2Event({
      params: { userId: 'user-1', commandId: 'cmd-1' },
      before: { action: 'toggle' },
    }),
  },
];

for (const { name, handler, event } of CASES) {
  test(`${name} accepts the v2 event shape`, async () => {
    const errors = await withCapturedErrors(() => handler(event));

    assert.deepEqual(
      errors,
      [],
      `${name} logged an error handling a v2 event - it is probably still `
      + 'written against the v1 (change, context) signature'
    );
  });

  test(`${name} reads params from the event, not a second argument`, async () => {
    // Called the way v2 actually calls it: one argument. A handler expecting
    // `context` as the second would dereference undefined here.
    const errors = await withCapturedErrors(() => handler(event, undefined));

    assert.deepEqual(errors, [], `${name} needs a second argument v2 never passes`);
  });
}
