const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

const { renameApplianceProfile } = require('../src/http/renameApplianceProfile');

/**
 * Renaming a learned signature has one failure mode that would not announce
 * itself: the profile is renamed and the outlet using it is not. Nothing errors,
 * the Saved Appliances list looks right, and the outlet is left pointing at a
 * label that no longer exists - so `matchNamedAppliance` finds no signature,
 * returns `unknown`, and the appliance identity check silently stops working on
 * that outlet. It is the same shape as every other bug this project has shipped,
 * so the outlet half is asserted here rather than assumed.
 */

const AUTH = { uid: 'user-1' };

// Reading the real `admin.firestore.FieldValue` instantiates the Firestore
// client and demands credentials, which would turn this suite into a network
// test. The handler only forwards the sentinel into a write, so a stand-in that
// is merely recognisable in the captured payload is enough.
const FAKE_SERVER_TIMESTAMP = '__serverTimestamp__';

/**
 * Minimal Firestore stand-in covering exactly what the handler touches:
 * a transactional read/write of the user document, a multi-get of the two
 * outlets, and a batch.
 */
const buildFakeDb = ({ profiles = [], outlets = {} } = {}) => {
  const state = {
    user: { applianceProfiles: profiles },
    outlets: { ...outlets },
    writes: [],
    committed: false,
  };

  const docFor = (path) => ({
    path,
    get data() {
      return state;
    },
  });

  const snapshotFor = (ref, exists, data) => ({
    ref,
    exists,
    data: () => data,
  });

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
      set: (ref, value) => {
        state.writes.push({ path: ref.path, value });
      },
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
  // The handler reads admin.firestore.FieldValue.serverTimestamp() as a property
  // of the function itself, so the stub has to carry one.
  stub.FieldValue = { serverTimestamp: () => FAKE_SERVER_TIMESTAMP };

  // `firestore` is a getter-only accessor on the namespace prototype, so a plain
  // assignment is silently discarded and the real client is used - which then
  // demands credentials. Defining an own data property shadows the getter.
  Object.defineProperty(admin, 'firestore', {
    value: stub,
    configurable: true,
    writable: true,
  });

  try {
    return await run(state);
  } finally {
    // Removing the own property re-exposes the inherited getter.
    delete admin.firestore;
  }
};

const LAMP = { label: 'LED Lamp', meanPower: 16, peakPower: 16.4 };
const FAN = { label: 'Electric Fan', meanPower: 60, peakPower: 64 };

const expectRejection = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}`);
    return true;
  });
};

test('renameApplianceProfile requires authentication', async () => {
  await expectRejection(
    renameApplianceProfile({ data: { from: 'LED Lamp', to: 'Desk Lamp' } }),
    'unauthenticated'
  );
});

test('renameApplianceProfile requires both names', async () => {
  await expectRejection(
    renameApplianceProfile({ auth: AUTH, data: { to: 'Desk Lamp' } }),
    'invalid-argument'
  );

  await expectRejection(
    renameApplianceProfile({ auth: AUTH, data: { from: 'LED Lamp' } }),
    'invalid-argument'
  );

  await expectRejection(
    renameApplianceProfile({ auth: AUTH, data: { from: 'LED Lamp', to: '   ' } }),
    'invalid-argument'
  );
});

test('renameApplianceProfile refuses an outlet placeholder as a name', async () => {
  // normalizeUserProfiles drops these, so accepting one would report success and
  // then discard the signature on the next read.
  await expectRejection(
    renameApplianceProfile({ auth: AUTH, data: { from: 'LED Lamp', to: 'Outlet 1' } }),
    'invalid-argument'
  );

  await expectRejection(
    renameApplianceProfile({ auth: AUTH, data: { from: 'LED Lamp', to: 'outlet2' } }),
    'invalid-argument'
  );
});

test('renameApplianceProfile rejects a no-op rename', async () => {
  await expectRejection(
    renameApplianceProfile({ auth: AUTH, data: { from: 'LED Lamp', to: 'LED Lamp' } }),
    'invalid-argument'
  );
});

test('renameApplianceProfile reports an unknown appliance', async () => {
  await withFakeDb({ profiles: [LAMP] }, async () => {
    await expectRejection(
      renameApplianceProfile({ auth: AUTH, data: { from: 'Toaster', to: 'Kettle' } }),
      'not-found'
    );
  });
});

/**
 * This used to assert `already-exists`, and that was right while an appliance
 * could hold one signature: two different measurements could not both be the
 * same appliance, so one of them had to be wrong.
 *
 * With clusters they can be, and the rejection turns out to have been blocking
 * the owner's real intent. He learned one phone twice - 28.8 W on the steep part
 * of its charge curve and 10.5 W on the flat - and tried to rename the second
 * onto the first to say they were the same thing. There was no way to express
 * that, so the rename was the closest available action and it was refused.
 */
test('renaming onto an existing appliance merges into it', async () => {
  await withFakeDb({ profiles: [LAMP, FAN] }, async (state) => {
    const result = await renameApplianceProfile({
      auth: AUTH,
      data: { from: 'LED Lamp', to: 'Electric Fan' },
    });

    assert.equal(result.success, true);
    assert.equal(result.merged, true, 'reported as a merge, not a plain rename');

    const labels = state.user.applianceProfiles.map((profile) => profile.label);
    assert.deepEqual(labels, ['Electric Fan', 'Electric Fan'], 'one appliance, two regimes');

    // Both measurements survive: 16 W and 60 W are far apart, so they are
    // different operating regimes rather than one to be replaced by the other.
    const means = state.user.applianceProfiles.map((profile) => profile.meanPower).sort((a, b) => a - b);
    assert.deepEqual(means, [16, 60]);
  });
});

test('merging two measurements of one regime does not duplicate it', async () => {
  // Near enough to be the same regime measured twice. Keeping both would spend
  // the appliance's cluster budget on near-duplicates and teach it nothing.
  const nearlyTheSameLamp = { label: 'Desk Lamp', meanPower: 16.2, peakPower: 16.6 };

  await withFakeDb({ profiles: [LAMP, nearlyTheSameLamp] }, async (state) => {
    await renameApplianceProfile({
      auth: AUTH,
      data: { from: 'LED Lamp', to: 'Desk Lamp' },
    });

    assert.equal(state.user.applianceProfiles.length, 1, 'collapsed into one cluster');
    assert.equal(state.user.applianceProfiles[0].label, 'Desk Lamp');
  });
});

test('renameApplianceProfile keeps the measurements', async () => {
  await withFakeDb({ profiles: [LAMP, FAN] }, async (state) => {
    const result = await renameApplianceProfile({
      auth: AUTH,
      data: { from: 'LED Lamp', to: 'Desk Lamp' },
    });

    assert.equal(result.success, true);

    const renamed = state.user.applianceProfiles.find(
      (profile) => profile.label === 'Desk Lamp'
    );

    assert.ok(renamed, 'the renamed signature should still exist');
    assert.equal(renamed.meanPower, 16, 'the measured run must survive the rename');
    assert.equal(renamed.peakPower, 16.4);

    // The other signature is untouched.
    assert.ok(state.user.applianceProfiles.some((profile) => profile.label === 'Electric Fan'));
    assert.equal(state.user.applianceProfiles.length, 2);
  });
});

test('renameApplianceProfile allows a capitalisation fix', async () => {
  // Not a collision with itself.
  await withFakeDb({ profiles: [{ ...LAMP, label: 'led lamp' }] }, async (state) => {
    const result = await renameApplianceProfile({
      auth: AUTH,
      data: { from: 'led lamp', to: 'LED Lamp' },
    });

    assert.equal(result.success, true);
    assert.equal(state.user.applianceProfiles[0].label, 'LED Lamp');
  });
});

test('renameApplianceProfile carries the new name onto the outlet using it', async () => {
  const fixture = {
    profiles: [LAMP],
    outlets: {
      outlet1: { applianceName: 'LED Lamp' },
      outlet2: { applianceName: 'Electric Fan' },
    },
  };

  await withFakeDb(fixture, async (state) => {
    const result = await renameApplianceProfile({
      auth: AUTH,
      data: { from: 'LED Lamp', to: 'Desk Lamp' },
    });

    assert.deepEqual(result.renamedOutlets, ['outlet1']);
    assert.equal(state.committed, true);
    assert.equal(state.writes.length, 1);

    const [write] = state.writes;
    assert.match(write.path, /outlets\/outlet1$/);
    assert.equal(write.value.applianceName, 'Desk Lamp');
    // Kept in step so the accepted-suggestion record does not contradict the name.
    assert.equal(write.value['applianceSelection.name'], 'Desk Lamp');
  });
});

test('renameApplianceProfile leaves outlets alone when none uses the name', async () => {
  const fixture = {
    profiles: [LAMP],
    outlets: { outlet1: { applianceName: 'Electric Fan' } },
  };

  await withFakeDb(fixture, async (state) => {
    const result = await renameApplianceProfile({
      auth: AUTH,
      data: { from: 'LED Lamp', to: 'Desk Lamp' },
    });

    assert.deepEqual(result.renamedOutlets, []);
    assert.equal(state.committed, false, 'an empty batch should not be committed');
    assert.equal(state.writes.length, 0);
  });
});

test('renameApplianceProfile matches the outlet name case-insensitively', async () => {
  const fixture = {
    profiles: [LAMP],
    outlets: { outlet2: { applianceName: 'led lamp' } },
  };

  await withFakeDb(fixture, async (state) => {
    const result = await renameApplianceProfile({
      auth: AUTH,
      data: { from: 'LED Lamp', to: 'Desk Lamp' },
    });

    assert.deepEqual(result.renamedOutlets, ['outlet2']);
    assert.equal(state.writes[0].value.applianceName, 'Desk Lamp');
  });
});
