// PhysioAI · Version-1 — local persistence (localStorage) plus cloud sync for real accounts.
// Holds: captured reference poses, prescribed plans, session logs, demo patients, settings.
// Namespaced under `physioai.v1.*`.

import { getExercises, exerciseExists, exerciseSnapshot } from './exercises.js';
import { apiDelete, apiGet, apiPost, apiPut } from './api.js';
import { isLoggedIn, isGuest } from './auth.js';

const K = {
  refs: 'physioai.v1.references',     // { [patientId or __library__]: { [exerciseId]: reference } }
  plans: 'physioai.v1.plans',         // { [patientId]: [exerciseId, ...] }
  sessions: 'physioai.v1.sessions',   // [ sessionLog, ... ]
  patients: 'physioai.v1.patients',   // [ patient, ... ]
  settings: 'physioai.v1.settings',   // { modelVariant, voice, mirror, ... }
};

function read(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/* ── References (captured target poses) ─────────────────── */
const LIBRARY_REFERENCE_ID = '__library__';
const LEGACY_DEMO_REFERENCE_ID = '__demo__';

function scopedPatientId(patientId) {
  return patientId || LIBRARY_REFERENCE_ID;
}

function isReferenceEntry(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && (value.jointAngles || value.restJointAngles || value.landmarks || value.exerciseId);
}

function isLegacyReferenceStore(value) {
  return value && typeof value === 'object' && Object.values(value).some(isReferenceEntry);
}

function refsForPatient(patientId) {
  const all = read(K.refs, {});
  if (isLegacyReferenceStore(all)) return all;
  const key = scopedPatientId(patientId);
  if (!patientId && !all[key] && all[LEGACY_DEMO_REFERENCE_ID]) return all[LEGACY_DEMO_REFERENCE_ID] || {};
  return all[key] || {};
}

function writeRefsForPatient(patientId, refs) {
  const all = read(K.refs, {});
  const next = isLegacyReferenceStore(all) ? {} : all;
  next[scopedPatientId(patientId)] = refs;
  if (!patientId && next[LEGACY_DEMO_REFERENCE_ID]) delete next[LEGACY_DEMO_REFERENCE_ID];
  write(K.refs, next);
}

async function pushReferenceToCloud(patientId, exerciseId, reference) {
  if (!patientId || !isLoggedIn() || isGuest()) return;
  await apiPost('/references?patientId=' + encodeURIComponent(patientId), { ...reference, exerciseId });
}

async function deleteReferenceFromCloud(patientId, exerciseId) {
  if (!patientId || !isLoggedIn() || isGuest()) return;
  await apiDelete(
    '/references?patientId=' + encodeURIComponent(patientId) +
    '&exerciseId=' + encodeURIComponent(exerciseId)
  );
}

export function getReference(exerciseId, patientId) {
  return refsForPatient(patientId)[exerciseId] || null;
}
export function getAllReferences(patientId) {
  return refsForPatient(patientId);
}
export async function syncReferencesFromCloud(patientId) {
  if (!patientId || !isLoggedIn() || isGuest()) return getAllReferences(patientId);
  const rows = await apiGet('/references?patientId=' + encodeURIComponent(patientId));
  const refs = {};
  for (const ref of Array.isArray(rows) ? rows : []) {
    if (ref?.exerciseId) refs[ref.exerciseId] = ref;
  }
  writeRefsForPatient(patientId, refs);
  return refs;
}
export async function saveReference(exerciseId, reference, patientId) {
  await pushReferenceToCloud(patientId, exerciseId, reference);
  const refs = { ...refsForPatient(patientId), [exerciseId]: reference };
  writeRefsForPatient(patientId, refs);
}
export async function clearReference(exerciseId, patientId) {
  await deleteReferenceFromCloud(patientId, exerciseId);
  const refs = { ...refsForPatient(patientId) };
  delete refs[exerciseId];
  writeRefsForPatient(patientId, refs);
}

/* ── Treatment plans ────────────────────────────────────────
 * A plan is a per-patient Home Exercise Program (HEP):
 *   { patientId, items:[{exerciseId,reps,sets,holdSec,tol}], freqPerDay,
 *     daysPerWeek, startDate, durationWeeks, notes, updatedAt }
 * getPlan()/savePlan() keep the old exerciseIds-array contract (used by
 * capture.html) by reading/writing the full plan's items underneath.        */
const PLAN_DEFAULTS = { freqPerDay: 1, daysPerWeek: 7, durationWeeks: 4, durationDays: 28 };

const clampInt = (v, min, max, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };
const clampNum = (v, min, max, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };

function exerciseForPlan(exerciseId, over = {}) {
  const local = getExercises().find((e) => e.id === exerciseId);
  const remoteSnap = over.exercise || over.exerciseSnapshot || null;
  if (local) return { ex: local, snap: exerciseSnapshot(local) || remoteSnap };
  if (remoteSnap && (remoteSnap.id === exerciseId || remoteSnap.key === exerciseId)) {
    return { ex: remoteSnap, snap: remoteSnap };
  }
  return { ex: null, snap: null };
}

// Take ONLY the known dose keys (never spread arbitrary stored fields) and clamp each
// to the Plan Builder's bounds, so malformed stored data can't poison the dose.
function planItem(exerciseId, over = {}) {
  const { ex, snap } = exerciseForPlan(exerciseId, over);
  if (!ex) return null;
  const item = {
    exerciseId,
    reps: clampInt(over.reps, 1, 50, ex.reps),
    sets: clampInt(over.sets, 1, 10, ex.sets),
    holdSec: clampNum(over.holdSec, 0.5, 120, ex.holdSec),
    tol: clampInt(over.tol, 1, 45, ex.tol),
  };
  if ((ex.movementPattern || over.movementPattern) === 'alternating') {
    item.countMode = over.countMode || ex.countMode || 'per_side';
  }
  if (snap) item.exercise = snap;
  return item;
}

// Coerce any stored shape (old array, partial object, null) into a full plan. Items
// referencing an unknown exercise id are dropped (not silently rendered as another).
function normalizePlan(raw, patientId) {
  if (Array.isArray(raw)) {
    return { patientId, items: raw.filter(exerciseExists).map((id) => planItem(id)), ...PLAN_DEFAULTS, startDate: null, notes: '', updatedAt: 0 };
  }
  if (raw && Array.isArray(raw.items)) {
    return {
      patientId,
      items: raw.items.map((i) => planItem(i.exerciseId, i)).filter(Boolean),
      freqPerDay: raw.freqPerDay ?? PLAN_DEFAULTS.freqPerDay,
      daysPerWeek: raw.daysPerWeek ?? PLAN_DEFAULTS.daysPerWeek,
      durationWeeks: raw.durationWeeks ?? PLAN_DEFAULTS.durationWeeks,
      durationDays: raw.durationDays ?? (raw.durationWeeks ? raw.durationWeeks * 7 : PLAN_DEFAULTS.durationDays),
      startDate: raw.startDate ?? null,
      notes: raw.notes ?? '',
      updatedAt: raw.updatedAt ?? 0,
    };
  }
  return null;
}

export function getPlanFull(patientId = 'p1') {
  const norm = normalizePlan(read(K.plans, {})[patientId], patientId);
  if (norm) return norm;
  // No saved plan → start from a BLANK plan (therapist builds it explicitly).
  return { patientId, items: [], ...PLAN_DEFAULTS, startDate: null, notes: '', updatedAt: 0 };
}
export async function syncPlanFromCloud(patientId) {
  if (!patientId || !isLoggedIn() || isGuest()) return getPlanFull(patientId);
  const remote = await apiGet('/plans?patientId=' + encodeURIComponent(patientId));
  const norm = normalizePlan(remote, patientId);
  const plans = read(K.plans, {});
  if (norm) plans[patientId] = norm;
  else delete plans[patientId];
  write(K.plans, plans);
  return getPlanFull(patientId);
}
export async function syncPatientCloudData(patientId) {
  const [plan, refs] = await Promise.all([
    syncPlanFromCloud(patientId),
    syncReferencesFromCloud(patientId),
  ]);
  return { plan, refs };
}
export async function savePlanFull(patientId, plan) {
  const plans = read(K.plans, {});
  const full = { ...plan, patientId, updatedAt: Date.now() };
  if (isLoggedIn() && !isGuest()) await pushPlanToCloud(patientId, full);
  plans[patientId] = full;
  write(K.plans, plans);
}

// Push the plan to the backend so the Patient app gets it. Only a real therapist login
// syncs; guest/demo stays local. Real cloud saves are awaited before the UI reports success.
async function pushPlanToCloud(patientId, plan) {
  if (!patientId || !isLoggedIn() || isGuest()) return;
  const payload = {
    items: plan.items.map((item) => planItem(item.exerciseId, item)).filter(Boolean),
    freqPerDay: plan.freqPerDay,
    daysPerWeek: plan.daysPerWeek,
    durationDays: plan.durationDays,
    durationWeeks: plan.durationWeeks ?? Math.max(1, Math.ceil((plan.durationDays || 28) / 7)),
    startDate: plan.startDate,
    notes: plan.notes,
  };
  await apiPut('/plans?patientId=' + encodeURIComponent(patientId), payload);
}

// ── Back-compat: which exercises are in the plan (capture.html) ──
export function getPlan(patientId = 'p1') {
  return getPlanFull(patientId).items.map((i) => i.exerciseId);
}
export async function savePlan(patientId, exerciseIds) {
  const full = getPlanFull(patientId);
  const byId = Object.fromEntries(full.items.map((i) => [i.exerciseId, i]));
  full.items = exerciseIds.map((id) => byId[id] || planItem(id)).filter(Boolean);
  await savePlanFull(patientId, full);
}

/* ── Session logs ───────────────────────────────────────── */
const DAY = 86400000;
function seedSessions() {
  const base = Date.now(); // seeded once; dates stay recent relative to the user's clock
  const rows = [
    ['p1', 'shoulder', 1, 88, 12, 3, 96], ['p1', 'knee', 2, 90, 15, 2, 84], ['p1', 'shoulder', 4, 91, 12, 3, 72],
    ['p2', 'shoulder', 1, 82, 12, 2, 110], ['p2', 'hip', 3, 84, 12, 2, 95],
    ['p3', 'shoulder', 2, 74, 10, 2, 130], ['p3', 'knee', 5, 76, 12, 2, 140],
    ['p4', 'squat', 1, 87, 10, 3, 88], ['p4', 'knee', 2, 88, 15, 2, 90],
  ];
  return rows.map(([patientId, exerciseId, daysAgo, avgScore, reps, sets, dur], i) => ({
    id: 'seed_' + i, patientId, exerciseId, exerciseKey: exerciseId,
    endedAt: base - daysAgo * DAY, durationSec: dur, reps, sets, avgScore,
    avgDeltas: {}, source: 'seed',
  }));
}
export function logSession(session) {
  const list = read(K.sessions, getSessions());
  list.unshift({ id: 's_' + session.endedAt, ...session });
  write(K.sessions, list.slice(0, 200));
  return list;
}
export function getSessions(patientId) {
  let list = read(K.sessions, null);
  if (list == null) { list = seedSessions(); write(K.sessions, list); }
  list = list.slice().sort((a, b) => b.endedAt - a.endedAt);
  return patientId ? list.filter((s) => s.patientId === patientId) : list;
}

/* ── Demo patients (therapist dashboard) ────────────────── */
export function getPatients() {
  const seeded = read(K.patients, null);
  if (seeded) return seeded;
  const fallbackTs = 1749200000000; // fixed seed time (deterministic)
  const seed = [
    { id: 'p1', name: 'Aree S.', condition: 'Post-op knee · week 3 of 8', condTh: 'หลังผ่าตัดเข่า · สัปดาห์ที่ 3 จาก 8', adherence: 86, avgScore: 91, sessions: 14, status: 'live',    lastSeenMin: 0,    trend: [78, 82, 80, 85, 88, 90, 91] },
    { id: 'p2', name: 'Somchai P.', condition: 'Frozen shoulder · week 5', condTh: 'ไหล่ติด · สัปดาห์ที่ 5', adherence: 72, avgScore: 84, sessions: 11, status: 'offline', lastSeenMin: 95,   trend: [70, 74, 76, 80, 82, 83, 84] },
    { id: 'p3', name: 'Nattaya K.', condition: 'Stroke rehab · upper limb', condTh: 'ฟื้นฟูหลอดเลือดสมอง · แขนส่วนบน', adherence: 64, avgScore: 76, sessions: 9, status: 'offline', lastSeenMin: 1440, trend: [60, 68, 70, 72, 74, 75, 76] },
    { id: 'p4', name: 'Wichai T.', condition: 'Hip replacement · week 2', condTh: 'เปลี่ยนข้อสะโพก · สัปดาห์ที่ 2', adherence: 91, avgScore: 88, sessions: 16, status: 'offline', lastSeenMin: 220,  trend: [80, 83, 85, 86, 87, 88, 88] },
  ];
  write(K.patients, seed);
  void fallbackTs;
  return seed;
}

/* ── Settings ───────────────────────────────────────────── */
const DEFAULT_SETTINGS = { modelVariant: 'full', voice: true, mirror: true };
export function getSettings() { return { ...DEFAULT_SETTINGS, ...read(K.settings, {}) }; }
export function saveSettings(patch) {
  write(K.settings, { ...getSettings(), ...patch });
}

/* ── Reset ──────────────────────────────────────────────── */
export function resetAll() {
  Object.values(K).forEach((k) => { try { localStorage.removeItem(k); } catch {} });
}
