// Tests for Patient core · store.js (CLOUD path).
//
// store.js delegates persistence to ./api.js. We mock ./api.js so that:
//   isCloud()       → true  (force the cloud branch everywhere)
//   isDemoEnabled() → false (so failOrFallback rethrows instead of falling back)
//   apiGet/apiPost/apiPut → jest.fn() driven per-test with mockResolvedValue.
// exercises.js is LEFT REAL — store's planItem()/normalizePlan() run findExercise +
// normalizeExerciseSnapshot against the real seed library, so we assert the real
// clamped-dose shape against the real EXERCISES table.
//
// Settings always use AsyncStorage (auto-mocked, in-memory) regardless of cloud mode.

jest.mock('../../Patient/src/core/api.js', () => {
  const apiConfigError = (code = 'api_not_configured') => {
    const err = new Error(code);
    err.code = code;
    return err;
  };
  return {
    isCloud: jest.fn(() => true),
    isDemoEnabled: jest.fn(() => false),
    apiConfigError,
    apiGet: jest.fn(),
    apiPost: jest.fn(),
    apiPut: jest.fn(),
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, apiPost, apiPut, isDemoEnabled } from '../../Patient/src/core/api.js';
import { EXERCISES } from '../../Patient/src/core/exercises.js';
import {
  getReference,
  getAllReferences,
  saveReference,
  getPlanFull,
  getPlan,
  savePlanFull,
  savePlan,
  logSession,
  getSessions,
  getSettings,
  saveSettings,
} from '../../Patient/src/core/store.js';

// Convenience handles to the real seed exercises used in assertions.
const SHOULDER = EXERCISES.find((e) => e.id === 'shoulder');
const KNEE = EXERCISES.find((e) => e.id === 'knee');
const HIP = EXERCISES.find((e) => e.id === 'hip');

beforeEach(() => {
  AsyncStorage.__reset();
  jest.clearAllMocks();
  // Restore the default cloud/non-demo mode after any per-test override.
  isDemoEnabled.mockReturnValue(false);
});

/* ───────────────────────── References ───────────────────────── */
describe('References · cloud path', () => {
  it('getReference returns the matching /references entry', async () => {
    apiGet.mockResolvedValue([
      { exerciseId: 'shoulder', foo: 1 },
      { exerciseId: 'knee', foo: 2 },
    ]);
    const ref = await getReference('knee');
    expect(apiGet).toHaveBeenCalledWith('/references');
    expect(ref).toEqual({ exerciseId: 'knee', foo: 2 });
  });

  it('getReference returns null when no entry matches', async () => {
    apiGet.mockResolvedValue([{ exerciseId: 'shoulder' }]);
    expect(await getReference('missing')).toBeNull();
  });

  it('getReference returns null when the API returns null/empty', async () => {
    apiGet.mockResolvedValue(null);
    expect(await getReference('shoulder')).toBeNull();
  });

  it('getReference rethrows when apiGet fails and demo is disabled', async () => {
    apiGet.mockRejectedValue(new Error('boom'));
    await expect(getReference('shoulder')).rejects.toThrow('boom');
  });

  it('getReference falls back to null when apiGet fails and demo is enabled', async () => {
    isDemoEnabled.mockReturnValue(true);
    apiGet.mockRejectedValue(new Error('boom'));
    expect(await getReference('shoulder')).toBeNull();
  });

  it('getAllReferences returns a map keyed by exerciseId', async () => {
    apiGet.mockResolvedValue([
      { exerciseId: 'shoulder', a: 1 },
      { exerciseId: 'knee', a: 2 },
    ]);
    const map = await getAllReferences();
    expect(apiGet).toHaveBeenCalledWith('/references');
    expect(map).toEqual({
      shoulder: { exerciseId: 'shoulder', a: 1 },
      knee: { exerciseId: 'knee', a: 2 },
    });
  });

  it('getAllReferences returns {} when the API returns null', async () => {
    apiGet.mockResolvedValue(null);
    expect(await getAllReferences()).toEqual({});
  });

  it('getAllReferences rethrows on failure when demo disabled', async () => {
    apiGet.mockRejectedValue(new Error('net'));
    await expect(getAllReferences()).rejects.toThrow('net');
  });

  it('saveReference POSTs to /references merging exerciseId with the reference', async () => {
    apiPost.mockResolvedValue({});
    await saveReference('shoulder', { foo: 'bar', baz: 3 });
    expect(apiPost).toHaveBeenCalledWith('/references', {
      exerciseId: 'shoulder',
      foo: 'bar',
      baz: 3,
    });
    // Cloud save must NOT touch AsyncStorage.
    expect(AsyncStorage.__dump()).toEqual({});
  });
});

/* ───────────────────────── Plan ───────────────────────── */
describe('Plan · cloud path', () => {
  it('getPlanFull returns the normalized plan from /plans', async () => {
    apiGet.mockResolvedValue({
      items: [{ exerciseId: 'shoulder', reps: 8, sets: 2, holdSec: 2, tol: 10 }],
      freqPerDay: 2,
      daysPerWeek: 5,
      durationWeeks: 6,
      startDate: '2026-01-01',
      notes: 'go slow',
    });
    const plan = await getPlanFull('p1');
    expect(apiGet).toHaveBeenCalledWith('/plans');
    expect(plan.patientId).toBe('p1');
    expect(plan.freqPerDay).toBe(2);
    expect(plan.daysPerWeek).toBe(5);
    expect(plan.durationWeeks).toBe(6);
    expect(plan.durationDays).toBe(42); // 6 weeks * 7
    expect(plan.startDate).toBe('2026-01-01');
    expect(plan.notes).toBe('go slow');
    expect(plan.items).toEqual([
      { exerciseId: 'shoulder', reps: 8, sets: 2, holdSec: 2, tol: 10 },
    ]);
  });

  it('getPlanFull clamps out-of-range dose values to the Plan Builder bounds', async () => {
    apiGet.mockResolvedValue({
      items: [{ exerciseId: 'knee', reps: 999, sets: 0, holdSec: 0.1, tol: 100 }],
    });
    const plan = await getPlanFull('p1');
    expect(plan.items[0]).toEqual({
      exerciseId: 'knee',
      reps: 50, // clampInt 1..50
      sets: 1, // clampInt 1..10 (0 -> 1)
      holdSec: 0.5, // clampNum 0.5..120
      tol: 45, // clampInt 1..45
    });
  });

  it('getPlanFull falls back to per-exercise defaults when dose values are absent', async () => {
    apiGet.mockResolvedValue({ items: [{ exerciseId: 'shoulder' }] });
    const plan = await getPlanFull('p1');
    expect(plan.items[0]).toEqual({
      exerciseId: 'shoulder',
      reps: SHOULDER.reps,
      sets: SHOULDER.sets,
      holdSec: SHOULDER.holdSec,
      tol: SHOULDER.tol,
    });
  });

  it('getPlanFull drops items referencing an unknown exercise id', async () => {
    apiGet.mockResolvedValue({
      items: [{ exerciseId: 'shoulder' }, { exerciseId: 'does_not_exist' }],
    });
    const plan = await getPlanFull('p1');
    expect(plan.items.map((i) => i.exerciseId)).toEqual(['shoulder']);
  });

  it('getPlanFull returns the default empty plan when the API returns null', async () => {
    apiGet.mockResolvedValue(null);
    const plan = await getPlanFull('p9');
    expect(plan).toEqual({
      patientId: 'p9',
      items: [],
      freqPerDay: 1,
      daysPerWeek: 7,
      durationWeeks: 4,
      durationDays: 28,
      startDate: null,
      notes: '',
    });
  });

  it('getPlanFull supports the legacy exerciseIds array shape', async () => {
    apiGet.mockResolvedValue({ exerciseIds: ['knee', 'hip'] });
    const plan = await getPlanFull('p1');
    expect(plan.items.map((i) => i.exerciseId)).toEqual(['knee', 'hip']);
  });

  it('getPlanFull rethrows on failure when demo disabled', async () => {
    apiGet.mockRejectedValue(new Error('plan_fail'));
    await expect(getPlanFull('p1')).rejects.toThrow('plan_fail');
  });

  it('getPlanFull falls back to default plan on failure when demo enabled', async () => {
    isDemoEnabled.mockReturnValue(true);
    apiGet.mockRejectedValue(new Error('plan_fail'));
    const plan = await getPlanFull('pX');
    expect(plan.patientId).toBe('pX');
    expect(plan.items).toEqual([]);
  });

  it('getPlan returns only the exerciseId membership list', async () => {
    apiGet.mockResolvedValue({
      items: [{ exerciseId: 'shoulder' }, { exerciseId: 'knee' }],
    });
    const ids = await getPlan('p1');
    expect(ids).toEqual(['shoulder', 'knee']);
  });

  it('getPlan defaults patientId to p1', async () => {
    apiGet.mockResolvedValue({ items: [{ exerciseId: 'hip' }] });
    expect(await getPlan()).toEqual(['hip']);
  });

  it('savePlanFull PUTs the plan to /plans (no AsyncStorage write)', async () => {
    apiPut.mockResolvedValue({});
    const plan = { patientId: 'p1', items: [{ exerciseId: 'knee' }], notes: 'x' };
    await savePlanFull('p1', plan);
    expect(apiPut).toHaveBeenCalledWith('/plans', plan);
    expect(AsyncStorage.__dump()).toEqual({});
  });

  it('savePlan preserves existing per-exercise dosage while changing membership', async () => {
    // Existing plan: shoulder with a customized dose, plus knee.
    apiGet.mockResolvedValue({
      items: [
        { exerciseId: 'shoulder', reps: 9, sets: 2, holdSec: 3, tol: 11 },
        { exerciseId: 'knee', reps: 7, sets: 1, holdSec: 2, tol: 9 },
      ],
    });
    apiPut.mockResolvedValue({});

    // New membership: keep shoulder, drop knee, add hip (new -> default dose).
    await savePlan('p1', ['shoulder', 'hip']);

    expect(apiPut).toHaveBeenCalledTimes(1);
    const [path, savedPlan] = apiPut.mock.calls[0];
    expect(path).toBe('/plans');
    expect(savedPlan.items).toEqual([
      // shoulder dosage preserved verbatim from the existing plan
      { exerciseId: 'shoulder', reps: 9, sets: 2, holdSec: 3, tol: 11 },
      // hip is newly added → fresh planItem with the seed defaults
      {
        exerciseId: 'hip',
        reps: HIP.reps,
        sets: HIP.sets,
        holdSec: HIP.holdSec,
        tol: HIP.tol,
      },
    ]);
  });

  it('savePlan drops unknown ids from the new membership', async () => {
    apiGet.mockResolvedValue({ items: [{ exerciseId: 'knee' }] });
    apiPut.mockResolvedValue({});
    await savePlan('p1', ['knee', 'bogus_id']);
    const savedPlan = apiPut.mock.calls[0][1];
    expect(savedPlan.items.map((i) => i.exerciseId)).toEqual(['knee']);
  });
});

/* ───────────────────────── Sessions ───────────────────────── */
describe('Sessions · cloud path', () => {
  it('logSession POSTs the session to /sessions', async () => {
    apiPost.mockResolvedValue({});
    const session = { patientId: 'p1', exerciseId: 'knee', endedAt: 1700000000000 };
    await logSession(session);
    expect(apiPost).toHaveBeenCalledWith('/sessions', session);
    expect(AsyncStorage.__dump()).toEqual({});
  });

  it('getSessions GETs /sessions and normalizes endedAt + kind', async () => {
    apiGet.mockResolvedValue([
      { patientId: 'p1', endedAt: '2026-01-02T00:00:00.000Z' }, // ISO string -> ms
      { patientId: 'p2', endedAt: 1700000000000, kind: 'extra' },
    ]);
    const list = await getSessions();
    expect(apiGet).toHaveBeenCalledWith('/sessions');
    expect(typeof list[0].endedAt).toBe('number');
    expect(list[0].endedAt).toBe(Number(new Date('2026-01-02T00:00:00.000Z')));
    expect(list[0].kind).toBe('plan'); // default when absent
    expect(list[1].kind).toBe('extra'); // preserved when present
    expect(list[1].endedAt).toBe(1700000000000);
  });

  it('getSessions returns [] when the API returns null', async () => {
    apiGet.mockResolvedValue(null);
    expect(await getSessions()).toEqual([]);
  });

  it('getSessions does NOT filter by patientId on the cloud path (server-scoped)', async () => {
    // The cloud branch returns all returned sessions as-is (the API is already
    // scoped by the JWT) — the patientId arg only filters the local/demo branch.
    apiGet.mockResolvedValue([
      { patientId: 'p1', endedAt: 2 },
      { patientId: 'p2', endedAt: 1 },
    ]);
    const list = await getSessions('p1');
    expect(list).toHaveLength(2);
  });

  it('getSessions rethrows on failure when demo disabled', async () => {
    apiGet.mockRejectedValue(new Error('sess_fail'));
    await expect(getSessions()).rejects.toThrow('sess_fail');
  });

  it('getSessions falls back to [] on failure when demo enabled', async () => {
    isDemoEnabled.mockReturnValue(true);
    apiGet.mockRejectedValue(new Error('sess_fail'));
    expect(await getSessions()).toEqual([]);
  });
});

/* ───────────────────────── Settings (always local) ───────────────────────── */
describe('Settings · always AsyncStorage', () => {
  it('getSettings returns the defaults when nothing is stored', async () => {
    const s = await getSettings();
    expect(s).toEqual({ voice: true, modelVariant: 'full', mirror: true });
    // Settings never hit the cloud API.
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('saveSettings merges a patch over the defaults and persists locally', async () => {
    await saveSettings({ voice: false });
    const s = await getSettings();
    expect(s).toEqual({ voice: false, modelVariant: 'full', mirror: true });
    // It is stored under the v2 settings key in AsyncStorage.
    const dumped = AsyncStorage.__dump();
    expect(JSON.parse(dumped['physioai.v2.settings'])).toEqual({
      voice: false,
      modelVariant: 'full',
      mirror: true,
    });
    expect(apiPost).not.toHaveBeenCalled();
    expect(apiPut).not.toHaveBeenCalled();
  });

  it('saveSettings accumulates successive patches', async () => {
    await saveSettings({ voice: false });
    await saveSettings({ modelVariant: 'lite' });
    await saveSettings({ mirror: false });
    expect(await getSettings()).toEqual({
      voice: false,
      modelVariant: 'lite',
      mirror: false,
    });
  });

  it('getSettings overlays stored values onto defaults (partial stored state)', async () => {
    await saveSettings({ modelVariant: 'lite' });
    const s = await getSettings();
    expect(s.modelVariant).toBe('lite');
    expect(s.voice).toBe(true); // default preserved
    expect(s.mirror).toBe(true); // default preserved
  });
});
