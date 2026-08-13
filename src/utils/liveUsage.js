// Today's usage, computed live from the outlet documents.
//
// history_daily only gains a document when processDailyRollup runs at midnight
// Manila, so until then the app had nothing to show for the current day. The
// outlets already carry `energyTodayKwh`, accumulated by updateOutletMetrics on
// every telemetry post, so today can be assembled on the client in the same
// shape a rolled-up day uses and dropped into the same code paths.
import { calculatePelcoIIIBill, marginalRatePerKwh } from './billing';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const pad = (value) => String(value).padStart(2, '0');

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** YYYY-MM-DD for the Manila day a moment falls in, regardless of device zone. */
export const getManilaDateKey = (value = new Date()) => {
  const shifted = new Date(value.getTime() + MANILA_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

export const getDaysInManilaMonth = (dateKey) => {
  const [year, month] = String(dateKey).split('-').map(Number);
  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const resolveOutlet = (outlets, outletNumber) => {
  const list = Array.isArray(outlets) ? outlets : [];
  return list.find((outlet) => Number(outlet?.outletNumber) === outletNumber) || {};
};

/**
 * Energy an outlet has recorded for `dateKey`. Mirrors the server-side resolver:
 * the live accumulator and the closed-out previous day are two different slots,
 * and which one holds a given date depends on whether midnight has passed.
 */
const resolveOutletEnergyForDate = (outlet = {}, dateKey) => {
  if (String(outlet.energyPreviousDateKey || '') === dateKey) {
    return Math.max(0, toNumber(outlet.energyPreviousDayKwh));
  }

  if (String(outlet.energyDateKey || '') === dateKey) {
    return Math.max(0, toNumber(outlet.energyTodayKwh));
  }

  // Pre-migration documents have no day key; `energy` was the only figure.
  if (!outlet.energyDateKey && dateKey === getManilaDateKey()) {
    return Math.max(0, toNumber(outlet.energyTodayKwh ?? outlet.energy));
  }

  return 0;
};

const resolveApplianceName = (outlet = {}, outletNumber) => {
  const name = String(outlet.applianceName || '').trim();
  const fallback = `Outlet ${outletNumber}`;
  return name && name.toLowerCase() !== fallback.toLowerCase() ? name : fallback;
};

/**
 * Builds a history_daily-shaped entry for today from live outlet documents.
 * Returns null when nothing has been measured yet, so callers can simply skip it
 * rather than charting a zero row.
 */
export const buildLiveTodayEntry = (outlets, { rateProfileId = null, supplyRates = null } = {}) => {
  const dateKey = getManilaDateKey();
  const outlet1 = resolveOutlet(outlets, 1);
  const outlet2 = resolveOutlet(outlets, 2);

  const outlet1Energy = resolveOutletEnergyForDate(outlet1, dateKey);
  const outlet2Energy = resolveOutletEnergyForDate(outlet2, dateKey);
  const totalEnergy = outlet1Energy + outlet2Energy;

  if (totalEnergy <= 0) return null;

  // Marginal, exactly as processDailyRollup prices a closed day. A day is not a
  // billing period, so the once-a-month P5.00 metering charge has no business in
  // it - and with it included, a day on which almost nothing ran was costed at
  // P5.61 for 0.001 kWh, which reads as a billing fault rather than a fixed fee.
  // It also made today's live row and yesterday's stored row two different kinds
  // of number sitting in the same list.
  const bill = calculatePelcoIIIBill(totalEnergy, {
    date: new Date(),
    supplyRates,
    profileId: rateProfileId,
    includePeriodFlats: false,
    daysInPeriod: 1,
    billingDays: getDaysInManilaMonth(dateKey),
  });

  const cost = toNumber(bill?.totals?.total);
  // Same proportional split the nightly rollup uses, so a live day and a rolled
  // up day are costed identically.
  const outlet1Cost = Number((cost * (outlet1Energy / totalEnergy)).toFixed(2));
  const outlet2Cost = Number((cost - outlet1Cost).toFixed(2));

  const outlet1Name = resolveApplianceName(outlet1, 1);
  const outlet2Name = resolveApplianceName(outlet2, 2);

  const applianceBreakdown = [];
  const addAppliance = (name, energyKwh, appliedCost, outletNumber) => {
    if (energyKwh <= 0) return;

    const existing = applianceBreakdown.find((item) => item.applianceName === name);
    if (existing) {
      existing.energyKwh += energyKwh;
      existing.cost += appliedCost;
      if (!existing.outlets.includes(outletNumber)) existing.outlets.push(outletNumber);
      return;
    }

    applianceBreakdown.push({
      applianceName: name,
      energyKwh,
      cost: appliedCost,
      outlets: [outletNumber],
    });
  };

  addAppliance(outlet1Name, outlet1Energy, outlet1Cost, 1);
  addAppliance(outlet2Name, outlet2Energy, outlet2Cost, 2);

  return {
    id: dateKey,
    date: dateKey,
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
    peakPower: Math.max(toNumber(outlet1.power), toNumber(outlet2.power)),
    peakHour: null,
    // Marks the row as measured-so-far rather than a closed day.
    isLive: true,
  };
};

/**
 * Merges the live today entry into a rolled-up series, replacing any stored row
 * for the same date. Keeps ascending date order.
 */
export const withLiveToday = (entries, liveEntry) => {
  const list = Array.isArray(entries) ? entries : [];
  if (!liveEntry) return list;

  const merged = list.filter((entry) => entry?.date !== liveEntry.date);
  merged.push(liveEntry);
  return merged.sort((a, b) => String(a?.date).localeCompare(String(b?.date)));
};

/**
 * Per-appliance live state for the "right now" view: what is drawing power at
 * this moment, and what it has used today.
 */
export const buildLiveAppliances = (outlets, { rateProfileId = null, supplyRates = null } = {}) => {
  const dateKey = getManilaDateKey();

  return [1, 2].map((outletNumber) => {
    const outlet = resolveOutlet(outlets, outletNumber);
    const energyKwh = resolveOutletEnergyForDate(outlet, dateKey);
    const powerW = Math.max(0, toNumber(outlet.power));
    const isOn = String(outlet.status || '').trim().toLowerCase() === 'on';

    // One rate for both figures below, and it must be the marginal one. The old
    // line took `effectiveRate` from a bill computed on `Math.max(energy, 0.0001)`
    // - so on a fresh day it divided the full P5.60 of fixed charges by 0.0001 kWh
    // and priced the outlet at tens of thousands of pesos per kWh. That is what
    // put "P22.38/hr" under a 15.9 W lamp.
    const perKwhRate = marginalRatePerKwh({ supplyRates, profileId: rateProfileId });

    return {
      outletNumber,
      applianceName: resolveApplianceName(outlet, outletNumber),
      powerW,
      energyKwh,
      costToday: energyKwh * perKwhRate,
      costPerHour: (powerW / 1000) * perKwhRate,
      isOn,
      // Drawing power right now, as opposed to switched on with nothing plugged.
      isDrawing: isOn && powerW > 0.5,
    };
  });
};
