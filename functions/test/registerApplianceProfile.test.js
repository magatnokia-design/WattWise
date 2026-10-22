const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const { registerApplianceProfile } = require('../src/http/registerApplianceProfile');

/**
 * Accepting a suggestion (or typing a name) must settle the verdict in the same
 * write. It used to set the name and leave `applianceIdentity.suggestionPending`
 * true until telemetry next re-evaluated the run, so the phone showed the old
 * suggestion again after the user had accepted it.
 */

const AUTH = { uid: 'user-1' };

const withFakeDb = async (outlet, run) => {
  const state = { outletWrites: [], user: { applianceProfiles: [] } };
  const db = {
    doc: (path) => ({
      path,
      get: async () => ({ exists: true, data: () => outlet }),
      set: async (value) => {
        state.outletWrites.push({ path, value });
      },
    }),
    runTransaction: async (fn) => fn({
      get: async () => ({ data: () => state.user }),
      set: (ref, value) => {
        state.user = { ...state.user, ...value };
      },
    }),
  };
  const stub = () => db;
  stub.FieldValue = { serverTimestamp: () => '__ts__', delete: () => '__delete__' };
  Object.defineProperty(admin, 'firestore', { value: stub, configurable: true, writable: true });
  try {
    return await run(state);
  } finally {
    delete admin.firestore;
  }
};

test('naming an outlet clears the pending suggestion in the same write', async () => {
  const outlet = {
    applianceName: '',
    applianceIdentity: { state: 'unknown', suggestionPending: true, measuredAs: 'Electric Fan' },
    detectionState: null,
  };

  await withFakeDb(outlet, async (state) => {
    const result = await registerApplianceProfile({
      auth: AUTH,
      data: { outletId: 'outlet2', applianceName: 'Printer', source: 'user_choice' },
    });

    assert.equal(result.success, true);
    const write = state.outletWrites.find((entry) => /outlets\/outlet2$/.test(entry.path));
    assert.ok(write, 'the outlet was written');
    assert.equal(write.value.applianceName, 'Printer');
    assert.equal(write.value.applianceIdentity.suggestionPending, false);
    assert.equal(write.value.applianceIdentity.state, 'confirmed');
    assert.equal(write.value.applianceIdentity.namedAs, 'Printer');
    // Nested, never a dotted key - set() would store that literally.
    assert.equal(write.value['applianceIdentity.suggestionPending'], undefined);
  });
});
