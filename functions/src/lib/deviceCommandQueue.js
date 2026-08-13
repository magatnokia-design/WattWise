/**
 * Which command the device gets on this poll.
 *
 * This used to be `devices/{id}.lastCommandId` - a single field that every
 * dispatch overwrote - so of two commands issued inside one poll interval only
 * the later one was ever reachable. The earlier document was written, never
 * fetched, and timed out, which then emailed the user about a delivery failure
 * the system had caused itself.
 *
 * Seen from the UI: switching both outlets off a second apart left outlet 1
 * running at 54 W behind a failure notification, and it took a second press to
 * turn it off. The same race cut the wrong outlet during an auto-cutoff, which
 * was worked around in handleSafetyAlerts by dispatching sequentially - that made
 * the ordering deterministic but still delivered only the last command.
 *
 * Lives here rather than inline in the handler so it can be tested without
 * device auth, a live Firestore, or a fresh-timestamp check - none of which are
 * what this logic is about. The handler owns the I/O; this owns the decision.
 */

const TERMINAL_ACK_STATUS = new Set(['executed', 'failed', 'rejected', 'timeout']);

// A poll must stay cheap, and a queue longer than this already means something
// upstream is wrong. Whatever is left over is picked up on the next poll, so a
// backlog drains rather than stalling.
const MAX_SCAN = 5;

const normalizeId = (value) => String(value || '').trim();

/**
 * @param {object} options
 * @param {string[]} options.pendingIds Queue, oldest first.
 * @param {string} [options.pointerCommandId] Pre-queue `lastCommandId`, used only
 *   when the queue is empty so a device polling across the deploy still collects
 *   whatever was already waiting.
 * @param {string} [options.lastAckCommandId] Last command this device acked.
 * @param {string} [options.clientLastCommandId] What the device says it holds.
 * @param {string} options.deviceId Device the commands must belong to.
 * @param {number} options.nowMs
 * @param {(commandId: string) => Promise<object|null>} options.loadCommand
 * @returns {Promise<{outcome: 'deliver'|'none'|'mismatch', commandId: string|null,
 *   command: object|null, settled: string[]}>} `settled` are queue entries that
 *   are resolved and should be removed by the caller.
 */
const selectNextCommand = async ({
  pendingIds = [],
  pointerCommandId = '',
  lastAckCommandId = '',
  clientLastCommandId = '',
  deviceId,
  nowMs,
  loadCommand,
  maxScan = MAX_SCAN,
}) => {
  const lastAck = normalizeId(lastAckCommandId);
  const clientHolds = normalizeId(clientLastCommandId);
  const pointer = normalizeId(pointerCommandId);

  const queued = (Array.isArray(pendingIds) ? pendingIds : [])
    .map(normalizeId)
    .filter(Boolean);

  const pending = queued.length > 0
    ? queued
    : (pointer && pointer !== lastAck ? [pointer] : []);

  const settled = [];
  // Expired entries the caller must record a timeout for. Collected rather than
  // returned one at a time so a stale command cannot stall the queue: the old
  // single-pointer version hit its timeout branch and returned, so nothing
  // behind it was ever reachable.
  const expired = [];
  const none = () => ({
    outcome: 'none', commandId: null, command: null, settled, expired,
  });

  if (pending.length === 0) return none();

  for (const commandId of pending.slice(0, maxScan)) {
    // Already delivered and awaiting its ack - handing it out again would make
    // the device re-run it and would block everything behind it.
    if (commandId === clientHolds || commandId === lastAck) {
      if (commandId === lastAck) settled.push(commandId);
      continue;
    }

    const command = await loadCommand(commandId);
    if (!command) {
      settled.push(commandId);
      continue;
    }

    const commandDeviceId = normalizeId(command.deviceId);
    if (commandDeviceId && commandDeviceId !== normalizeId(deviceId)) {
      return { outcome: 'mismatch', commandId, command, settled, expired };
    }

    const delivery = command.delivery || {};
    const ackStatus = String(
      delivery.lastAckStatus || command.acknowledgment?.status || ''
    ).trim().toLowerCase();

    if (TERMINAL_ACK_STATUS.has(ackStatus)) {
      settled.push(commandId);
      continue;
    }

    const deadlineAtMs = Number(delivery.deadlineAtMs || 0);
    if (deadlineAtMs && nowMs > deadlineAtMs) {
      settled.push(commandId);
      expired.push({ commandId, command });
      continue;
    }

    return { outcome: 'deliver', commandId, command, settled, expired };
  }

  return none();
};

module.exports = {
  TERMINAL_ACK_STATUS,
  MAX_SCAN,
  selectNextCommand,
};
