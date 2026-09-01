/**
 * The per-appliance view of a month, built the one way the project has settled
 * on: energy is credited to the name the outlet carried on the day it was
 * measured, read out of the `applianceBreakdown` array `processDailyRollup`
 * writes onto each `history_daily` document.
 *
 * This file exists because three surfaces were answering "where did the energy
 * go?" and only two of them agreed. The emailed statement rolls up the daily
 * breakdown; the Analytics screen rolls up the daily breakdown; Compare Usage
 * summed `outlet1Energy` / `outlet2Energy` and labelled the two figures with
 * whatever name each outlet held on the LAST recorded day. So August 2026 came
 * out as six appliances on the PDF and two in the app, off the same 7.24 kWh,
 * and renaming an appliance silently rewrote the whole month on one surface
 * while splitting it in two on the other.
 *
 * The per-day rule is the correct one - it is the only attribution that
 * survives a rename - so it lives here once and every client reads it from
 * here. The backend's copy is `functions/src/lib/invoice.js` (aggregation) and
 * `functions/src/lib/invoicePdf.js` (folding); keep the three in step for the
 * same reason `billing.js` is kept in step, and for higher stakes: this is what
 * the statement in a user's inbox says.
 *
 * Outlet totals are not wrong and have not gone away. They answer a different
 * question - which of the two physical outlets - and both blocks now say which
 * question they are answering.
 */

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Six named rows, matching the statement. Beyond that the block stops being a
 * breakdown and starts being a list.
 */
export const APPLIANCE_ROW_LIMIT = 6;

/**
 * Rolls the per-day `applianceBreakdown` arrays into one list for the range,
 * largest consumer first.
 *
 * A day with no breakdown contributes nothing rather than a zero row, and a
 * nameless or zero-energy entry is dropped - it would print as "0.00 kWh"
 * under a blank label and explain nothing.
 *
 * @param {Array} entries `history_daily` documents.
 * @returns {Array<{applianceName: string, energyKwh: number, cost: number}>}
 */
export const aggregateApplianceUsage = (entries) => {
  const totals = new Map();

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const breakdown = Array.isArray(entry?.applianceBreakdown) ? entry.applianceBreakdown : [];

    breakdown.forEach((item) => {
      const name = String(item?.applianceName || '').trim();
      const energyKwh = toNumber(item?.energyKwh);
      if (!name || energyKwh <= 0) return;

      const existing = totals.get(name) || { applianceName: name, energyKwh: 0, cost: 0 };
      existing.energyKwh += energyKwh;
      existing.cost += toNumber(item?.cost);
      totals.set(name, existing);
    });
  });

  return Array.from(totals.values()).sort((a, b) => b.energyKwh - a.energyKwh);
};

/**
 * Caps the list at `APPLIANCE_ROW_LIMIT` named rows and folds everything below
 * into one "Other" row.
 *
 * The residual is summed **from the tail itself**, never as `total - shown`, so
 * the block can only ever restate figures that exist. A bare `slice(0, 6)` is
 * what put six rows summing to 6.72 of 7.24 kWh - and percentages summing to
 * 92% - on a statement that went to a real inbox.
 *
 * Mirrors `foldApplianceRows` in `functions/src/lib/invoicePdf.js`.
 *
 * @param {Array} breakdown Rows from `aggregateApplianceUsage`, largest first.
 * @param {number} [limit] Named rows to keep before folding.
 */
export const foldApplianceRows = (breakdown, limit = APPLIANCE_ROW_LIMIT) => {
  const all = Array.isArray(breakdown) ? breakdown : [];
  const named = all.slice(0, limit);
  const tail = all.slice(limit);

  const tailKwh = tail.reduce((sum, item) => sum + toNumber(item?.energyKwh), 0);
  const tailCost = tail.reduce((sum, item) => sum + toNumber(item?.cost), 0);

  // Below a hundredth of a kWh the row would print as "0.00 kWh" and add a
  // line that explains nothing.
  if (tailKwh <= 0.004) return named;

  return [...named, {
    applianceName: tail.length === 1
      ? tail[0].applianceName
      : `Other (${tail.length} appliances)`,
    energyKwh: tailKwh,
    cost: tailCost,
  }];
};
