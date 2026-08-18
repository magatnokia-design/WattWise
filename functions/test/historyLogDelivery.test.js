const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const { markHistoryLogUnconfirmed } = require('../src/lib/historyLog');

/**
 * A history row is written when a switch is *requested*. The ESP32 only learns
 * about the command when it next polls, so the row exists before anyone knows
 * whether the relay moved - and on 18 Aug 2026 two outlet2 toggles logged
 * normally while both commands timed out. History stated, with no hedging, that
 * the outlet had switched.
 *
 * `markHistoryLogUnconfirmed` is the correction, and it has one property worth
 * pinning above all others: it must never *create* a row. It runs from a
 * Firestore trigger holding an id that came out of command metadata, and a wrong
 * or missing id inventing a switch event would be a far worse bug than the one
 * being fixed. Hence `update`, not `set(..., { merge: true })`.
 */

// `admin.firestore` is defined as a getter on the namespace, so a plain
// assignment silently does nothing and the real client is used instead - which
// looks exactly like the code under test refusing to write. defineProperty is
// what actually replaces it.
const swapFirestore = (value) => Object.defineProperty(admin, 'firestore', {
  value,
  configurable: true,
  writable: true,
});

const withFakeFirestore = (impl, run) => {
  const original = admin.firestore;
  const calls = [];

  swapFirestore(() => ({
    doc: (path) => ({
      update: async (payload) => {
        calls.push({ path, payload });
        if (impl?.throwOnUpdate) throw new Error('NOT_FOUND: no document to update');
        return { writeTime: 1 };
      },
      // Deliberately absent in spirit, present here to catch a regression: if
      // the implementation ever reaches for a creating write, this fails loudly
      // rather than silently fabricating a switch event.
      set: async () => {
        throw new Error('markHistoryLogUnconfirmed must not create rows');
      },
    }),
  }));

  return run(calls).finally(() => swapFirestore(original));
};

test('a timeout stamps the row it was given', () => withFakeFirestore(null, async (calls) => {
  const marked = await markHistoryLogUnconfirmed({
    userId: 'user-1',
    historyLogId: 'log-abc',
    status: 'timeout',
    commandId: 'cmd-9',
  });

  assert.equal(marked, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, 'users/user-1/history_logs/log-abc');
  assert.equal(calls[0].payload.delivery.confirmed, false);
  assert.equal(calls[0].payload.delivery.status, 'timeout');
  assert.equal(calls[0].payload.delivery.commandId, 'cmd-9');
}));

test('failed and rejected are stamped too', () => withFakeFirestore(null, async (calls) => {
  await markHistoryLogUnconfirmed({ userId: 'u', historyLogId: 'l', status: 'failed' });
  await markHistoryLogUnconfirmed({ userId: 'u', historyLogId: 'l', status: 'REJECTED' });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.delivery.status, 'failed');
  // Normalized, so the clients only ever match against lower case.
  assert.equal(calls[1].payload.delivery.status, 'rejected');
}));

test('a successful command writes nothing at all', () => withFakeFirestore(null, async (calls) => {
  // An un-stamped row keeps meaning exactly what it always meant. Only the
  // failing direction is ever recorded, so no existing row changes appearance.
  assert.equal(
    await markHistoryLogUnconfirmed({ userId: 'u', historyLogId: 'l', status: 'executed' }),
    false
  );
  assert.equal(
    await markHistoryLogUnconfirmed({ userId: 'u', historyLogId: 'l', status: 'pending' }),
    false
  );
  assert.equal(calls.length, 0);
}));

test('a command with no history id is skipped, not guessed at', () => withFakeFirestore(null, async (calls) => {
  // Commands issued before this shipped carry no historyLogId, and there is no
  // safe way to infer which row they belong to.
  assert.equal(
    await markHistoryLogUnconfirmed({ userId: 'u', historyLogId: undefined, status: 'timeout' }),
    false
  );
  assert.equal(
    await markHistoryLogUnconfirmed({ userId: 'u', historyLogId: '  ', status: 'timeout' }),
    false
  );
  assert.equal(
    await markHistoryLogUnconfirmed({ userId: '', historyLogId: 'l', status: 'timeout' }),
    false
  );
  assert.equal(calls.length, 0);
}));

test('a missing row is swallowed so the notification still goes out', () => withFakeFirestore(
  { throwOnUpdate: true },
  async (calls) => {
    // The user losing the badge is a nuisance; the user not being told their
    // outlet never switched is the actual failure. The trigger must survive.
    assert.equal(
      await markHistoryLogUnconfirmed({ userId: 'u', historyLogId: 'gone', status: 'timeout' }),
      false
    );
    assert.equal(calls.length, 1);
  }
));
