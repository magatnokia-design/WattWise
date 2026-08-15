const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { HttpsError } = require('firebase-functions/v2/https');
const { calculatePelcoIIIBill } = require('../lib/billing');

// Firestore caps a batch at 500 writes; a month of days is nowhere near it, but
// the query below is not bounded to one month.
const MAX_ROWS = 400;

/**
 * A daily row is only rewritten if its stored bill charged the once-a-month
 * flats. Rows written since that fix record `includePeriodFlats: false` and are
 * left exactly as they are, which is what makes this safe to run repeatedly.
 *
 * Rows old enough to predate the flag entirely are treated as suspect: the flag
 * was added in the same change that stopped charging the flats, so its absence
 * means the row was priced before the fix.
 */
const wasPricedWithPeriodFlats = (row = {}) => row?.bill?.includePeriodFlats !== false;

/**
 * Reprices stored daily rollups without touching their energy.
 *
 * A day is not a billing period. Before that was fixed, every daily row carried
 * the P5.00 metering charge plus VAT, so a day with 0.07 kWh of electricity was
 * recorded at P6.25 - of which P5.60 was a monthly fee charged again. The fix
 * landed in processDailyRollup on 12 Aug 2026 and rows from then on are correct;
 * the ones written before it stayed wrong, because a rollup only ever runs once,
 * for yesterday.
 *
 * Deliberately reprices from the row's own stored `totalEnergy` rather than
 * re-running the rollup from history_logs. The energy is measured, already
 * correct, and is what the monthly invoice sums to price the month - re-deriving
 * it from logs that may have aged out would put the one figure that was never
 * wrong at risk in order to fix a cosmetic one.
 */
async function repriceDailyRollups(request) {
  try {
    const { auth, data } = request || {};

    if (!auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    // Defaults to reporting what it would change. Repricing is idempotent, but
    // a caller should be able to see the damage before committing to it.
    const apply = data?.apply === true;

    const db = admin.firestore();
    const userId = auth.uid;

    const snapshot = await db
      .collection(`users/${userId}/history_daily`)
      .orderBy('date')
      .limit(MAX_ROWS)
      .get();

    const userDoc = await db.doc(`users/${userId}`).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const batch = db.batch();
    const changes = [];

    snapshot.docs.forEach((doc) => {
      const row = doc.data() || {};
      if (!wasPricedWithPeriodFlats(row)) return;

      const totalEnergy = Math.max(0, Number(row.totalEnergy) || 0);

      // Priced with the rates the row was priced with, not today's. Repricing is
      // meant to remove a charge that should never have been on a day, not to
      // restate history at whatever the account's rates happen to be now.
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
            cost: totalEnergy > 0
              ? Number((cost * (energy / totalEnergy)).toFixed(2))
              : 0,
          };
        })
        : row.applianceBreakdown;

      changes.push({
        date: row.date || doc.id,
        totalEnergy,
        previousCost: Number(row.cost) || 0,
        cost,
      });

      if (apply) {
        batch.update(doc.ref, {
          cost,
          outlet1Cost,
          outlet2Cost,
          bill,
          applianceBreakdown,
          repricedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    if (apply && changes.length > 0) {
      await batch.commit();
      logger.info('Repriced daily rollups', { userId, count: changes.length });
    }

    return {
      success: true,
      applied: apply,
      count: changes.length,
      scanned: snapshot.size,
      changes,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('repriceDailyRollups failed', error);
    throw new HttpsError('internal', 'Could not reprice daily rollups');
  }
}

module.exports = { repriceDailyRollups, wasPricedWithPeriodFlats };
