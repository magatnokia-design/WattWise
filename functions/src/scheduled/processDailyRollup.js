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
const { resolveEnergyForDate, resolvePeakForDate } = require('../lib/energyAccounting');
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
 * Rewrites `budget/{month}` from that month's daily documents.
 *
 * Recomputed from the daily documents rather than added to a running total:
 * accumulating made a retry or a re-run double-count, and left no way to
 * correct a bad day once it had landed. Because it is a full recomputation,
 * calling it again is always safe and always self-correcting - one run repairs
 * a month however it came to be wrong.
 *
 * The month is priced in a single call. Summing each day's bill counted
 * METERING_FLAT - documented in billing.js as "once per billing period, never
 * prorated by days" - on every single day, since calculatePelcoIIIBill
 * deliberately ignores `daysInPeriod`. A 31-day month reported PHP 173.60 of
 * metering where the correct figure is PHP 5.60.
 *
 * That inflation burned the budget alert thresholds on the first rolled-up day
 * and left this number permanently at odds with the invoice, which has always
 * priced the month in one go. Doing the same here makes the Budget and Billing
 * screens agree by construction rather than by coincidence.
 *
 * Extracted so it can be run on demand as well as nightly: a corrected month
 * should not have to wait for the next midnight to appear.
 */
async function recomputeMonthlyBudget({ db, userId, monthString, userData = {} }) {
  const monthlySnapshot = await db
    .collection(`users/${userId}/history_daily`)
    .where('date', '>=', `${monthString}-01`)
    .where('date', '<=', `${monthString}-31`)
    .get();

  let monthEnergy = 0;
  let monthOutlet1Energy = 0;

  monthlySnapshot.forEach((dayDoc) => {
    const day = dayDoc.data() || {};
    monthEnergy += Number(day.totalEnergy) || 0;
    monthOutlet1Energy += Number(day.outlet1Energy) || 0;
  });

  const monthBill = calculatePelcoIIIBill(monthEnergy, {
    supplyRates: userData.supplyRates || null,
    profileId: userData.rateProfileId || null,
  });

  const currentSpending = monthBill.totals.total;

  // Split by each outlet's share of the month's energy, mirroring how the daily
  // figures are split. Costing each outlet separately would charge the fixed
  // component twice. Outlet 2 is the remainder so the parts sum to the total.
  const outlet1Spending = monthEnergy > 0
    ? Number((currentSpending * (monthOutlet1Energy / monthEnergy)).toFixed(2))
    : 0;
  const outlet2Spending = monthEnergy > 0
    ? Number((currentSpending - outlet1Spending).toFixed(2))
    : 0;

  await db.doc(`users/${userId}/budget/${monthString}`).set({
    month: monthString,
    currentSpending: Number(currentSpending.toFixed(2)),
    outlet1Spending: Number(outlet1Spending.toFixed(2)),
    outlet2Spending: Number(outlet2Spending.toFixed(2)),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    monthString,
    days: monthlySnapshot.size,
    totalKwh: Number(monthEnergy.toFixed(3)),
    currentSpending: Number(currentSpending.toFixed(2)),
  };
}

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

        // The day's peak draw, measured across every telemetry sample by
        // updateOutletMetrics rather than reconstructed here.
        let peakPower = 0;
        let peakHour = 0;

        for (const outletDoc of [outlet1Doc, outlet2Doc]) {
          const peak = resolvePeakForDate(
            outletDoc.exists ? outletDoc.data() : {},
            dateString
          );
          if (peak.powerW > peakPower) {
            peakPower = peak.powerW;
            // Reported to the user as a Manila hour, so convert from the UTC clock.
            peakHour = peak.atMs ? getManilaHour(new Date(peak.atMs)) : 0;
          }
        }

        // Event logs record the draw at the instant something happened - a
        // toggle, a schedule, a cutoff - so they are a poor peak on their own and
        // used to be the only source. Kept as a floor: they are still real
        // readings, and for any day that ended before telemetry began tracking a
        // peak they are the only evidence left.
        logsSnapshot.forEach((logDoc) => {
          const logData = logDoc.data();
          if (logData.power > peakPower) {
            peakPower = logData.power;
            const timestamp = logData.timestamp?.toDate() || new Date();
            peakHour = getManilaHour(timestamp);
          }
        });

        const billingDays = getDaysInManilaMonth(dateString);
        const daysInPeriod = 1;
        const bill = calculatePelcoIIIBill(totalEnergy, {
          date: rateLookupDate,
          // Without this the day was priced at the seeded defaults while the
          // dashboard priced the same energy at the user's own rates, so budget
          // spending and the live cost estimate disagreed.
          supplyRates: userData.supplyRates || null,
          profileId: userData.rateProfileId || null,
          // A day is not a billing period. The P5.00 metering charge is levied
          // once a month, and including it here billed it again every single
          // day: a day with 0.07 kWh of actual usage cost P6.36, of which P5.60
          // was the fee and 76 centavos was the electricity. Summed over three
          // days, History showed P19.58 against a true P8.69 - and a day with
          // nothing plugged in still produced a bill, which is what made it
          // visible.
          //
          // Marginal cost is what a per-day figure can honestly mean. Whoever
          // needs the real monthly total computes it from the month's total
          // energy, the way recomputeMonthlyBudget already does - never by
          // summing these.
          includePeriodFlats: false,
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

        await recomputeMonthlyBudget({ db, userId, monthString, userData });

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

module.exports = { processDailyRollup, recomputeMonthlyBudget };