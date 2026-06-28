// PhysioAI · Therapist (web) — therapist authentication against the cloud backend.
// Login/register hit POST /auth/* and store the returned JWT (api.js) + cached user.
// Only therapist-role accounts are accepted into the Therapist console.

import { apiPost, apiGet, setToken, getToken, isDemoEnabled } from './api.js';

const K_THERAPIST = 'physioai.v1.therapist'; // cached { id, name, email, role }
const K_GUEST = 'physioai.v1.guest';         // '1' when browsing as guest (demo, no cloud)

export function getTherapist() {
  try { const r = localStorage.getItem(K_THERAPIST); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function save(user) { try { localStorage.setItem(K_THERAPIST, JSON.stringify(user)); localStorage.removeItem(K_GUEST); } catch {} return user; }

export function isLoggedIn() { return !!getToken() && !!getTherapist(); }

// Guest = quick live demo: no login, no token, localStorage only. Available only
// when demo mode is enabled; cleared on a real login or on logout.
export function isGuest() { try { return isDemoEnabled() && localStorage.getItem(K_GUEST) === '1'; } catch { return false; } }
export function continueAsGuest() {
  if (!isDemoEnabled()) { const err = new Error('demo_disabled'); err.code = 'demo_disabled'; throw err; }
  try { localStorage.setItem(K_GUEST, '1'); } catch {}
  return { guest: true, name: 'Guest' };
}

export function logout() {
  setToken(null);
  try { localStorage.removeItem(K_THERAPIST); localStorage.removeItem(K_GUEST); } catch {}
}

export async function login({ email, password }) {
  const e = (email || '').trim().toLowerCase();
  if (!e || !password) { const err = new Error('required'); err.code = 'required'; throw err; }
  // → { token, user } ; errors: { error:'invalid'|'required' }
  const data = await apiPost('/auth/login', { email: e, password }, { auth: false });
  if (data.user?.role !== 'therapist') { setToken(null); const err = new Error('not_therapist'); err.code = 'not_therapist'; throw err; }
  setToken(data.token);
  return save(data.user);
}

export async function register({ name, email, password }) {
  const e = (email || '').trim().toLowerCase();
  const n = (name || '').trim();
  if (!n || !e || !password) { const err = new Error('required'); err.code = 'required'; throw err; }
  // → { token, user } ; errors: { error:'exists'|'required' }
  const data = await apiPost('/auth/register', { name: n, email: e, password, role: 'therapist' }, { auth: false });
  setToken(data.token);
  return save(data.user);
}

export async function resendVerification(email) {
  const e = (email || '').trim().toLowerCase();
  if (!e) { const err = new Error('required'); err.code = 'required'; throw err; }
  return apiPost('/auth/resend-verification', { email: e }, { auth: false });
}

// Re-validate the cached token against the backend. Updates the cache on success;
// on network error it leaves the cached session intact (offline-friendly).
export async function verify() {
  try { const { user } = await apiGet('/auth/me'); if (user?.role === 'therapist') return save(user); }
  catch {}
  return null;
}
