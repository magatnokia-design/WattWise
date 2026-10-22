const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const { removeApplianceProfile } = require('../src/http/removeApplianceProfile');

/**
 * Forgetting a saved appliance must un-name the outlet still carrying it.
 *
 * It used to delete only the signature. The outlet stayed "Electric Fan", the
 * generic profiles went on measuring the fan as "Electric Fan", the two labels
 * agreed, and `suggestionPending` stayed false for ever - so the user who
 * forgot the fan in order to re-teach it was never offered a name again.
 */

const AUTH = { uid: 'user-1' };
const FAKE_SERVER_TIMESTAMP = '__serverTimestamp__';
const FAKE_DELETE = '__delete__';

const buildFakeDb = ({ profiles = [], outlets = {} } = {}) => {
  const state = { user: { applianceProfiles: profiles }, outlets: { ...outlets }, writes: [], committed: false };
  const docFor = (path) => ({ path });
  const snapshotFor = (ref, exists, data) => ({ ref, exists, data: () => data });
  const db = {
    doc: (path) => docFor(path),
    runTransaction: async (fn) => fn({
      get: async () => snapshotFor(docFor(`users/${AUTH.uid}`), true, state.user),
      set: (ref, value) => {
        state.user = { ...state.user, ...value };
      },
    }),
    getAll: async (...refs) => refs.map((ref) => {
      const outletId = String(ref.path).split('/').pop();
      const data = state.outlets[outletId];
      return snapshotFor(ref, data !== undefined, data);
    }),
    batch: () => ({
      set: (ref, value) => state.writes.push({ path: ref.path, value }),
      commit: async () => {
        state.committed = true;
      },
    }),
  };
  return { db, state };
};

const withFakeDb = async (fixture, run) => {
  const { db, state } = buildFakeDb(fixture);
  const stub = () => db;
  stub.FieldValue = {
    serverTimestamp: () => FAKE_SERVER_TIMESTAMP,
    delete: () => FAKE_DELETE,
  };
  Object.defineProperty(admin, 'firestore', { value: stub, configurable: true, writable: true });
  try {
    return await run(state);
  } finally {
    delete admin.firestore;
  }
};

const FAN = { label: 'Electric Fan', meanPower: 47.7, peakPower: 49 };
const LAMP = { label: 'LED Lamp', meanPower: 16, peakPower: 16.4 };

test('forgetting an appliance un-names the outlet that carries it', async () => {
  const fixture = {
    profiles: [FAN, LAMP],
    outlets: {
      outlet1: { applianceName: 'LED Lamp' },
      outlet2: { applianceName: 'electric fan', applianceIdentity: { state: 'confirmed' } },
    },
  };

  await withFakeDb(fixture, async (state) => {
    const result = await removeApplianceProfile({ auth: AUTH, data: { label: 'Electric Fan' } });

    assert.deepEqual(result.clearedOutlets, ['outlet2'], 'case-insensitive, and only the fan outlet');
    assert.deepEqual(state.user.applianceProfiles.map((profile) => profile.label), ['LED Lamp']);
    assert.equal(state.writes.length, 1);

    const [write] = state.writes;
    assert.match(write.path, /outlets\/outlet2$/);
    // An empty name is what lets the next evaluation offer a suggestion.
    assert.equal(write.value.applianceName, '');
    // The old verdict was about a name that no longer exists.
    assert.equal(write.value.applianceIdentity, FAKE_DELETE);
    assert.equal(write.value.applianceSelection, FAKE_DELETE);
  });
});

test('an outlet with a different name is left alone', async () => {
  const fixture = {
    profiles: [FAN],
    outlets: { outlet1: { applianceName: 'Laptop Charger' } },
  };

  await withFakeDb(fixture, async (state) => {
    const result = await removeApplianceProfile({ auth: AUTH, data: { label: 'Electric Fan' } });
    assert.deepEqual(result.clearedOutlets, []);
    assert.equal(state.writes.length, 0);
    assert.equal(state.committed, false);
  });
});

test('a name with no saved signature is still cleared from the outlet', async () => {
  // The stuck state: the signature was forgotten before forgetting un-named
  // outlets, so the outlet still says "Electric Fan" and Saved appliances is
  // empty. Forgetting it from the Outlets tab must still work.
  await withFakeDb({ profiles: [LAMP], outlets: { outlet2: { applianceName: 'Electric Fan' } } }, async (state) => {
    const result = await removeApplianceProfile({ auth: AUTH, data: { label: 'Electric Fan' } });
    assert.equal(result.removedProfile, false);
    assert.deepEqual(result.clearedOutlets, ['outlet2']);
    assert.equal(state.writes[0].value.applianceName, '');
    assert.deepEqual(state.user.applianceProfiles.map((profile) => profile.label), ['LED Lamp']);
  });
});

test('a name nobody carries is refused and touches nothing', async () => {
  await withFakeDb({ profiles: [LAMP], outlets: { outlet1: { applianceName: 'Laptop' } } }, async (state) => {
    await assert.rejects(
      removeApplianceProfile({ auth: AUTH, data: { label: 'Electric Fan' } }),
      (error) => error.code === 'not-found'
    );
    assert.equal(state.writes.length, 0);
  });
});
