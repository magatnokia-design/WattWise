const roundTo = (value, decimals = 2) => {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const roundCurrency = (value) => roundTo(value, 2);

const buildPerKwhItem = (key, label, rate, kwh) => {
  const rateValue = toNumber(rate);
  if (rateValue === 0) return null;

  return {
    key,
    label,
    kind: 'perKwh',
    rate: rateValue,
    amount: roundCurrency(kwh * rateValue),
  };
};

const buildFixedItem = (key, label, amount, proration) => {
  const base = toNumber(amount);
  if (base === 0) return null;

  return {
    key,
    label,
    kind: 'fixed',
    rate: base,
    amount: roundCurrency(base * proration),
  };
};

const sumItems = (items) => {
  return roundCurrency(items.reduce((sum, item) => sum + item.amount, 0));
};

const resolveProration = (daysInPeriod, billingDays) => {
  const periodDays = Math.max(0, toNumber(daysInPeriod));
  const totalDays = Math.max(0, toNumber(billingDays));

  if (!periodDays) return 0;
  if (!totalDays) return 1;
  return Math.min(1, periodDays / totalDays);
};

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Rates sourced from PELCO III April 2026 bill (216 kWh sample).
export const PELCO_III_RATES_2026_04 = {
  referenceRate: 10.2745,
  perKwh: {
    generation: 5.5924,
    generationRateAdj: -0.0306,
    transmission: 1.5257,
    transmissionCostAdj: 0,
    systemLoss: 0.5301,
    distribution: 0.2748,
    supplySystem: 0.414,
    meteringSystem: 0.346,
    rfs: 0.1518,
    lifelineRateAdj: 0.01,
    evatGenCo: 0.6645,
    evatTransCo: 0.1724,
    evatDistribution: 0.12694,
    evatSystemGenCo: 0.05,
    evatSystemTransCo: 0.0136,
    ucME: 0.2763,
    ucEC: 0.0025,
    ucStrandedCost: 0.2011,
    fitAll: 0.0371,
    geAll: 0.0428,
  },
  fixed: {
    meteringRate: 5.0,
    otherNonTaxable: 147.65,
  },
};

export const RATE_PROFILES = [
  {
    id: 'pelco-iii-2026-04',
    name: 'PELCO III Apr 2026',
    effectiveFrom: '2026-04-21',
    rates: PELCO_III_RATES_2026_04,
  },
];

const resolveRateProfile = ({ date, profileId, profiles, rates }) => {
  if (rates) {
    return {
      id: 'custom',
      name: 'Custom Rate',
      effectiveFrom: null,
      rates,
    };
  }

  const pool = Array.isArray(profiles) && profiles.length > 0
    ? profiles
    : RATE_PROFILES;

  if (profileId) {
    return pool.find((profile) => profile.id === profileId) || pool[0];
  }

  const targetDate = normalizeDate(date);
  if (!targetDate) return pool[0];

  const candidates = pool
    .filter((profile) => profile.effectiveFrom)
    .filter((profile) => normalizeDate(profile.effectiveFrom) <= targetDate)
    .sort((a, b) => normalizeDate(a.effectiveFrom) - normalizeDate(b.effectiveFrom));

  return candidates.length ? candidates[candidates.length - 1] : pool[0];
};

export const calculatePelcoIIIBill = (
  kwh,
  {
    rates = null,
    profiles = null,
    profileId = null,
    date = null,
    daysInPeriod = null,
    billingDays = null,
  } = {}
) => {
  const usage = Math.max(0, toNumber(kwh));
  const resolvedProfile = resolveRateProfile({ date, profileId, profiles, rates });
  const activeRates = resolvedProfile.rates || PELCO_III_RATES_2026_04;
  const proration = resolveProration(daysInPeriod, billingDays);
  const perKwh = activeRates.perKwh || {};
  const fixed = activeRates.fixed || {};

  const generationTransmission = [];
  const distribution = [];
  const government = [];
  const otherCharges = [];

  const addItem = (bucket, item) => {
    if (item) bucket.push(item);
  };

  addItem(
    generationTransmission,
    buildPerKwhItem('generation', 'Generation', perKwh.generation, usage)
  );
  addItem(
    generationTransmission,
    buildPerKwhItem(
      'generationRateAdj',
      'Generation Rate Adjustment',
      perKwh.generationRateAdj,
      usage
    )
  );
  addItem(
    generationTransmission,
    buildPerKwhItem('transmission', 'Transmission', perKwh.transmission, usage)
  );
  addItem(
    generationTransmission,
    buildPerKwhItem(
      'transmissionCostAdj',
      'Transmission Cost Adjustment',
      perKwh.transmissionCostAdj,
      usage
    )
  );
  addItem(
    generationTransmission,
    buildPerKwhItem('systemLoss', 'System Loss', perKwh.systemLoss, usage)
  );

  addItem(
    distribution,
    buildPerKwhItem('distribution', 'Distribution', perKwh.distribution, usage)
  );
  addItem(
    distribution,
    buildPerKwhItem('supplySystem', 'Supply System', perKwh.supplySystem, usage)
  );
  addItem(
    distribution,
    buildPerKwhItem('meteringSystem', 'Metering System', perKwh.meteringSystem, usage)
  );
  addItem(distribution, buildPerKwhItem('rfs', 'RFS', perKwh.rfs, usage));
  addItem(
    distribution,
    buildPerKwhItem(
      'lifelineRateAdj',
      'Lifeline Rate Adjustment',
      perKwh.lifelineRateAdj,
      usage
    )
  );
  addItem(
    distribution,
    buildFixedItem('meteringRate', 'Metering Rate', fixed.meteringRate, proration)
  );

  addItem(
    government,
    buildPerKwhItem('evatGenCo', 'EVAT GenCo', perKwh.evatGenCo, usage)
  );
  addItem(
    government,
    buildPerKwhItem('evatTransCo', 'EVAT TransCo', perKwh.evatTransCo, usage)
  );
  addItem(
    government,
    buildPerKwhItem(
      'evatDistribution',
      'EVAT Distribution',
      perKwh.evatDistribution,
      usage
    )
  );
  addItem(
    government,
    buildPerKwhItem(
      'evatSystemGenCo',
      'EVAT System GenCo',
      perKwh.evatSystemGenCo,
      usage
    )
  );
  addItem(
    government,
    buildPerKwhItem(
      'evatSystemTransCo',
      'EVAT System TransCo',
      perKwh.evatSystemTransCo,
      usage
    )
  );
  addItem(government, buildPerKwhItem('ucME', 'UC-ME', perKwh.ucME, usage));
  addItem(government, buildPerKwhItem('ucEC', 'UC-EC', perKwh.ucEC, usage));
  addItem(
    government,
    buildPerKwhItem(
      'ucStrandedCost',
      'UC-Stranded Cost',
      perKwh.ucStrandedCost,
      usage
    )
  );
  addItem(government, buildPerKwhItem('fitAll', 'FIT-ALL', perKwh.fitAll, usage));
  addItem(government, buildPerKwhItem('geAll', 'GE-ALL', perKwh.geAll, usage));

  addItem(
    otherCharges,
    buildFixedItem(
      'otherNonTaxable',
      'Other Non-Taxable Charges',
      fixed.otherNonTaxable,
      proration
    )
  );

  const totals = {
    generationTransmission: sumItems(generationTransmission),
    distribution: sumItems(distribution),
    government: sumItems(government),
    other: sumItems(otherCharges),
  };

  totals.total = roundCurrency(
    totals.generationTransmission + totals.distribution + totals.government + totals.other
  );

  return {
    kwh: usage,
    proration,
    rateProfileId: resolvedProfile.id,
    rateProfileName: resolvedProfile.name,
    rateProfileEffectiveFrom: resolvedProfile.effectiveFrom,
    referenceRate: toNumber(activeRates.referenceRate),
    items: {
      generationTransmission,
      distribution,
      government,
      otherCharges,
    },
    totals,
    effectiveRate: usage > 0 ? roundTo(totals.total / usage, 4) : 0,
  };
};
