// PhysioAI · Therapist (web) — backend API client.
// Mirrors App/Patient/src/core/api.js, but uses localStorage (browser) for the token.
//
// Same-origin by default: the Node server serves this frontend and the API.
// Override before loading the app with: window.PHYSIOAI_API_BASE = 'https://...'
const flagOn = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
const host = globalThis.location?.hostname || '';
const protocol = globalThis.location?.protocol || '';
const port = globalThis.location?.port || '';
const privateLan = host.startsWith('10.') || host.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
const localHost = !host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local') || privateLan;
const localFile = protocol === 'file:';

// Backend URL resolution:
//   1. explicit window.PHYSIOAI_API_BASE wins (cloud / custom deploys)
//   2. file:// → the local backend on :3000
//   3. local dev served by something OTHER than the backend itself — e.g. VS Code
//      "Open with Live Server" (:5500) — → talk to the backend on :3000. The
//      backend's CORS reflects Origin, so cross-port dev just works.
//   4. otherwise same-origin: the Node server that serves this page IS the API
//      (local `node server.js` on :3000, or the cloud deploy).
function resolveApiBase() {
  if (globalThis.PHYSIOAI_API_BASE) return globalThis.PHYSIOAI_API_BASE;
  if (localFile) return 'http://localhost:3000';
  if (localHost && port && port !== '3000') return `${protocol}//${host}:3000`;
  return '';
}
export const API_BASE = resolveApiBase();
export const DEMO_ENABLED = flagOn(globalThis.PHYSIOAI_ENABLE_DEMO) || localHost || localFile;

export const isCloud = () => !!API_BASE;
export const isDemoEnabled = () => DEMO_ENABLED;

const TOKEN_KEY = 'physioai.v1.token';
export function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
export function setToken(tk) { try { if (tk) localStorage.setItem(TOKEN_KEY, tk); else localStorage.removeItem(TOKEN_KEY); } catch {} }

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) { const tk = getToken(); if (tk) headers.authorization = 'Bearer ' + tk; }
  const res = await fetch(API_BASE + path, {
    method, headers, body: body != null ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((data && data.error) || ('http_' + res.status));
    err.code = data && data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const apiGet = (p, opts) => req(p, { method: 'GET', ...(opts || {}) });
export const apiPost = (p, body, opts) => req(p, { method: 'POST', body, ...(opts || {}) });
export const apiPut = (p, body, opts) => req(p, { method: 'PUT', body, ...(opts || {}) });
export const apiDelete = (p, body, opts) => req(p, { method: 'DELETE', body, ...(opts || {}) });
