/**
 * What running an appliance costs, for the Appliance costs screen's per-hour
 * figures and its "what would it cost?" calculator (Oct 2026).
 *
 * Two inputs the user's idea started from - the appliance's power and PELCO
 * III's rate - plus the one that decides a monthly figure: how long it runs.
 *
 * The rate is the MARGINAL rate (`marginalRatePerKwh` in billing.js): every
 * per-kWh line of the tariff with VAT, and none of the once-a-month fixed
 * charges. Not PELCO's generation rate alone, which is about half of what a
 * kWh actually costs, and never the period's effective rate, which smears the
 * fixed charges over whatever energy exists so far and once priced a 15.9 W
 * lamp at P89.20 an hour.
 *
 * Everything here is a projection. It is display only: nothing billed,
 * budgeted or cut off may read it, for the same reason the appliance name it
 * hangs off may not (CLAUDE.md).
 *
 * Copy rule: byte-identical in the web repo.
 */

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Pesos for one hour at `watts`. */
export const costPerHour = (watts, ratePerKwh) =>
  (Math.max(0, toNumber(watts)) / 1000) * Math.max(0, toNumber(ratePerKwh));

/**
 * Per hour, per day and per month for one appliance.
 *
 * Inputs are bounded rather than trusted: a day has 24 hours and a month 31
 * days, and a typed "100" in either is a slip, not a plan.
 *
 * @param {object} input
 * @param {number} input.watts Draw while running.
 * @param {number} input.hoursPerDay Hours it runs on a day it is used.
 * @param {number} input.daysPerMonth Days a month it is used.
 * @param {number} input.ratePerKwh From `marginalRatePerKwh`.
 */
export const projectApplianceCost = ({
  watts,
  hoursPerDay,
  daysPerMonth,
  ratePerKwh,
}) => {
  const hours = Math.min(24, Math.max(0, toNumber(hoursPerDay)));
  const days = Math.min(31, Math.max(0, toNumber(daysPerMonth)));
  const perHour = costPerHour(watts, ratePerKwh);
  const kWhPerDay = (Math.max(0, toNumber(watts)) / 1000) * hours;

  return {
    perHour,
    perDay: perHour * hours,
    perMonth: perHour * hours * days,
    kWhPerMonth: kWhPerDay * days,
    hours,
    days,
  };
};

/**
 * The draw to show for a saved appliance, as a range when its saved power
 * patterns disagree enough to matter.
 *
 * A saved appliance can hold up to four patterns (a fan's speeds, a charger's
 * taper). One mean would be a number the appliance may never actually draw - a
 * phone charging from ~30 W down to ~8 W averages 21 W - so a spread of more
 * than 15% reads as a range and the calculator says so.
 *
 * @returns {{watts: number, minWatts: number, maxWatts: number, varies: boolean}}
 */
export const describeApplianceDraw = (appliance = {}) => {
  const watts = Math.max(0, toNumber(appliance.meanPower));
  const minWatts = Math.max(0, toNumber(appliance.minPower ?? watts)) || watts;
  const maxWatts = Math.max(minWatts, toNumber(appliance.maxPower ?? watts));
  const varies = maxWatts > 0 && (maxWatts - minWatts) / maxWatts > 0.15;

  return { watts, minWatts, maxWatts, varies };
};

/** Hours, compactly: "45 min", "6.2 h". */
export const formatHours = (hours) => {
  const value = Math.max(0, toNumber(hours));
  if (value < 1) return `${Math.round(value * 60)} min`;
  return `${value.toFixed(1)} h`;
};
