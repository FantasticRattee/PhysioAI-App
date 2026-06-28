// PhysioAI · Version-2 — persistence.
//
// Cloud-aware: when API_BASE is set, references / plan / sessions go to the
// Supabase-backed Express API (with the JWT). Local AsyncStorage persistence is
// reserved for dev/demo mode so production config/API failures stay visible.
// Settings always stay local (device preferences).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCloud, isDemoEnabled, apiConfigError, apiGet, apiPost, apiPut } from './api.js';
import { findExercise, normalizeExerciseSnapshot } from './exercises.js';

const K = {
  refs: 'physioai.v2.references',
  plans: 'physioai.v2.plans',
  sessions: 'physioai.v2.sessions',
  settings: 'physioai.v2.settings',
};

async function read(key, fallback) {
  try { const r = await AsyncStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}
async function write(key, val) {
  try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function requireLocalDemo() {
  if (!isDemoEnabled()) throw apiConfigError();
}
function failOrFallback(error, fallback) {
  if (isDemoEnabled()) return fallback;
  throw error;
}

/* ── References (therapist-captured target poses) ── */
export async function getReference(exerciseId) {
  if (isCloud()) {
    try { const refs = await apiGet('/references'); return (refs || []).find((r) => r.exerciseId === exerciseId) || null; }
    catch (error) { return failOrFallback(error, null); }
  }
  requireLocalDemo();
  return (await read(K.refs, {}))[exerciseId] || null;
}
export async function getAllReferences() {
  if (isCloud()) {
    try { const refs = await apiGet('/references'); const m = {}; for (const r of refs || []) m[r.exerciseId] = r; return m; }
    catch (error) { return failOrFallback(error, {}); }
  }
  requireLocalDemo();
  return read(K.refs, {});
}
export async function saveReference(exerciseId, reference) {
  if (isCloud()) {
    await apiPost('/references', { exerciseId, ...reference });
    return;
  }
  requireLocalDemo();
  const all = await read(K.refs, {});
  all[exerciseId] = reference;
  await write(K.refs, all);
}

/* ── Treatment plan (Home Exercise Program) ──────────────────
 * Rich plan: { items:[{exerciseId,reps,sets,holdSec,tol}], freqPerDay,
 *   daysPerWeek, startDate, durationWeeks, notes }. The therapist sets it
 * (Plan Builder → cloud); the patient reads it. getPlan() keeps the old
 * exerciseIds-array contract for callers that only need membership.           */
const PLAN_DEFAULTS = { freqPerDay: 1, daysPerWeek: 7, durationWeeks: 4, durationDays: 28 };

const clampInt = (v, min, max, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };
const clampNum = (v, min, max, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt; };

// Build one plan item: take ONLY the known dose keys from `over` (never spread
// arbitrary remote fields) and clamp each to the same bounds the Plan Builder
// enforces, so a malformed cloud/legacy payload can't poison the dose.
function planItem(exerciseId, over = {}) {
  const snap = normalizeExerciseSnapshot(over.exercise || over.exerciseSnapshot || over);
  const ex = findExercise(exerciseId, snap ? [snap] : []);
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
  if (snap?.source === 'custom') item.exercise = snap;
  return item;
}
// No therapist plan yet → EMPTY (Home shows "waiting for therapist"; the builtin
// exercises still appear as optional Extras).
function defaultPlan(patientId) {
  return { patientId, items: [], ...PLAN_DEFAULTS, startDate: null, notes: '' };
}
// Coerce any stored/remote shape (rich object, legacy exerciseIds, array, null) into a full
// plan. Items referencing an unknown exercise id are dropped (never silently rendered as
// another exercise) — getExercise falls back to EXERCISES[0], which would be misleading.
function normalizePlan(raw, patientId) {
  const items = (ids) => ids.map((id) => planItem(id)).filter(Boolean);
  if (Array.isArray(raw)) {
    return { patientId, items: items(raw), ...PLAN_DEFAULTS, startDate: null, notes: '' };
  }
  if (raw && Array.isArray(raw.items)) {
    const normalizedItems = raw.items
      .map((i) => planItem(i.exerciseId, i))
      .filter(Boolean);
    return {
      patientId,
      items: normalizedItems,
      freqPerDay: raw.freqPerDay ?? PLAN_DEFAULTS.freqPerDay,
      daysPerWeek: raw.daysPerWeek ?? PLAN_DEFAULTS.daysPerWeek,
      durationWeeks: raw.durationWeeks ?? PLAN_DEFAULTS.durationWeeks,
      durationDays: raw.durationDays ?? (raw.durationWeeks ? raw.durationWeeks * 7 : PLAN_DEFAULTS.durationDays),
      startDate: raw.startDate ?? null, notes: raw.notes ?? '',
    };
  }
  if (raw && Array.isArray(raw.exerciseIds)) { // legacy cloud shape
    return { patientId, items: items(raw.exerciseIds), ...PLAN_DEFAULTS, startDate: null, notes: '' };
  }
  return null;
}

export async function getPlanFull(patientId = 'p1') {
  if (isCloud()) {
    try { return normalizePlan(await apiGet('/plans'), patientId) || defaultPlan(patientId); }
    catch (error) { return failOrFallback(error, defaultPlan(patientId)); }
  }
  requireLocalDemo();
  const plans = await read(K.plans, {});
  return normalizePlan(plans[patientId], patientId) || defaultPlan(patientId);
}
export async function getPlan(patientId = 'p1') {
  return (await getPlanFull(patientId)).items.map((i) => i.exerciseId);
}
export async function savePlanFull(patientId, plan) {
  if (isCloud()) {
    await apiPut('/plans', plan);
    return;
  }
  requireLocalDemo();
  const plans = await read(K.plans, {});
  plans[patientId] = { ...plan, patientId };
  await write(K.plans, plans);
}
// Membership-only update that PRESERVES each kept exercise's dosage (mirrors the
// therapist store) so changing the plan's exercise set never wipes the prescription.
export async function savePlan(patientId, exerciseIds) {
  const full = await getPlanFull(patientId);
  const byId = Object.fromEntries(full.items.map((i) => [i.exerciseId, i]));
  full.items = exerciseIds.map((id) => byId[id] || planItem(id)).filter(Boolean);
  await savePlanFull(patientId, full);
}

/* ── Session logs ── */
export async function logSession(session) {
  if (isCloud()) {
    await apiPost('/sessions', session);
    return;
  }
  requireLocalDemo();
  const list = await read(K.sessions, []);
  list.unshift({ id: 's_' + session.endedAt, ...session });
  await write(K.sessions, list.slice(0, 200));
}
// Coerce a session into the client's contract: endedAt as epoch-ms NUMBER (the
// backend may serialize it as an ISO string or BigInt), and a kind that defaults to
// 'plan' (never 'extra') when absent — so adherence stays correct across the cloud.
function toMs(v) {
  const n = Number(v);
  if (Number.isFinite(n)) return n;          // number or numeric string (epoch ms)
  const d = Number(new Date(v));             // ISO / date string
  return Number.isFinite(d) ? d : 0;
}
const normalizeSession = (s) => ({ ...s, endedAt: toMs(s.endedAt), kind: s.kind || 'plan' });

export async function getSessions(patientId) {
  if (isCloud()) {
    try { return (await apiGet('/sessions') || []).map(normalizeSession); }
    catch (error) { return failOrFallback(error, []); }
  }
  requireLocalDemo();
  let list = (await read(K.sessions, [])).map(normalizeSession);
  list = list.sort((a, b) => b.endedAt - a.endedAt);
  return patientId ? list.filter((s) => s.patientId === patientId) : list;
}

/* ── Settings (always local — device preferences) ── */
const DEFAULT_SETTINGS = { voice: true, modelVariant: 'full', mirror: true };
export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await read(K.settings, {})) };
}
export async function saveSettings(patch) {
  await write(K.settings, { ...(await getSettings()), ...patch });
}
