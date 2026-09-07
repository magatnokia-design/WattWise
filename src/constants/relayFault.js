/**
 * The standing "this outlet will not switch off" warning, in both tenses.
 *
 * COPY RULE: byte-identical with C:\App\WattWise-Web\src\constants\relayFault.js
 * (that copy has CRLF line endings, this one LF). The phone and the browser must
 * not describe the same fault differently - it is the one condition in the app
 * that ends with someone physically unplugging a live appliance.
 *
 * WHY THE TENSE IS A SEPARATE STRING AND NOT A DETAIL
 *
 * `relayFault.state` is latched. relayFault.js only ever re-evaluates it when
 * telemetry arrives, and clearing a confirmed fault needs positive evidence -
 * the load side measured dead, not merely idle (CLEAR_VOLTAGE_FLOOR_V). A Hub
 * that has stopped reporting supplies no evidence either way, so the warning
 * correctly stays up. That part is deliberate and must not be "fixed" by
 * clearing the fault when the Hub goes quiet: the relay is still welded, and
 * retracting a true safety warning is worse than never raising it.
 *
 * What was wrong was the sentence, not the latch. "current is still flowing"
 * is a present-tense measurement, and it was printed while the Hub was silent -
 * four lines under a Power Safety card correctly saying "The WattWise Hub has
 * stopped reporting, so nothing can be graded right now". Two cards on one
 * screen disagreeing about whether the app knows anything at all.
 *
 * That is the shape this project has been caught by three times already
 * (9069b9e, e5b3e25, 0e59ed2): a value from one moment presented as though it
 * belonged to another, with nothing on screen naming which moment it came from.
 *
 * Both strings end with the same instruction, because the action does not
 * change with the tense. A stale warning is still a warning - the outlet is
 * live either way, and the stale wording says so rather than softening it.
 */

const ACTION = 'Unplug the appliance at the wall and have the wiring checked before using it again.';

const CANNOT_PROTECT =
  'The relay may be stuck closed, so the safety cut-off cannot protect this outlet either.';

export const RELAY_FAULT_LIVE =
  `It was told to switch off and current is still flowing. ${CANNOT_PROTECT} ${ACTION}`;

export const RELAY_FAULT_STALE =
  'When the Hub last reported, it had been told to switch off and current was still '
  + `flowing. ${CANNOT_PROTECT} The Hub is not reporting now, so this cannot be re-checked: `
  + `treat the outlet as live. ${ACTION}`;

/**
 * Which wording to show, given whether this outlet's telemetry is fresh.
 *
 * Takes the same `hasReading` flag the outlet cards use, so the banner and the
 * cards under it agree about whether anything is being measured. Anything other
 * than an explicit `true` is treated as stale: an absent or unknown freshness
 * flag must not be read as a live measurement.
 *
 * @param {boolean} hasFreshTelemetry
 * @returns {string}
 */
export const describeRelayFault = (hasFreshTelemetry) =>
  (hasFreshTelemetry === true ? RELAY_FAULT_LIVE : RELAY_FAULT_STALE);
