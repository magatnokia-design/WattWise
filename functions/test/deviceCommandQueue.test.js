const test = require('node:test');
const assert = require('node:assert/strict');

const { selectNextCommand, MAX_SCAN } = require('../src/lib/deviceCommandQueue');

/**
 * The device fetches one command per poll. Which one it gets used to come from
 * `devices/{id}.lastCommandId` - a single field every dispatch overwrote - so of
 * two commands issued inside one poll interval, only the later was reachable.
 * The earlier document was written, never fetched, and timed out, which then
 * emailed the user about a delivery failure the system had caused itself.
 *
 * Seen from the UI: switching both outlets off a second apart left outlet 1
 * running at 54 W behind a failure notification, and it took a second press to
 * turn it off.
 *
 * These exercise the real selection function. The handler around it does the
 * Firestore reads and writes; `loadCommand` stands in for those here.
 */

const DEVICE = 'ESP32_ROOM_A';

const live = (outletId, extra = {}) => ({
  outletId,
  deviceId: DEVICE,
  delivery: { lastAckStatus: 'pending' },
  ...extra,
});

const loaderFor = (commands) => async (id) => commands[id] || null;

const select = (device, commands, options = {}) => selectNextCommand({
  pendingIds: device.pendingCommandIds,
  pointerCommandId: device.lastCommandId,
  lastAckCommandId: device.lastAckCommandId,
  deviceId: DEVICE,
  nowMs: 1000,
  loadCommand: loaderFor(commands),
  ...options,
});

// Mirrors dispatchDeviceCommand: append, never replace.
const dispatch = (device, commandId) => ({
  ...device,
  pendingCommandIds: [...(device.pendingCommandIds || []), commandId],
  lastCommandId: commandId,
});

// Mirrors ackDeviceCommand / markStaleDeviceCommands: arrayRemove.
const settle = (device, commandId) => ({
  ...device,
  pendingCommandIds: (device.pendingCommandIds || []).filter((id) => id !== commandId),
  lastAckCommandId: commandId,
});

test('two commands issued back to back are both delivered', async () => {
  // The exact sequence from the owner's activity log: outlet 1 off, then outlet
  // 2 off a second later, before the device had polled.
  let device = dispatch(dispatch({}, 'cmd-outlet1-off'), 'cmd-outlet2-off');

  const commands = {
    'cmd-outlet1-off': live('outlet1'),
    'cmd-outlet2-off': live('outlet2'),
  };

  const first = await select(device, commands);
  assert.equal(first.outcome, 'deliver');
  assert.equal(first.commandId, 'cmd-outlet1-off', 'the older one goes first');

  device = settle(device, 'cmd-outlet1-off');
  commands['cmd-outlet1-off'].delivery.lastAckStatus = 'executed';

  const second = await select(device, commands);
  assert.equal(second.commandId, 'cmd-outlet2-off', 'the one that used to be lost');

  device = settle(device, 'cmd-outlet2-off');
  assert.deepEqual(device.pendingCommandIds, [], 'queue drains');
  assert.equal((await select(device, commands)).outcome, 'none');
});

test('the oldest queued command wins', async () => {
  const device = ['first', 'second', 'third'].reduce(dispatch, {});
  const commands = { first: live('outlet1'), second: live('outlet2'), third: live('outlet1') };

  assert.equal((await select(device, commands)).commandId, 'first');
});

test('a command already delivered is not handed out twice', async () => {
  const device = dispatch(dispatch({}, 'cmd-a'), 'cmd-b');
  const commands = { 'cmd-a': live('outlet1'), 'cmd-b': live('outlet2') };

  const result = await select(device, commands, { clientLastCommandId: 'cmd-a' });

  assert.equal(result.commandId, 'cmd-b', 'moves on rather than repeating cmd-a');
});

test('a timed-out command does not block the ones behind it', async () => {
  // The old pointer version hit its timeout branch and returned, so nothing
  // behind it was ever reachable.
  const device = dispatch(dispatch({}, 'stale'), 'fresh');
  const commands = {
    stale: live('outlet1', { delivery: { lastAckStatus: 'pending', deadlineAtMs: 500 } }),
    fresh: live('outlet2'),
  };

  const result = await select(device, commands, { nowMs: 9999 });

  assert.equal(result.commandId, 'fresh');
  assert.deepEqual(result.expired.map((entry) => entry.commandId), ['stale']);
  assert.ok(result.settled.includes('stale'), 'the expired one is cleared');
});

test('acked, missing and expired entries are all cleared', async () => {
  const device = ['acked', 'deleted', 'live'].reduce(dispatch, {});
  const commands = {
    acked: live('outlet1', { delivery: { lastAckStatus: 'executed' } }),
    live: live('outlet2'),
  };

  const result = await select(device, commands);

  assert.equal(result.commandId, 'live');
  assert.deepEqual([...result.settled].sort(), ['acked', 'deleted']);
});

test('an empty queue asks for nothing', async () => {
  assert.equal((await select({}, {})).outcome, 'none');
  assert.equal((await select({ pendingCommandIds: [] }, {})).outcome, 'none');
});

test('a command dispatched before the queue existed is still collected', async () => {
  // A device polling across the deploy: no pendingCommandIds, only the pointer.
  const device = { lastCommandId: 'legacy-cmd' };
  const commands = { 'legacy-cmd': live('outlet1') };

  assert.equal((await select(device, commands)).commandId, 'legacy-cmd');

  // Once acked, the pointer alone must not re-offer it.
  const acked = { ...device, lastAckCommandId: 'legacy-cmd' };
  assert.equal((await select(acked, commands)).outcome, 'none');
});

test('a command for another device is refused, not delivered', async () => {
  const device = dispatch({}, 'someone-elses');
  const commands = { 'someone-elses': live('outlet1', { deviceId: 'ESP32_OTHER' }) };

  assert.equal((await select(device, commands)).outcome, 'mismatch');
});

test('the scan is bounded so a poll stays cheap, and still drains', async () => {
  let device = {};
  for (let i = 0; i < MAX_SCAN + 3; i += 1) device = dispatch(device, `dead-${i}`);
  device = dispatch(device, 'live');

  const commands = { live: live('outlet1') };

  const first = await select(device, commands);
  assert.equal(first.outcome, 'none', 'does not scan the whole queue in one poll');
  assert.equal(first.settled.length, MAX_SCAN);

  // Clearing what it resolved means the next poll gets further - a backlog
  // drains rather than stalling.
  device.pendingCommandIds = device.pendingCommandIds.filter(
    (id) => !first.settled.includes(id)
  );

  const second = await select(device, commands);
  assert.equal(second.commandId, 'live');
});

test('malformed queue entries are ignored rather than fetched', async () => {
  const device = { pendingCommandIds: ['', '   ', null, 'real'] };
  const commands = { real: live('outlet1') };

  assert.equal((await select(device, commands)).commandId, 'real');
});
