const toDate = (value) => {
  if (!value) return null;

  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date((value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatNotificationTime = (timestamp) => {
  const date = toDate(timestamp);
  if (!date) return '--:--';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatNotificationDate = (timestamp) => {
  const date = toDate(timestamp);
  if (!date) return '-- --- ----';

  return date.toLocaleDateString([], {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
};

export const getNotificationIcon = (type) => {
  switch (type) {
    case 'high_usage': return '⚡';
    case 'warning': return '⚠️';
    case 'cutoff': return '🔴';
    case 'budget': return '💰';
    case 'schedule': return '⏱️';
    case 'device': return '🔌';
    case 'receipt': return '🧾';
    case 'invoice': return '📄';
    default: return '🔔';
  }
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The PZEM reports floats, so `242.3999939` is what actually lands in a
 * notification's metadata. Printed raw it reads as a broken sensor rather than
 * as binary floating point - the same thing that had to be fixed in the safety
 * emails.
 */
const volts = (value) => `${(toNumber(value) ?? 0).toFixed(1)} V`;
const amps = (value) => `${(toNumber(value) ?? 0).toFixed(2)} A`;
const watts = (value) => `${(toNumber(value) ?? 0).toFixed(1)} W`;
const pesos = (value) => `₱${(toNumber(value) ?? 0).toFixed(2)}`;
const percent = (value) => `${(toNumber(value) ?? 0).toFixed(1)}%`;

const readingLine = (voltage, current, power) =>
  `${volts(voltage)}  ·  ${amps(current)}  ·  ${watts(power)}`;

/** '2026-08' -> 'August 2026'. Left alone if it is not a month key. */
const monthLabel = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!match) return String(value ?? '');

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
    .toLocaleDateString([], { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const titleCase = (value) => {
  const text = String(value ?? '').replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
};

/** `outlet1Voltage` -> `Outlet1 voltage`. Only used by the fallback below. */
const humanizeKey = (key) => titleCase(String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2'));

/**
 * Energy is measured in kWh, and two decimals is a significant figure short of
 * useful for it. A day on a two-outlet setup routinely lands under 0.1 kWh, so
 * 0.088 and 0.094 both rendered "0.09" and a quiet day rendered "0" - while the
 * same notification's body text, formatted server-side to 3 dp, said 0.088. The
 * rollup notification contradicted itself in two adjacent lines.
 *
 * Matched on the name rather than listed, because the branch this feeds exists
 * precisely to handle metadata shapes added after it was written. Every energy
 * figure in this project is kWh, and no non-energy key is named for it.
 */
const isEnergyKey = (key) => /energy/i.test(String(key || ''));

const humanizeValue = (value, key) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  const numeric = toNumber(value);
  // Trailing-zero-free, but never a 9-digit float. Two decimals suits pesos and
  // percentages, which is everything here except energy.
  if (numeric !== null && typeof value !== 'string') {
    return String(Number(numeric.toFixed(isEnergyKey(key) ? 3 : 2)));
  }

  return String(value ?? '');
};

/**
 * Turns a notification's metadata into labelled rows for the detail modal.
 *
 * Tapping a notification used to open `Alert.alert` with
 * `JSON.stringify(metadata)` pasted into the body, so a safety alert read as
 * `{"outlet1Current":0,"outlet1Voltage":242.3999939,...}` - the raw document,
 * braces and all.
 *
 * Each known shape is spelled out rather than inferred, because the labels are
 * the whole point: `powerW` and `limitW` mean nothing until they read "Draw"
 * and "Cut-off limit". The fallback exists so a metadata shape added later
 * still renders as readable rows instead of regressing to JSON.
 */
export const describeNotificationDetails = (item) => {
  const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const rows = [];

  const has = (key) => metadata[key] !== undefined && metadata[key] !== null;

  // Safety stage change - handleSafetyAlerts.
  if (has('stage')) {
    rows.push({ label: 'Stage', value: titleCase(metadata.stage) });
    rows.push({
      label: 'Outlet 1',
      value: readingLine(metadata.outlet1Voltage, metadata.outlet1Current, metadata.outlet1Power),
    });
    rows.push({
      label: 'Outlet 2',
      value: readingLine(metadata.outlet2Voltage, metadata.outlet2Current, metadata.outlet2Power),
    });
    return rows;
  }

  // Budget threshold - handleBudgetAlerts.
  if (has('monthlyBudget') || has('currentSpending')) {
    if (has('month')) rows.push({ label: 'Month', value: monthLabel(metadata.month) });
    if (has('percentage')) rows.push({ label: 'Budget used', value: percent(metadata.percentage) });
    if (has('threshold')) {
      rows.push({ label: 'Alert level', value: `${humanizeValue(metadata.threshold)}%` });
    }
    if (has('currentSpending')) {
      rows.push({ label: 'Spent so far', value: pesos(metadata.currentSpending) });
    }
    if (has('monthlyBudget')) {
      rows.push({ label: 'Monthly budget', value: pesos(metadata.monthlyBudget) });
    }
    return rows;
  }

  // Firmware over-power cutoff - updateOutletMetrics.
  if (has('limitW')) {
    if (has('totalPowerW')) {
      rows.push({ label: 'Total load', value: watts(metadata.totalPowerW) });
    }
    if (has('powerW')) rows.push({ label: 'Draw', value: watts(metadata.powerW) });
    if (has('outletPowerW')) {
      rows.push({ label: 'This outlet', value: watts(metadata.outletPowerW) });
    }
    rows.push({ label: 'Cut-off limit', value: watts(metadata.limitW) });
    return rows;
  }

  // Anything else, including shapes added after this was written.
  Object.entries(metadata).forEach(([key, value]) => {
    if (key === 'type' || value === null || value === undefined || value === '') return;
    if (typeof value === 'object') return;
    rows.push({ label: humanizeKey(key), value: humanizeValue(value, key) });
  });

  return rows;
};

export const getNotificationColor = (type) => {
  switch (type) {
    case 'high_usage': return '#F59E0B';
    case 'warning': return '#F97316';
    case 'cutoff': return '#EF4444';
    case 'budget': return '#8B5CF6';
    case 'schedule': return '#10B981';
    case 'device': return '#3B82F6';
    case 'receipt': return '#14B8A6';
    case 'invoice': return '#6366F1';
    default: return '#6B7280';
  }
};