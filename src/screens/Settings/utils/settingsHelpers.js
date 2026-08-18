// TODO: Expand when backend is ready

export const formatRate = (rate) => {
  if (!rate) return '₱0.00/kWh';
  return `₱${parseFloat(rate).toFixed(2)}/kWh`;
};

export const formatVersion = () => {
  return 'v1.0.0';
};

export const formatCurrency = (value, currency = '₱') => {
  const numericValue = Number(value || 0);
  return `${currency}${numericValue.toFixed(2)}`;
};

export const validateRate = (rate) => {
  const parsed = parseFloat(rate);
  if (isNaN(parsed)) return false;
  if (parsed <= 0) return false;
  if (parsed > 999) return false;
  return true;
};

const formatRelativeAge = (timestampMs) => {
  const ts = Number(timestampMs || 0);
  if (!ts) return 'never';

  const diffMs = Math.max(0, Date.now() - ts);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

export const formatDeviceHealthValue = (status, lastSeenAtMs) => {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'not_linked') return 'Not linked';
  if (normalized === 'unregistered') return 'Unregistered';
  if (normalized === 'online') return `Online (${formatRelativeAge(lastSeenAtMs)})`;
  if (normalized === 'delayed') return `Delayed (${formatRelativeAge(lastSeenAtMs)})`;
  if (normalized === 'degraded') return `Degraded (${formatRelativeAge(lastSeenAtMs)})`;

  return `Offline (${formatRelativeAge(lastSeenAtMs)})`;
};

export const formatAckStatusValue = (ackStatus) => {
  const normalized = String(ackStatus || '').trim().toLowerCase();
  if (!normalized) return '--';
  if (normalized === 'executed') return 'Executed';
  if (normalized === 'delivered') return 'Delivered';
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'timeout') return 'Timeout';
  return normalized;
};
/*
 * Block 1 rate validation, shared by both clients.
 *
 * This screen is the one place a user can change what every peso figure in the
 * system means - the dashboard estimate, the daily rollups, the budget, and the
 * accuracy check against a real PELCO bill all price against these eleven
 * numbers. It had validation on the phone and none on the web, which is the
 * wrong way round: the web is where people actually type these in, because
 * copying eleven figures off a paper bill is a keyboard job.
 *
 * Three rules, and the reasoning matters more than the code:
 *
 * 1. Generation must be a real number above zero. It is the only line PELCO III
 *    republishes monthly, and `hasSupplyRates` treats a generation rate of zero
 *    as "this user has not configured anything" - so saving zero does not store
 *    a zero, it silently switches the whole app back to seeded defaults while
 *    reporting success.
 *
 * 2. A blank field means "use the default" and is allowed, because that is what
 *    normalizeSupplyRates already does and the advanced lines are genuinely
 *    zero on most bills. But blank is NOT allowed for generation - there the
 *    silent default is precisely the trap in rule 1.
 *
 * 3. Only the four adjustment lines may be negative. They are credits and
 *    appear negative on real bills - the seeded Gen. Rate Adj is -0.0306. A
 *    negative anywhere else is a typo that would quietly reduce every bill.
 */
const ADJUSTMENT_KEYS = new Set([
  'generationRateAdj',
  'transmissionCostAdj',
  'systemLossAdj',
  'transDemandAdj',
]);

// A real PELCO III Block 1 total sits near P7-8/kWh. This band is deliberately
// far wider than that: it is not there to police the tariff, only to catch a
// misplaced decimal point, which is the error that actually happens when
// copying P5.5034 off a bill and would otherwise bill ten times over in
// silence.
export const PLAUSIBLE_BLOCK1_MIN = 3;
export const PLAUSIBLE_BLOCK1_MAX = 20;

export const validateSupplyRates = (draft, fields) => {
  const errors = {};
  const warnings = [];
  let total = 0;

  fields.forEach((field) => {
    const raw = String(draft?.[field.key] ?? '').trim();
    const isGeneration = field.key === 'generation';

    if (raw === '') {
      if (isGeneration) {
        errors[field.key] = 'Enter the generation rate printed on your bill.';
      } else {
        total += Number(field.defaultValue) || 0;
      }
      return;
    }

    const parsed = Number(raw);

    if (!Number.isFinite(parsed)) {
      errors[field.key] = 'Numbers only.';
      return;
    }

    if (parsed < 0 && !ADJUSTMENT_KEYS.has(field.key)) {
      errors[field.key] = 'Cannot be negative.';
      return;
    }

    if (isGeneration && parsed <= 0) {
      errors[field.key] = 'Must be more than zero.';
      return;
    }

    total += parsed;
  });

  const valid = Object.keys(errors).length === 0;

  // Only worth saying once the numbers are otherwise sound - a total computed
  // from fields that failed above is not a total worth commenting on.
  if (valid && (total < PLAUSIBLE_BLOCK1_MIN || total > PLAUSIBLE_BLOCK1_MAX)) {
    warnings.push(
      `Block 1 comes to ₱${total.toFixed(4)}/kWh. A PELCO III bill is usually around `
      + `₱7-8. Check for a misplaced decimal point before saving.`
    );
  }

  return { valid, errors, warnings, total };
};
