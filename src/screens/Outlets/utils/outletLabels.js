/**
 * Display helpers for an outlet card. Moved from DashboardScreen when the
 * outlet cards moved to the Outlets tab (Oct 2026), unchanged.
 */

export const toMetricNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Appliance line under each outlet title. It reflects what is actually drawing
 * power right now: while loading we stay blank rather than flashing "Not set",
 * and with no live load we say so instead of showing a stale saved name.
 */
export const formatApplianceName = (
  name,
  {
    hasLoad,
    hasReading,
    isLoading,
    identityState,
    identifying = false,
    unsupported,
    unsupportedReason,
    measuredPowerW,
  }
) => {
  if (isLoading) return '—';

  // Telemetry stopping is not evidence of an empty outlet. This used to fall
  // through to "Nothing plugged in" the moment readings went stale, asserting
  // the outlet was empty on the strength of measurements that had ended twelve
  // seconds earlier - and a fan running behind a dropped wi-fi connection reads
  // exactly the same as an unplugged one. Report the half still known.
  if (!hasReading) return 'No reading';
  if (!hasLoad) return 'Nothing plugged in';

  // Before the name, deliberately. An outlet named "LED Lamp" with a kettle on
  // it should not go on saying "LED Lamp" - the load is out of scope whatever
  // the outlet is called, and that is the more useful thing to know.
  const normalized = String(name || '').trim();

  if (unsupported && unsupportedReason === 'over_power') {
    return typeof measuredPowerW === 'number'
      ? `Draws more than Dagitab supports · ${measuredPowerW.toFixed(0)} W`
      : 'Draws more than Dagitab supports';
  }

  // The run's first verdict has not landed yet, so the stored name is the
  // previous appliance's (Oct 2026). A few seconds, then the real answer.
  if (identifying) return 'Checking…';

  if (unsupported) {
    // Outside the catalogue but under the cut-off: the user can name it, and
    // once named it is theirs (Oct 2026). Unnamed, the card below asks.
    if (!normalized) return 'New appliance';
  }

  if (!normalized) return 'Not set';

  // The measurements say this is no longer the appliance the outlet is named
  // after. Printing the name unqualified is what let an outlet report "LED Lamp"
  // while a 60 W ceiling fan ran on it, and the user is the one who has to
  // notice - so say it, rather than quietly showing a name known to be wrong.
  if (identityState === 'changed') return `Not ${normalized}`;

  // Just the name. A " · recognised" suffix used to mark a match against the
  // account's own saved signature; it was removed on request (Oct 2026) - the
  // appliance's name is what the user wants to read here.

  return normalized;
};
