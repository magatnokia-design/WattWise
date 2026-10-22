const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const { syncAutomaticRates, refreshLatestRate } = require('../src/scheduled/applyPelcoRates');

/**
 * The automatic rate (Oct 2026): every account not set to 'manual' follows
 * PELCO III's newest posted generation rate; a user who typed their own keeps it.
 */

const withServerTimestamp = async (run) => {
  const stub = () => {
    throw new Error('not used');
  };
  stub.FieldValue = { serverTimestamp: () => '__ts__' };
  Object.defineProperty(admin, 'firestore', { value: stub, configurable: true, writable: true });
  try {
    return await run();
  } finally {
    delete admin.firestore;
  }
};

const fakeUsersDb = (users) => {
  const writes = {};
  return {
    writes,
    collection: () => ({
      get: async () => ({
        docs: Object.entries(users).map(([id, data]) => ({
          id,
          data: () => data,
          ref: { set: async (value) => {
            writes[id] = value;
          } },
        })),
      }),
    }),
  };
};

test('automatic accounts take the latest rate; manual ones keep their own', async () => {
  const db = fakeUsersDb({
    newcomer: {},
    stale: { rateMode: 'auto', supplyRates: { generation: 6.4734, transmission: 1.2 }, ratesSourceMonth: '2026-08' },
    current: { rateMode: 'auto', supplyRates: { generation: 7.0739 }, ratesSourceMonth: '2026-09' },
    typedOwn: { rateMode: 'manual', supplyRates: { generation: 7.049 } },
  });

  const updated = await withServerTimestamp(() =>
    syncAutomaticRates(db, { billingMonth: '2026-09', generation: 7.0739 }));

  assert.equal(updated, 2);
  assert.deepEqual(Object.keys(db.writes).sort(), ['newcomer', 'stale']);
  assert.equal(db.writes.stale.supplyRates.generation, 7.0739);
  // The other Block 1 lines are kept, not reset to defaults.
  assert.equal(db.writes.stale.supplyRates.transmission, 1.2);
  assert.equal(db.writes.stale.rateMode, 'auto');
  assert.equal(db.writes.stale.ratesSourceMonth, '2026-09');
  assert.equal(db.writes.typedOwn, undefined, 'a typed rate is never overwritten');
});

test('the latest rate only ever moves forward', async () => {
  const docs = { 'pelco_rates/latest': { billingMonth: '2026-09', generation: 7.0739 } };
  const db = {
    doc: (path) => ({
      get: async () => ({ data: () => docs[path] }),
      set: async (value) => {
        docs[path] = value;
      },
    }),
  };

  // Only August came back this run: September stays latest.
  const kept = await refreshLatestRate(db, [{ billingMonth: '2026-08', generation: 6.4734 }]);
  assert.equal(kept.billingMonth, '2026-09');

  // October posted: it becomes latest.
  docs['pelco_rates/2026-10'] = { sourceUrl: 'https://www.pelco3.org/public/rates/1026.pdf' };
  const moved = await refreshLatestRate(db, [
    { billingMonth: '2026-09', generation: 7.0739 },
    { billingMonth: '2026-10', generation: 6.9 },
  ]);
  assert.equal(moved.billingMonth, '2026-10');
  assert.equal(docs['pelco_rates/latest'].generation, 6.9);
});
