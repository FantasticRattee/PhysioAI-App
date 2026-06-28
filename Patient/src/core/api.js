// PhysioAI · Version-2 — backend API client.
//
// Set EXPO_PUBLIC_API_BASE to your deployed Supabase-backed Express API.
// Local/demo storage is available only in development, or when explicitly enabled
// with EXPO_PUBLIC_ENABLE_DEMO=true. This prevents production builds from silently
// creating mock users if the API URL is missing.
const flagOn = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || '').replace(/\/+$/, '');
export const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
export const IS_PRODUCTION = !IS_DEV;
export const DEMO_ENABLED = flagOn(process.env.EXPO_PUBLIC_ENABLE_DEMO) || (IS_DEV && !API_BASE);

export const isCloud = () => !!API_BASE;
export const isDemoEnabled = () => DEMO_ENABLED;

export function apiConfigError(code = 'api_not_configured') {
  const err = new Error(code);
  err.code = code;
  return err;
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'physioai.v2.token';
export async function getToken() {
  try { return await AsyncStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export async function setToken(t) {
  try { if (t) await AsyncStorage.setItem(TOKEN_KEY, t); else await AsyncStorage.removeItem(TOKEN_KEY); } catch {}
}

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) { const t = await getToken(); if (t) headers.authorization = 'Bearer ' + t; }
  const res = await fetch(API_BASE + path, {
    method, headers, body: body != null ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((data && data.error) || `http_${res.status}`);
    err.code = data && data.error;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const apiGet = (p, opts) => req(p, { method: 'GET', ...(opts || {}) });
export const apiPost = (p, body, opts) => req(p, { method: 'POST', body, ...(opts || {}) });
export const apiPut = (p, body, opts) => req(p, { method: 'PUT', body, ...(opts || {}) });
