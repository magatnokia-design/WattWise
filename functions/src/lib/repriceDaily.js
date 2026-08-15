const admin = require('firebase-admin');
const { calculatePelcoIIIBill } = require('./billing');

// Firestore caps a batch at 500 writes.
const MAX_ROWS = 400;

/**
 * A daily row is only rewritten if its stored bill charged the once-a-month
 * flats. Rows written since that fix record `includePeriodFlats: false` and are
 * left exactly as they are, which is what makes this safe to run repeatedly -
 * and safe to run on every nightly rollup, where it is a no-op after the first.
 *
 * Rows old enough to predate the flag entirely are treated as suspect: the flag
 * was added by the same change that stopped charging the flats, so its absence
 * dates the row to before the fix.
 */
const wasPricedWithPeriodFlats = (row = {}) => row?.bill?.includePeriodFlats !== false;

/**
 * The corrected money for one stored daily row. Returns null if the row is
 * already correct.
 *
 * Reprices from the row's own stored `totalEnergy` rather than re-deriving it
 * from history_logs. The energy is measured, already correct, and is what the
 * monthly invoice sums to price the month - re-deriving it from logs that may
 * have aged out would risk the one figure that was never wrong in order to fix
 * a cosmetic one.
 */
const repriceDailyRow = (row = {}, { userData = {} } = {}) => {
  if (!wasPricedWithPeriodFlats(row)) return null;

  const totalEnergy = Math.max(0, Number(row.totalEnergy) || 0);

  // Priced with the rates the row was priced with, not today's. This removes a
  // charge that should never have been on a day; it does not restate history at
  // whatever the account's rates happen to be now.
  const bill = calculatePelcoIIIBill(totalEnergy, {
    supplyRates: row.bill?.supplyRates || userData.supplyRates || null,
    profileId: row.bill?.rateProfileId || userData.rateProfileId || null,
    isLifeline: row.bill?.isLifeline === true,
    includePeriodFlats: false,
  });

  const cost = bill.totals.total;
  const outlet1Energy = Math.max(0, Number(row.outlet1Energy) || 0);

  // Same proportional split processDailyRollup uses, so a repriced day and a
  // freshly rolled-up one are costed identically.
  const outlet1Cost = totalEnergy > 0
    ? Number((cost * (outlet1Energy / totalEnergy)).toFixed(2))
    : 0;
  const outlet2Cost = totalEnergy > 0
    ? Number((cost - outlet1Cost).toFixed(2))
    : 0;

  const applianceBreakdown = Array.isArray(row.applianceBreakdown)
    ? row.applianceBreakdown.map((entry) => {
      const energy = Math.max(0, Number(entry?.energy) || 0);
      return {
        ...entry,
        cost: totalEnergy > 0 ? Number((cost * (energy / totalEnergy)).toFixed(2)) : 0,
      };
    })
    : row.applianceBreakdown;

  return {
    update: {
      cost,
      outlet1Cost,
      outlet2Cost,
      bill,
      applianceBreakdown,
      repricedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    change: {
      date: row.date || null,
      totalEnergy,
      previousCost: Number(row.cost) || 0,
      cost,
    },
  };
};

/**
 * Sweeps one user's daily rows and strips the monthly flat from any that still
 * carry it.
 *
 * Called from the nightly rollup as well as the callable, because a rollup only
 * ever runs once - for yesterday - so rows written before the fix would never
 * be revisited otherwise. After the first sweep this reads and writes nothing.
 */
const repriceUserDailyRows = async ({ db, userId, userData = {}, apply = false }) => {
  const snapshot = await db
    .collection(`users/${userId}/history_daily`)
    .orderBy('date')
    .limit(MAX_ROWS)
    .get();

  const batch = db.batch();
  const changes = [];

  snapshot.docs.forEach((doc) => {
    const result = repriceDailyRow(doc.data() || {}, { userData });
    if (!result) return;

    changes.push({ ...result.change, date: result.change.date || doc.id });
    if (apply) batch.update(doc.ref, result.update);
  });

  if (apply && changes.length > 0) {
    await batch.commit();
  }

  return { changes, scanned: snapshot.size };
};

module.exports = {
  wasPricedWithPeriodFlats,
  repriceDailyRow,
  repriceUserDailyRows,
  MAX_ROWS,
};
