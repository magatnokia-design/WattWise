const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isExpoPushToken,
  normalizeTokens,
  chunkTokens,
  buildMessage,
  sendPushNotifications,
  fetchPushReceipts,
} = require('../src/lib/pushSender');

const { arePushNotificationsEnabled } = require('../src/triggers/handlePushNotifications');

const token = (suffix) => `ExponentPushToken[${suffix}]`;

// Stands in for `fetch`, recording every request so assertions can inspect the
// batching, and replaying a caller-supplied receipt list.
const fakeFetch = ({ receipts = [], ok = true, status = 200, throws = false } = {}) => {
  const calls = [];

  const impl = async (url, options) => {
    calls.push({ url, messages: JSON.parse(options.body) });
    if (throws) throw new Error('network down');
    return {
      ok,
      status,
      json: async () => ({ data: receipts.slice(0, JSON.parse(options.body).length) }),
    };
  };

  impl.calls = calls;
  return impl;
};

const okReceipts = (count) => Array.from({ length: count }, () => ({ status: 'ok', id: 'x' }));

test('only well-formed Expo tokens are accepted', () => {
  assert.equal(isExpoPushToken(token('abc123')), true);
  assert.equal(isExpoPushToken('ExpoPushToken[abc123]'), true);
  assert.equal(isExpoPushToken('fcm-legacy-token'), false);
  assert.equal(isExpoPushToken(''), false);
  assert.equal(isExpoPushToken(null), false);
});

test('duplicate and malformed tokens are dropped before sending', () => {
  const result = normalizeTokens([
    token('a'),
    token('a'),
    'garbage',
    null,
    ` ${token('b')} `,
  ]);

  assert.deepEqual(result, [token('a'), token('b')]);
});

test('tokens are chunked to the Expo per-request limit', () => {
  const many = Array.from({ length: 250 }, (_, i) => token(i));
  const chunks = chunkTokens(many);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 100);
  assert.equal(chunks[2].length, 50);
});

test('a message carries the alert text and a high priority', () => {
  const message = buildMessage({
    token: token('a'),
    title: 'Auto-Cutoff Triggered',
    body: 'Power has been cut off.',
    data: { type: 'cutoff' },
  });

  assert.equal(message.to, token('a'));
  assert.equal(message.title, 'Auto-Cutoff Triggered');
  assert.equal(message.body, 'Power has been cut off.');
  assert.equal(message.priority, 'high');
  assert.deepEqual(message.data, { type: 'cutoff' });
});

test('an empty data payload is omitted rather than sent as {}', () => {
  const message = buildMessage({ token: token('a'), title: 'x', body: 'y', data: {} });
  assert.equal('data' in message, false);
});

test('a user with no tokens is skipped without a network call', async () => {
  const impl = fakeFetch();
  const result = await sendPushNotifications({ tokens: [], title: 't', body: 'b', fetchImpl: impl });

  assert.equal(result.skipped, true);
  assert.equal(result.sent, 0);
  assert.equal(impl.calls.length, 0);
});

test('a user with two devices gets one request carrying both', async () => {
  const impl = fakeFetch({ receipts: okReceipts(2) });
  const result = await sendPushNotifications({
    tokens: [token('a'), token('b')],
    title: 'Budget exceeded',
    body: 'You are over budget.',
    fetchImpl: impl,
  });

  assert.equal(impl.calls.length, 1);
  assert.equal(impl.calls[0].messages.length, 2);
  assert.equal(result.sent, 2);
  assert.deepEqual(result.invalidTokens, []);
});

test('an uninstalled device is reported for pruning, the other still sends', async () => {
  const impl = fakeFetch({
    receipts: [
      { status: 'ok', id: 'x' },
      { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    ],
  });

  const result = await sendPushNotifications({
    tokens: [token('live'), token('dead')],
    title: 't',
    body: 'b',
    fetchImpl: impl,
  });

  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.invalidTokens, [token('dead')]);
});

test('a non-DeviceNotRegistered error counts as failed but keeps the token', async () => {
  const impl = fakeFetch({
    receipts: [{ status: 'error', message: 'rate limited', details: { error: 'MessageRateExceeded' } }],
  });

  const result = await sendPushNotifications({
    tokens: [token('a')],
    title: 't',
    body: 'b',
    fetchImpl: impl,
  });

  assert.equal(result.failed, 1);
  assert.deepEqual(result.invalidTokens, []);
});

test('a network failure is swallowed so the alert itself still succeeds', async () => {
  const impl = fakeFetch({ throws: true });

  const result = await sendPushNotifications({
    tokens: [token('a')],
    title: 't',
    body: 'b',
    fetchImpl: impl,
  });

  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
});

test('a rejected request marks the whole batch failed without pruning', async () => {
  const impl = fakeFetch({ ok: false, status: 400 });

  const result = await sendPushNotifications({
    tokens: [token('a'), token('b')],
    title: 't',
    body: 'b',
    fetchImpl: impl,
  });

  assert.equal(result.failed, 2);
  assert.deepEqual(result.invalidTokens, []);
});

test('the settings toggle gates push the same way the client reads it', () => {
  assert.equal(arePushNotificationsEnabled({}), true);
  assert.equal(arePushNotificationsEnabled({ notificationsEnabled: false }), false);
  assert.equal(arePushNotificationsEnabled({ preferences: { notificationsEnabled: false } }), false);
  // The legacy top-level field wins over the newer nested one.
  assert.equal(
    arePushNotificationsEnabled({
      notificationsEnabled: true,
      preferences: { notificationsEnabled: false },
    }),
    true
  );
});

// --- Receipts -------------------------------------------------------------
// The send endpoint returns tickets, not receipts. Treating acceptance as
// delivery is what let two pushes vanish while the logs said sent: 1.

test('a ticket id is kept for every accepted message', async () => {
  const result = await sendPushNotifications({
    tokens: ['ExponentPushToken[aaa]', 'ExponentPushToken[bbb]'],
    title: 'x',
    body: 'y',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: [
        { status: 'ok', id: 'ticket-1' },
        { status: 'ok', id: 'ticket-2' },
      ] }),
    }),
  });

  assert.equal(result.sent, 2);
  assert.deepEqual(result.ticketIds, {
    'ticket-1': 'ExponentPushToken[aaa]',
    'ticket-2': 'ExponentPushToken[bbb]',
  });
});

test('a receipt reporting a delivery failure is reported, not swallowed', async () => {
  const result = await fetchPushReceipts({
    ticketIds: ['ticket-1', 'ticket-2'],
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: {
        'ticket-1': { status: 'ok' },
        'ticket-2': { status: 'error', details: { error: 'MismatchSenderId' } },
      } }),
    }),
  });

  assert.deepEqual(result.delivered, ['ticket-1']);
  assert.equal(result.failedIds['ticket-2'], 'MismatchSenderId');
  assert.deepEqual(result.pending, []);
});

// Expo omits ids it cannot answer yet. Reading that as success would put the
// original blind spot straight back.
test('an unanswered receipt stays pending rather than counting as delivered', async () => {
  const result = await fetchPushReceipts({
    ticketIds: ['ticket-1', 'ticket-2'],
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ data: { 'ticket-1': { status: 'ok' } } }),
    }),
  });

  assert.deepEqual(result.delivered, ['ticket-1']);
  assert.deepEqual(result.pending, ['ticket-2']);
  assert.deepEqual(result.failedIds, {});
});

test('a receipt request that fails leaves every id pending', async () => {
  const result = await fetchPushReceipts({
    ticketIds: ['ticket-1'],
    fetchImpl: async () => { throw new Error('network down'); },
  });

  assert.deepEqual(result.pending, ['ticket-1']);
  assert.equal(result.errored, true);
});
