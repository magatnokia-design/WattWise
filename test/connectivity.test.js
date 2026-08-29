import test from 'node:test';
import assert from 'node:assert/strict';

import {
  withWriteTimeout,
  isConnectivityError,
  PENDING_WRITE_RESULT,
} from '../src/utils/connectivity.js';

/*
 * The behaviour under test is the one the Firestore SDK does not give us.
 *
 * `setDoc`, `updateDoc`, `addDoc` and `deleteDoc` resolve when the *server*
 * acknowledges. Offline there is no server to acknowledge, so the promise
 * neither resolves nor rejects - it stays pending for as long as the app is
 * open. Every save button in this app awaited one of those directly, so with no
 * connection the button simply spun. Nothing timed out because nothing failed.
 *
 * A never-settling promise is exactly what these tests stand in for.
 */
const neverSettles = () => new Promise(() => {});

test('a write that never settles is reported as pending, not as failure', async () => {
  const result = await withWriteTimeout(neverSettles(), 20);

  assert.equal(result.success, false);
  assert.equal(result.pending, true);
  assert.equal(result.code, 'unavailable');
});

test('a write that answers in time passes its own result through untouched', async () => {
  const created = { success: true, id: 'sched_42' };
  const result = await withWriteTimeout(Promise.resolve(created), 50);

  // The id matters: createSchedule returns one and the caller uses it.
  assert.deepEqual(result, created);
  assert.equal(result.pending, undefined);
});

test('a write that rejects still rejects - a real error is not a pending write', async () => {
  await assert.rejects(
    withWriteTimeout(Promise.reject(new Error('permission-denied')), 50),
    /permission-denied/
  );
});

test('a slow write that beats the deadline is not called pending', async () => {
  const slow = new Promise((resolve) => {
    setTimeout(() => resolve({ success: true }), 10);
  });

  const result = await withWriteTimeout(slow, 100);
  assert.equal(result.success, true);
  assert.equal(result.pending, undefined);
});

test('the pending result reads as a connectivity failure to the rest of the app', () => {
  // The screens branch on isConnectivityError to pick their wording. A pending
  // write has to land on the "no connection" side of that, or the outlet-toggle
  // dialog would go back to blaming the Hub for the phone's own signal.
  assert.equal(isConnectivityError(PENDING_WRITE_RESULT), true);
});

test('the pending result is frozen, so one caller cannot reword it for the next', () => {
  assert.throws(() => {
    PENDING_WRITE_RESULT.error = 'something else';
  });
});
