// PELCO III residential billing.
//
// Implements WATTWISE_PELCO3_BILLING_SPEC.md, derived from seven real bills.
// Deliberately duplicated in functions/src/lib/billing.js - keep both in sync.
//
// Structure: three charge blocks over one kWh figure for the whole period.
//   Block 1  Generation & Transmission  - user-entered, changes monthly
//   Block 2  Distribution               - ERC-approved constants
//   Block 3  Government charges         - constants + VAT
//
// The only non-linear item in the entire bill is the P5.00 metering rate.

const roundTo = (value, decimals = 2) => {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const roundCurrency = (value) => roundTo(value, 2);

// Rates as of this date; shown in the invoice footer.
export const RATE_EFFECTIVE_DATE = '2026-06';

// Block 2 - Distribution (ERC-approved, stable)
export const DISTRIBUTION_RATES = {
  distribution: 0.2748,
  supplySystem: 0.4140,
  meterSystem: 0.3460,
  rfsc: 0.1518,
  lifelineSubsidy: 0.0100,
};

// Charged once per billing period. Never per-kWh, never prorated by days:
// a 10-day period pays P5.00 and so does a 45-day one.
export const METERING_FLAT = 5.0;

// Block 3 - Universal charges
export const UNIVERSAL_RATES = {
  ucME: 0.2763,
  fitAll: 0.2011,
  ucStrandedDebt: 0.0428,
  geaAll: 0.0371,
  ucEC: 0.0025,
  ucStrandedCost: 0.0000,
};

export const VAT_RATE = 0.12;
// Supply-side EVAT (GENCO/TRANSCO/ANCILLARY/SYSGENCO/SYSTRANSCO). PELCO III does
// not publish a formula, so this is the single approximation in the model. It is
// a factor rather than fixed per-kWh rates so it tracks the generation rate the
// user enters instead of being pinned to one month's bill.
//
// Fitted to the two sample bills whose blocks reconcile exactly (94 kWh implies
// 11.91%, 216 kWh implies 11.82%); both land within PHP 1.00 at this value. The
// 116 and 135 kWh samples imply 11.26% and 10.89%, which contradict their own
// printed government totals - treat those two rows as bad data rather than
// re-fitting this constant to them.
export const EVAT_SUPPLY_FACTOR = 0.1187;

// VAT on distribution applies to Distribution + Supply System + Meter System and
// the metering flat. RFSC and Lifeline Subsidy are VAT-exempt.
const EVAT_DIST_BASE_PER_KWH =
  DISTRIBUTION_RATES.distribution + DISTRIBUTION_RATES.supplySystem + DISTRIBUTION_RATES.meterSystem;

export const DEFAULT_GEN_RATE_ADJ = -0.0306;

// Block 1 - user-entered generation & transmission rates. Defaults track the
// most recent sample bill; the user updates these monthly from rates.php.
export const DEFAULT_SUPPLY_RATES = {
  generation: 6.5269,
  generationRateAdj: DEFAULT_GEN_RATE_ADJ,
  transmission: 1.1136,
  transmissionCostAdj: 0,
  ancillary: 0,
  systemLoss: 0.5762,
  systemLossAdj: 0,
  transDemand: 0,
  transDemandAdj: 0,
  icera: 0,
  gram: 0,
};

const SUPPLY_LINES = [
  ['generation', 'Generation'],
  ['generationRateAdj', 'Gen. Rate Adj'],
  ['transmission', 'Transmission'],
  ['transmissionCostAdj', 'Trans. Cost Adj'],
  ['ancillary', 'Ancillary Charge'],
  ['systemLoss', 'System Loss'],
  ['systemLossAdj', 'System Loss Adj'],
  ['transDemand', 'Trans. Demand'],
  ['transDemandAdj', 'Trans. Demand Adj'],
  ['icera', 'ICERA'],
  ['gram', 'GRAM'],
];

// Block 1 in bill order, exported so the Settings editor renders one input per
// line without restating the list. `generation` is flagged primary: it is the
// only figure PELCO III publishes monthly on rates.php, and it swings ~18%
// while the rest sit at zero or barely move.
export const SUPPLY_RATE_FIELDS = SUPPLY_LINES.map(([key, label]) => ({
  key,
  label,
  defaultValue: toNumber(DEFAULT_SUPPLY_RATES[key]),
  primary: key === 'generation',
}));

/**
 * Fills missing lines from the defaults, so a partially saved object still
 * bills correctly rather than silently treating absent lines as zero.
 */
export const normalizeSupplyRates = (raw) => {
  const source = raw && typeof raw === 'object' ? raw : {};

  return SUPPLY_RATE_FIELDS.reduce((rates, field) => {
    const value = source[field.key];
    rates[field.key] = value === undefined || value === null || value === ''
      ? field.defaultValue
      : toNumber(value);
    return rates;
  }, {});
};

/** Block 1 total per kWh - the running sum the Settings editor previews live. */
export const sumSupplyRates = (raw) => {
  const rates = normalizeSupplyRates(raw);
  return roundTo(
    SUPPLY_RATE_FIELDS.reduce((total, field) => total + rates[field.key], 0),
    4
  );
};

/**
 * True when the user has actually entered their own Block 1 rates. Drives the
 * "using default rates" banner - a generation rate of 0 is not a real bill, so
 * anything falsy here means the app is estimating from stale seeded defaults.
 */
export const hasSupplyRates = (raw) =>
  Boolean(raw && typeof raw === 'object' && toNumber(raw.generation) > 0);

const UNIVERSAL_LINES = [
  ['ucME', 'UC-ME'],
  ['fitAll', 'FIT-ALL'],
  ['ucStrandedDebt', 'UC-Stranded Debt'],
  ['geaAll', 'GEA-ALL (Renewable)'],
  ['ucEC', 'UC-EC'],
  ['ucStrandedCost', 'UC-Stranded Cost'],
];

export const RATE_PROFILES = [
  {
    id: 'pelco-iii-default',
    name: 'PELCO III (current)',
    effectiveFrom: RATE_EFFECTIVE_DATE + '-01',
    supplyRates: DEFAULT_SUPPLY_RATES,
  },
];

const perKwhItem = (key, label, rate, kwh) => {
  const rateValue = toNumber(rate);
  if (rateValue === 0) return null;
  return { key, label, kind: 'perKwh', rate: rateValue, amount: roundCurrency(kwh * rateValue) };
};

const fixedItem = (key, label, amount) => {
  const base = toNumber(amount);
  if (base === 0) return null;
  return { key, label, kind: 'fixed', rate: base, amount: roundCurrency(base) };
};

const sumItems = (items) => roundCurrency(items.reduce((sum, item) => sum + item.amount, 0));

const resolveSupplyRates = ({ supplyRates, profileId, profiles }) => {
  if (supplyRates) return { id: 'custom', name: 'Custom rates', rates: supplyRates };

  const pool = Array.isArray(profiles) && profiles.length > 0 ? profiles : RATE_PROFILES;
  const profile = (profileId && pool.find((entry) => entry.id === profileId)) || pool[0];

  return {
    id: profile.id,
    name: profile.name,
    rates: profile.supplyRates || DEFAULT_SUPPLY_RATES,
  };
};

/**
 * @param {number} kwh Energy for the WHOLE billing period. Rates are averaged
 *   monthly by PELCO III and applied uniformly, so never bill per-day and sum.
 * @param {object} options
 * @param {object} [options.supplyRates] Block 1 rates; falls back to the profile.
 * @param {boolean} [options.isLifeline] Zeroes the lifeline subsidy line.
 * @param {boolean} [options.includePeriodFlats=true] Set false for a marginal
 *   estimate (e.g. today's usage) so the once-per-period P5.00 is not counted
 *   again on every partial view.
 */
export const calculatePelcoIIIBill = (
  kwh,
  {
    supplyRates = null,
    profiles = null,
    profileId = null,
    isLifeline = false,
    includePeriodFlats = true,
    // `date`, `daysInPeriod` and `billingDays` may still be passed by existing
    // call sites. They are intentionally ignored: PELCO III applies one averaged
    // rate uniformly across the period, so nothing here is prorated by days.
  } = {}
) => {
  const usage = Math.max(0, toNumber(kwh));
  const resolved = resolveSupplyRates({ supplyRates, profileId, profiles });
  const rates = resolved.rates || DEFAULT_SUPPLY_RATES;

  // Block 1 - Generation & Transmission
  const generationTransmission = SUPPLY_LINES
    .map(([key, label]) => perKwhItem(key, label, rates[key], usage))
    .filter(Boolean);
  const genTransRate = SUPPLY_LINES.reduce((sum, [key]) => sum + toNumber(rates[key]), 0);
  const genTransTotal = roundCurrency(usage * genTransRate);

  // Block 2 - Distribution
  const distribution = [
    perKwhItem('distribution', 'Distribution', DISTRIBUTION_RATES.distribution, usage),
    perKwhItem('supplySystem', 'Supply System', DISTRIBUTION_RATES.supplySystem, usage),
    perKwhItem('meterSystem', 'Meter System', DISTRIBUTION_RATES.meterSystem, usage),
    perKwhItem('rfsc', 'RFSC', DISTRIBUTION_RATES.rfsc, usage),
    isLifeline
      ? null
      : perKwhItem('lifelineSubsidy', 'Lifeline Subsidy', DISTRIBUTION_RATES.lifelineSubsidy, usage),
    includePeriodFlats ? fixedItem('meteringRate', 'Metering Rate', METERING_FLAT) : null,
  ].filter(Boolean);

  // Block 3 - Government charges
  const meteringInBase = includePeriodFlats ? METERING_FLAT : 0;
  const evatDistribution = roundCurrency(
    ((usage * EVAT_DIST_BASE_PER_KWH) + meteringInBase) * VAT_RATE
  );
  const evatSupply = roundCurrency(genTransTotal * EVAT_SUPPLY_FACTOR);

  const government = [
    ...UNIVERSAL_LINES
      .map(([key, label]) => perKwhItem(key, label, UNIVERSAL_RATES[key], usage))
      .filter(Boolean),
    evatSupply !== 0
      ? { key: 'evatSupply', label: 'EVAT on Gen/Trans', kind: 'derived', rate: EVAT_SUPPLY_FACTOR, amount: evatSupply }
      : null,
    evatDistribution !== 0
      ? { key: 'evatDistribution', label: 'EVAT on Distribution', kind: 'derived', rate: VAT_RATE, amount: evatDistribution }
      : null,
  ].filter(Boolean);

  const totals = {
    generationTransmission: genTransTotal,
    distribution: sumItems(distribution),
    government: sumItems(government),
    other: 0,
  };

  totals.total = roundCurrency(
    totals.generationTransmission + totals.distribution + totals.government
  );

  return {
    kwh: usage,
    rateProfileId: resolved.id,
    rateProfileName: resolved.name,
    rateEffectiveDate: RATE_EFFECTIVE_DATE,
    supplyRatePerKwh: roundTo(genTransRate, 4),
    isLifeline: !!isLifeline,
    includePeriodFlats,
    items: {
      generationTransmission,
      distribution,
      government,
      // Retained so existing consumers of `items.otherCharges` keep working.
      otherCharges: [],
    },
    totals,
    effectiveRate: usage > 0 ? roundTo(totals.total / usage, 4) : 0,
  };
};
