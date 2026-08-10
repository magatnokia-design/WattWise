const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { calculatePelcoIIIBill } = require('../lib/billing');
const {
  getManilaHour,
  getManilaDateKey,
  getManilaDayBounds,
  getManilaPreviousDateKey,
  getDaysInManilaMonth,
} = require('../lib/manilaTime');
const { resolveEnergyForDate } = require('../lib/energyAccounting');
const { upsertInvoice } = require('./processMonthlyInvoice');

const upsertApplianceBreakdown = (items, applianceName, energyKwh, cost, outletNumber) => {
  const normalizedName = String(applianceName || '').trim();
  if (!normalizedName || energyKwh <= 0) return;

  const existing = items.find((item) => item.applianceName === normalizedName);
  if (existing) {
    existing.energyKwh += energyKwh;
    existing.cost += cost;
    if (!existing.outlets.includes(outletNumber)) {
      existing.outlets.push(outletNumber);
    }
    return;
  }

  items.push({
    applianceName: normalizedName,
    energyKwh,
    cost,
    outlets: [outletNumber],
  });
};

/**
 * Scheduled function: Runs daily at midnight (00:00)
 * Aggregates previous day's energy usage
 * Creates history_daily document
 * Updates monthly budget spending
 */
async function processDailyRollup() {
  try {
    const db = admin.firestore();
    // The cron fires at midnight Manila, which is 16:00 UTC the previous day.
    // Deriving the window from the UTC clock rolled up the wrong 24 hours and
    // labelled the document with the wrong date, so resolve it in Manila terms.
    const dateString = getManilaPreviousDateKey(new Date()); // YYYY-MM-DD
    const monthString = dateString.substring(0, 7); // YYYY-MM

    const bounds = getManilaDayBounds(dateString);
    if (!bounds) {
      logger.error('Could not resolve Manila day bounds for rollup', { dateString });
      return { success: false };
    }

    const yesterday = bounds.start;
    const yesterdayEnd = bounds.end;
    // Midday of the Manila day, used only for rate-profile selection so the
    // lookup cannot land on the neighbouring date when normalised in UTC.
    const rateLookupDate = new Date(bounds.start.getTime() + (12 * 60 * 60 * 1000));

    logger.info('Starting daily rollup', { date: dateString });

    // Get all users
    const usersSnapshot = await db.collection('users').get();

    const promises = usersSnapshot.docs.map(async (userDoc) => {
      const userId = userDoc.id;
      const userData = userDoc.data();

      try {
        // Get all activity logs for yesterday
        const logsSnapshot = await db
          .collection(`users/${userId}/history_logs`)
          .where('timestamp', '>=', yesterday)
          .where('timestamp', '<=', yesterdayEnd)
          .get();

        // Get outlet energy readings
        const outlet1Doc = await db.doc(`users/${userId}/outlets/outlet1`).get();
        const outlet2Doc = await db.doc(`users/${userId}/outlets/outlet2`).get();

        // Energy attributable to the day being rolled up. The device reports a
        // lifetime counter, so the per-day figure is the one accumulated by
        // updateOutletMetrics - never the raw meter reading.
        const outlet1Energy = resolveEnergyForDate(
          outlet1Doc.exists ? outlet1Doc.data() : {},
          dateString
        );
        const outlet2Energy = resolveEnergyForDate(
          outlet2Doc.exists ? outlet2Doc.data() : {},
          dateString
        );
        const totalEnergy = outlet1Energy + outlet2Energy;
        const outlet1Name = outlet1Doc.exists
          ? String(outlet1Doc.data().applianceName || 'Outlet 1').trim()
          : 'Outlet 1';
        const outlet2Name = outlet2Doc.exists
          ? String(outlet2Doc.data().applianceName || 'Outlet 2').trim()
          : 'Outlet 2';

        // Calculate peak power from logs
        let peakPower = 0;
        let peakHour = 0;

        logsSnapshot.forEach((logDoc) => {
          const logData = logDoc.data();
          if (logData.power > peakPower) {
            peakPower = logData.power;
            const timestamp = logData.timestamp?.toDate() || new Date();
            // Reported to the user as a Manila hour, so convert from the UTC clock.
            peakHour = getManilaHour(timestamp);
          }
        });

        const billingDays = getDaysInManilaMonth(dateString);
        const daysInPeriod = 1;
        const bill = calculatePelcoIIIBill(totalEnergy, {
          date: rateLookupDate,
          profileId: userData.rateProfileId || null,
          daysInPeriod,
          billingDays,
        });

        // Calculate cost (PELCO III bill model)
        const cost = bill.totals.total;
        // Split the bill by each outlet's share of the day's energy so the parts
        // add up to the total. Costing each outlet at the effective rate did not:
        // the tariff's fixed charges were counted twice, once per outlet.
        const outlet1Cost = totalEnergy > 0
          ? Number((cost * (outlet1Energy / totalEnergy)).toFixed(2))
          : 0;
        const outlet2Cost = totalEnergy > 0
          ? Number((cost - outlet1Cost).toFixed(2))
          : 0;

        const applianceBreakdown = [];
        upsertApplianceBreakdown(applianceBreakdown, outlet1Name, outlet1Energy, outlet1Cost, 1);
        upsertApplianceBreakdown(applianceBreakdown, outlet2Name, outlet2Energy, outlet2Cost, 2);

        // Create history_daily document
        const dailyRef = db.doc(`users/${userId}/history_daily/${dateString}`);
        await dailyRef.set({
          date: dateString,
          outlet1Energy,
          outlet2Energy,
          outlet1Name,
          outlet2Name,
          outlet1Cost,
          outlet2Cost,
          totalEnergy,
          cost,
          bill,
          applianceBreakdown,
          peakPower,
          peakHour,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Recompute the month from its daily documents rather than adding to a
        // running total. Accumulating made a retry or a re-run double-count, and
        // there was no way to correct a bad day once it landed.
        const monthlySnapshot = await db
          .collection(`users/${userId}/history_daily`)
          .where('date', '>=', `${monthString}-01`)
          .where('date', '<=', `${monthString}-31`)
          .get();

        let currentSpending = 0;
        let outlet1Spending = 0;
        let outlet2Spending = 0;

        monthlySnapshot.forEach((dayDoc) => {
          const day = dayDoc.data() || {};
          currentSpending += Number(day.cost) || 0;
          outlet1Spending += Number(day.outlet1Cost) || 0;
          outlet2Spending += Number(day.outlet2Cost) || 0;
        });

        await db.doc(`users/${userId}/budget/${monthString}`).set({
          month: monthString,
          currentSpending: Number(currentSpending.toFixed(2)),
          outlet1Spending: Number(outlet1Spending.toFixed(2)),
          outlet2Spending: Number(outlet2Spending.toFixed(2)),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // The daily counters are not reset here. updateOutletMetrics rolls them
        // over on the first sample of a new Manila day, and a reset written here
        // was overwritten by the next telemetry post seconds later anyway.

        // Keep the open period's DRAFT invoice in step with the day just rolled
        // up, so the Billing screen reflects it without waiting for month end.
        try {
          await upsertInvoice({
            db,
            userId,
            billingMonth: monthString,
            todayKey: getManilaDateKey(new Date()),
            isLifeline: userData?.isLifeline === true,
            userRates: userData?.supplyRates || null,
          });
        } catch (invoiceError) {
          logger.warn('Daily rollup completed but invoice refresh failed', {
            userId,
            monthString,
            message: invoiceError?.message,
          });
        }

        logger.info('Daily rollup completed for user', {
          userId,
          totalEnergy,
          cost
        });

      } catch (userError) {
        logger.error('Error processing user rollup', { userId, error: userError });
      }
    });

    await Promise.all(promises);

    logger.info('Daily rollup completed for all users');
    return { success: true, processedUsers: usersSnapshot.size };

  } catch (error) {
    logger.error('Error in daily rollup:', error);
    throw error;
  }
}

module.exports = { processDailyRollup };