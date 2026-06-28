// Tests for Therapist/shared/core/store.js
//
// store.js persists references / plans / sessions / patients / settings under
// `physioai.v1.*` keys in localStorage, and (for real logins) syncs to the cloud
// via api.js. It imports:
//   - ./exercises.js  (REAL — drives plan dosage defaults + exerciseExists)
//   - ./api.js        (MOCKED here — controllable apiGet/apiPost/apiPut/apiDelete)
//   - ./auth.js       (MOCKED here — controllable isLoggedIn/isGuest, so we can
//                       deterministically exercise the LOCAL vs CLOUD branches)
//
// exercises.js is left real; store.js never pulls PoseDetection transitively, so
// no MediaPipe mock is needed.

jest.mock('../../Therapist/shared/core/api.js', () => ({
  apiGet: jest.fn(async () => null),
  apiPost: jest.fn(async () => ({})),
  apiPut: jest.fn(async () => ({})),
  apiDelete: jest.fn(async () => ({})),
  isCloud: jest.fn(() => false),
  isDemoEnabled: jest.fn(() => true),
}));

jest.mock('../../Therapist/shared/core/auth.js', () => ({
  isLoggedIn: jest.fn(() => false),
  isGuest: jest.fn(() => false),
}));

import { apiGet, apiPost, apiPut, apiDelete } from '../../Therapist/shared/core/api.js';
import { isLoggedIn, isGuest } from '../../Therapist/shared/core/auth.js';
import {
  getReference,
  getAllReferences,
  saveReference,
  clearReference,
  getPlanFull,
  getPlan,
  savePlan,
  savePlanFull,
  logSession,
  getSessions,
  getPatients,
  getSettings,
  saveSettings,
  resetAll,
} from '../../Therapist/shared/core/store.js';

// Default to the LOCAL (demo) path: not logged in, not guest. Individual cloud
// tests flip isLoggedIn → true and re-assert the mocked api fns are called.
beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  isLoggedIn.mockReturnValue(false);
  isGuest.mockReturnValue(false);
  apiGet.mockResolvedValue(null);
  apiPost.mockResolvedValue({});
  apiPut.mockResolvedValue({});
  apiDelete.mockResolvedValue({});
});

const REF = { exerciseId: 'shoulder', jointAngles: { right_shoulder: 158 }, landmarks: [] };

/* ── References ─────────────────────────────────────────── */
describe('store · references (local demo path)', () => {
  it('getReference returns null when nothing is saved', () => {
    expect(getReference('shoulder', 'p1')).toBeNull();
  });

  it('getAllReferences returns an empty object for a fresh patient', () => {
    expect(getAllReferences('p1')).toEqual({});
  });

  it('saveReference persists per-patient and getReference reads it back', async () => {
    await saveReference('shoulder', REF, 'p1');
    expect(getReference('shoulder', 'p1')).toEqual(REF);
    // Scoped per patient: a different patient does not see it.
    expect(getReference('shoulder', 'p2')).toBeNull();
  });

  it('saveReference scopes to the library (__library__) when no patientId is given', async () => {
    await saveReference('knee', { jointAngles: { right_knee: 172 } });
    expect(getReference('knee')).toEqual({ jointAngles: { right_knee: 172 } });
    // Library scope is distinct from a named patient scope.
    expect(getReference('knee', 'p1')).toBeNull();
  });

  it('getAllReferences returns all saved references for the patient', async () => {
    await saveReference('shoulder', REF, 'p1');
    await saveReference('knee', { jointAngles: { right_knee: 172 } }, 'p1');
    const all = getAllReferences('p1');
    expect(Object.keys(all).sort()).toEqual(['knee', 'shoulder']);
    expect(all.shoulder).toEqual(REF);
  });

  it('clearReference removes a single reference, leaving others intact', async () => {
    await saveReference('shoulder', REF, 'p1');
    await saveReference('knee', { jointAngles: { right_knee: 172 } }, 'p1');
    await clearReference('shoulder', 'p1');
    expect(getReference('shoulder', 'p1')).toBeNull();
    expect(getReference('knee', 'p1')).not.toBeNull();
  });

  it('does NOT push references to cloud on the local path (not logged in)', async () => {
    await saveReference('shoulder', REF, 'p1');
    expect(apiPost).not.toHaveBeenCalled();
    await clearReference('shoulder', 'p1');
    expect(apiDelete).not.toHaveBeenCalled();
  });
});

/* ── References · cloud path ────────────────────────────── */
describe('store · references (cloud path)', () => {
  beforeEach(() => {
    isLoggedIn.mockReturnValue(true);
    isGuest.mockReturnValue(false);
  });

  it('saveReference POSTs to /references with patientId + exerciseId merged in', async () => {
    await saveReference('shoulder', REF, 'p1');
    expect(apiPost).toHaveBeenCalledTimes(1);
    const [path, body] = apiPost.mock.calls[0];
    expect(path).toBe('/references?patientId=p1');
    expect(body).toMatchObject({ ...REF, exerciseId: 'shoulder' });
    // Still persisted locally too.
    expect(getReference('shoulder', 'p1')).toEqual(REF);
  });

  it('clearReference DELETEs from /references with patientId + exerciseId', async () => {
    await saveReference('shoulder', REF, 'p1');
    apiDelete.mockClear();
    await clearReference('shoulder', 'p1');
    expect(apiDelete).toHaveBeenCalledTimes(1);
    expect(apiDelete.mock.calls[0][0]).toBe('/references?patientId=p1&exerciseId=shoulder');
  });

  it('does NOT push to cloud when logged in as a guest', async () => {
    isGuest.mockReturnValue(true);
    await saveReference('shoulder', REF, 'p1');
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('does NOT push to cloud when no patientId (library scope)', async () => {
    await saveReference('knee', { jointAngles: { right_knee: 172 } });
    expect(apiPost).not.toHaveBeenCalled();
  });
});

/* ── Plans ──────────────────────────────────────────────── */
describe('store · plans (local demo path)', () => {
  it('getPlanFull returns a blank plan with defaults when none saved', () => {
    const plan = getPlanFull('p1');
    expect(plan).toMatchObject({
      patientId: 'p1',
      items: [],
      freqPerDay: 1,
      daysPerWeek: 7,
      durationWeeks: 4,
      durationDays: 28,
      startDate: null,
      notes: '',
      updatedAt: 0,
    });
  });

  it('getPlanFull defaults patientId to p1', () => {
    expect(getPlanFull().patientId).toBe('p1');
  });

  it('getPlan returns an empty array when no plan saved', () => {
    expect(getPlan('p1')).toEqual([]);
  });

  it('savePlanFull persists membership and seeds dosage from the exercise library', async () => {
    await savePlanFull('p1', { items: [{ exerciseId: 'shoulder' }], notes: 'be gentle' });
    const plan = getPlanFull('p1');
    expect(plan.items).toHaveLength(1);
    const item = plan.items[0];
    expect(item.exerciseId).toBe('shoulder');
    // shoulder seed dose: reps 12, sets 3, holdSec 1.5, tol 15
    expect(item).toMatchObject({ reps: 12, sets: 3, holdSec: 1.5, tol: 15 });
    expect(plan.notes).toBe('be gentle');
    expect(plan.updatedAt).toBeGreaterThan(0);
  });

  it('savePlanFull preserves explicit dosage overrides (within clamp bounds)', async () => {
    await savePlanFull('p1', {
      items: [{ exerciseId: 'knee', reps: 20, sets: 4, holdSec: 3, tol: 10 }],
    });
    const item = getPlanFull('p1').items[0];
    expect(item).toMatchObject({ reps: 20, sets: 4, holdSec: 3, tol: 10 });
  });

  it('savePlanFull clamps out-of-bounds dosage to the Plan Builder limits', async () => {
    await savePlanFull('p1', {
      items: [{ exerciseId: 'shoulder', reps: 999, sets: 0, holdSec: 1000, tol: 999 }],
    });
    const item = getPlanFull('p1').items[0];
    // reps 1..50, sets 1..10, holdSec 0.5..120, tol 1..45
    expect(item.reps).toBe(50);
    expect(item.sets).toBe(1);
    expect(item.holdSec).toBe(120);
    expect(item.tol).toBe(45);
  });

  it('savePlanFull drops items referencing an unknown exercise id', async () => {
    await savePlanFull('p1', {
      items: [{ exerciseId: 'shoulder' }, { exerciseId: 'does_not_exist' }],
    });
    const plan = getPlanFull('p1');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].exerciseId).toBe('shoulder');
  });

  it('savePlanFull preserves schedule fields (freqPerDay / daysPerWeek / durationWeeks)', async () => {
    await savePlanFull('p1', {
      items: [{ exerciseId: 'shoulder' }],
      freqPerDay: 2,
      daysPerWeek: 5,
      durationWeeks: 6,
      startDate: '2026-01-01',
    });
    const plan = getPlanFull('p1');
    expect(plan.freqPerDay).toBe(2);
    expect(plan.daysPerWeek).toBe(5);
    expect(plan.durationWeeks).toBe(6);
    expect(plan.startDate).toBe('2026-01-01');
  });

  it('getPlan returns just the exercise ids of the full plan', async () => {
    await savePlanFull('p1', { items: [{ exerciseId: 'shoulder' }, { exerciseId: 'knee' }] });
    expect(getPlan('p1')).toEqual(['shoulder', 'knee']);
  });

  it('savePlan sets membership from an id array, preserving existing dosage', async () => {
    // First, give shoulder a custom dose via savePlanFull.
    await savePlanFull('p1', { items: [{ exerciseId: 'shoulder', reps: 7, sets: 2, holdSec: 2, tol: 9 }] });
    // Now reorder/add via the legacy id-array API.
    await savePlan('p1', ['knee', 'shoulder']);
    const plan = getPlanFull('p1');
    expect(plan.items.map((i) => i.exerciseId)).toEqual(['knee', 'shoulder']);
    // shoulder kept its custom dose (preserved through savePlan).
    const shoulder = plan.items.find((i) => i.exerciseId === 'shoulder');
    expect(shoulder).toMatchObject({ reps: 7, sets: 2, holdSec: 2, tol: 9 });
    // knee was newly added → seeded from the library (reps 15, sets 2).
    const knee = plan.items.find((i) => i.exerciseId === 'knee');
    expect(knee).toMatchObject({ reps: 15, sets: 2 });
  });

  it('savePlan drops unknown ids', async () => {
    await savePlan('p1', ['shoulder', 'nope']);
    expect(getPlan('p1')).toEqual(['shoulder']);
  });

  it('plans are scoped per patient', async () => {
    await savePlanFull('p1', { items: [{ exerciseId: 'shoulder' }] });
    expect(getPlan('p1')).toEqual(['shoulder']);
    expect(getPlan('p2')).toEqual([]);
  });

  it('does NOT push the plan to cloud on the local path', async () => {
    await savePlanFull('p1', { items: [{ exerciseId: 'shoulder' }] });
    expect(apiPut).not.toHaveBeenCalled();
  });
});

/* ── Plans · cloud path ─────────────────────────────────── */
describe('store · plans (cloud path)', () => {
  beforeEach(() => {
    isLoggedIn.mockReturnValue(true);
    isGuest.mockReturnValue(false);
  });

  it('savePlanFull PUTs to /plans with the schedule + items payload', async () => {
    await savePlanFull('p1', {
      items: [{ exerciseId: 'shoulder' }],
      freqPerDay: 2,
      daysPerWeek: 5,
      durationWeeks: 6,
      notes: 'cloud notes',
    });
    expect(apiPut).toHaveBeenCalledTimes(1);
    const [path, payload] = apiPut.mock.calls[0];
    expect(path).toBe('/plans?patientId=p1');
    expect(payload.freqPerDay).toBe(2);
    expect(payload.daysPerWeek).toBe(5);
    expect(payload.durationWeeks).toBe(6);
    expect(payload.notes).toBe('cloud notes');
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].exerciseId).toBe('shoulder');
    // Local copy still written.
    expect(getPlan('p1')).toEqual(['shoulder']);
  });

  it('savePlan (legacy) reaches the cloud via savePlanFull → apiPut', async () => {
    await savePlan('p1', ['shoulder']);
    expect(apiPut).toHaveBeenCalledTimes(1);
    expect(apiPut.mock.calls[0][0]).toBe('/plans?patientId=p1');
  });

  it('does NOT PUT to cloud when guest', async () => {
    isGuest.mockReturnValue(true);
    await savePlanFull('p1', { items: [{ exerciseId: 'shoulder' }] });
    expect(apiPut).not.toHaveBeenCalled();
    // ...but the local copy is still saved.
    expect(getPlan('p1')).toEqual(['shoulder']);
  });
});

/* ── Sessions ───────────────────────────────────────────── */
describe('store · sessions', () => {
  it('getSessions seeds a demo list on first read (newest-first)', () => {
    const list = getSessions();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((s) => s.source === 'seed')).toBe(true);
    // Sorted newest-first by endedAt.
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].endedAt).toBeGreaterThanOrEqual(list[i].endedAt);
    }
  });

  it('getSessions filters by patientId', () => {
    const p1 = getSessions('p1');
    expect(p1.length).toBeGreaterThan(0);
    expect(p1.every((s) => s.patientId === 'p1')).toBe(true);
  });

  it('logSession prepends a new session and tags it with an id', () => {
    getSessions(); // seed first
    const now = Date.now();
    logSession({ patientId: 'p1', exerciseId: 'shoulder', endedAt: now, avgScore: 95, reps: 10, sets: 3 });
    const list = getSessions('p1');
    expect(list[0].id).toBe('s_' + now);
    expect(list[0].avgScore).toBe(95);
    expect(list[0].endedAt).toBe(now);
  });

  it('logSession return value places the new entry first', () => {
    const now = Date.now();
    const ret = logSession({ patientId: 'p9', exerciseId: 'knee', endedAt: now, avgScore: 50 });
    expect(ret[0].id).toBe('s_' + now);
    expect(ret[0].patientId).toBe('p9');
  });

  it('getSessions returns persisted (not re-seeded) sessions after a log', () => {
    logSession({ patientId: 'pX', exerciseId: 'knee', endedAt: Date.now(), avgScore: 60 });
    const all = getSessions();
    // The brand-new logged session is present.
    expect(all.some((s) => s.patientId === 'pX')).toBe(true);
  });
});

/* ── Patients ───────────────────────────────────────────── */
describe('store · patients (seeded demo list)', () => {
  it('getPatients seeds a deterministic 4-patient demo roster', () => {
    const patients = getPatients();
    expect(patients).toHaveLength(4);
    expect(patients.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(patients[0]).toMatchObject({ id: 'p1', name: 'Aree S.', adherence: 86, avgScore: 91, status: 'live' });
  });

  it('getPatients returns persisted roster on subsequent reads', () => {
    const first = getPatients();
    const second = getPatients();
    expect(second).toEqual(first);
  });

  it('each seeded patient carries a 7-point trend and a Thai condition', () => {
    for (const p of getPatients()) {
      expect(Array.isArray(p.trend)).toBe(true);
      expect(p.trend).toHaveLength(7);
      expect(typeof p.condTh).toBe('string');
    }
  });
});

/* ── Settings ───────────────────────────────────────────── */
describe('store · settings', () => {
  it('getSettings returns shipped defaults with nothing saved', () => {
    expect(getSettings()).toEqual({ modelVariant: 'full', voice: true, mirror: true });
  });

  it('saveSettings merges a patch over the defaults', () => {
    saveSettings({ voice: false });
    expect(getSettings()).toEqual({ modelVariant: 'full', voice: false, mirror: true });
  });

  it('saveSettings accumulates across multiple patches', () => {
    saveSettings({ voice: false });
    saveSettings({ mirror: false });
    saveSettings({ modelVariant: 'lite' });
    expect(getSettings()).toEqual({ modelVariant: 'lite', voice: false, mirror: false });
  });
});

/* ── Reset ──────────────────────────────────────────────── */
describe('store · resetAll', () => {
  it('clears references, plans, sessions, patients, and settings', async () => {
    await saveReference('shoulder', REF, 'p1');
    await savePlanFull('p1', { items: [{ exerciseId: 'shoulder' }] });
    logSession({ patientId: 'p1', exerciseId: 'shoulder', endedAt: Date.now(), avgScore: 90 });
    getPatients();          // seed patients
    saveSettings({ voice: false });

    resetAll();

    expect(getReference('shoulder', 'p1')).toBeNull();
    expect(getPlan('p1')).toEqual([]);
    expect(getSettings()).toEqual({ modelVariant: 'full', voice: true, mirror: true });
    // Sessions / patients re-seed from scratch (back to defaults), not the logged data.
    expect(getSessions().every((s) => s.source === 'seed')).toBe(true);
    expect(getPatients()).toHaveLength(4);
  });
});
