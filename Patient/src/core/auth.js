// PhysioAI · Version-2 — Auth.
//
// Cloud-aware: when API_BASE (src/core/api.js) is set, register/login hit the
// Supabase-backed Express API (POST /auth/*) and store the returned JWT. Local
// mock auth is available only in dev/demo mode, never silently in production.
// Either way the screens are unchanged (same signatures + error codes).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCloud, isDemoEnabled, apiConfigError, apiPost, setToken } from './api.js';

const K_SESSION = 'physioai.v2.session';
const K_USERS = 'physioai.v2.users'; // local-mock account store only

async function saveSession(session) {
  await AsyncStorage.setItem(K_SESSION, JSON.stringify(session));
  return session;
}

/** Current session ({ id, name, email, role } | { guest:true } | null). */
export async function getSession() {
  try { const r = await AsyncStorage.getItem(K_SESSION); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

export async function logout() {
  try { await AsyncStorage.removeItem(K_SESSION); } catch {}
  if (isCloud()) await setToken(null);
}

/** Browse without an account (local only — no cloud sync). */
export async function continueAsGuest() {
  if (!isDemoEnabled()) throw apiConfigError('demo_disabled');
  return saveSession({ guest: true, name: 'Guest' });
}

export async function register({ name, email, password }) {
  const e = (email || '').trim().toLowerCase();
  const n = (name || '').trim();
  if (!n || !e || !password) { const err = new Error('required'); err.code = 'required'; throw err; }

  if (isCloud()) {
    // → POST /auth/register : { token, user } ; errors: { error:'exists'|'required' }
    const data = await apiPost('/auth/register', { name: n, email: e, password, role: 'patient' }, { auth: false });
    await setToken(data.token);
    return saveSession(data.user);
  }

  if (!isDemoEnabled()) throw apiConfigError();

  // ── local mock ──
  const users = await readUsers();
  if (users[e]) { const err = new Error('exists'); err.code = 'exists'; throw err; }
  users[e] = { name: n, email: e, password };
  await AsyncStorage.setItem(K_USERS, JSON.stringify(users));
  return saveSession({ email: e, name: n, token: 'mock-' + Date.now() });
}

export async function login({ email, password }) {
  const e = (email || '').trim().toLowerCase();
  if (!e || !password) { const err = new Error('required'); err.code = 'required'; throw err; }

  if (isCloud()) {
    // → POST /auth/login : { token, user } ; errors: { error:'invalid'|'required' }
    const data = await apiPost('/auth/login', { email: e, password }, { auth: false });
    if (data.user?.role && data.user.role !== 'patient') {
      await setToken(null);
      const err = new Error('not_patient');
      err.code = 'not_patient';
      throw err;
    }
    await setToken(data.token);
    return saveSession(data.user);
  }

  if (!isDemoEnabled()) throw apiConfigError();

  // ── local mock ──
  const users = await readUsers();
  const u = users[e];
  if (!u || u.password !== password) { const err = new Error('invalid'); err.code = 'invalid'; throw err; }
  return saveSession({ email: e, name: u.name, token: 'mock-' + Date.now() });
}

async function readUsers() {
  try { const r = await AsyncStorage.getItem(K_USERS); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
}
