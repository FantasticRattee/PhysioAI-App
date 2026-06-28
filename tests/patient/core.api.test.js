// Tests for Patient/src/core/api.js — the backend API client.
//
// API_BASE / isCloud / DEMO_ENABLED are computed at IMPORT TIME from
// process.env. Because Babel hoists ESM `import` above top-level statements, a
// static `import` of the module under test would run BEFORE we could set the
// env var. So we set the env first, then load the module via require() under
// jest.resetModules() so import-time config is re-evaluated each time.
//
// We also pull AsyncStorage from the SAME (freshly reset) module registry as
// the module under test, so token round-trips share one in-memory store.

const MOD_PATH = '../../Patient/src/core/api.js';
const STORAGE_PATH = '@react-native-async-storage/async-storage';
const TOKEN_KEY = 'physioai.v2.token';

let api;
let AsyncStorage;

// Load a fresh copy of the module (and its AsyncStorage) with
// EXPO_PUBLIC_API_BASE set to `base`.
const loadApi = (base = 'https://api.test') => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_API_BASE = base;
  AsyncStorage = require(STORAGE_PATH);
  AsyncStorage.__reset();
  api = require(MOD_PATH);
  return api;
};

// Build a fake fetch Response with a given status + json payload.
// Pass jsonBody === undefined to simulate a response with no/invalid JSON.
const mkRes = (status, jsonBody) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (jsonBody === undefined) throw new Error('no body');
    return jsonBody;
  },
});

beforeEach(() => {
  loadApi('https://api.test');
  global.fetch = jest.fn(async () => mkRes(200, {}));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('API_BASE / isCloud', () => {
  it('uses the configured base verbatim when no trailing slash', () => {
    expect(api.API_BASE).toBe('https://api.test');
  });

  it('strips one or many trailing slashes from the base', () => {
    const fresh = loadApi('https://api.test/v2///');
    expect(fresh.API_BASE).toBe('https://api.test/v2');
  });

  it('isCloud() is true when a base URL is set', () => {
    expect(api.isCloud()).toBe(true);
  });

  it('isCloud() is false and API_BASE is empty when no base is set', () => {
    const fresh = loadApi('');
    expect(fresh.API_BASE).toBe('');
    expect(fresh.isCloud()).toBe(false);
  });
});

describe('apiConfigError', () => {
  it('returns an Error carrying the given code', () => {
    const err = api.apiConfigError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('boom');
    expect(err.message).toBe('boom');
  });

  it('defaults to code "api_not_configured"', () => {
    const err = api.apiConfigError();
    expect(err.code).toBe('api_not_configured');
    expect(err.message).toBe('api_not_configured');
  });
});

describe('getToken / setToken round-trip', () => {
  it('returns null when no token stored', async () => {
    await expect(api.getToken()).resolves.toBeNull();
  });

  it('stores the token under the v2 token key and reads it back', async () => {
    await api.setToken('abc123');
    await expect(api.getToken()).resolves.toBe('abc123');
    expect(AsyncStorage.__dump()[TOKEN_KEY]).toBe('abc123');
  });

  it('removes the token when set to a falsy value', async () => {
    await api.setToken('abc123');
    await api.setToken(null);
    await expect(api.getToken()).resolves.toBeNull();
    expect(AsyncStorage.__dump()[TOKEN_KEY]).toBeUndefined();
  });
});

describe('apiGet / apiPost / apiPut request shape', () => {
  it('apiGet issues a GET with JSON content-type and no body', async () => {
    global.fetch = jest.fn(async () => mkRes(200, { ok: 1 }));
    const out = await api.apiGet('/ping');
    expect(out).toEqual({ ok: 1 });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/ping');
    expect(opts.method).toBe('GET');
    expect(opts.headers['content-type']).toBe('application/json');
    expect(opts.body).toBeUndefined();
  });

  it('apiPost serializes the body to JSON and uses POST', async () => {
    global.fetch = jest.fn(async () => mkRes(200, { id: 7 }));
    const out = await api.apiPost('/users', { name: 'Sam' });
    expect(out).toEqual({ id: 7 });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/users');
    expect(opts.method).toBe('POST');
    expect(opts.headers['content-type']).toBe('application/json');
    expect(opts.body).toBe(JSON.stringify({ name: 'Sam' }));
  });

  it('apiPut serializes the body to JSON and uses PUT', async () => {
    global.fetch = jest.fn(async () => mkRes(200, {}));
    await api.apiPut('/users/7', { name: 'Sam2' });

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/users/7');
    expect(opts.method).toBe('PUT');
    expect(opts.body).toBe(JSON.stringify({ name: 'Sam2' }));
  });

  it('apiPost without a body sends no body', async () => {
    global.fetch = jest.fn(async () => mkRes(200, {}));
    await api.apiPost('/noop');
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.body).toBeUndefined();
  });
});

describe('Authorization header', () => {
  it('attaches Bearer <token> when a token is stored and auth is on', async () => {
    await api.setToken('tok-xyz');
    global.fetch = jest.fn(async () => mkRes(200, {}));
    await api.apiGet('/me');

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.authorization).toBe('Bearer tok-xyz');
  });

  it('omits Authorization when no token is stored', async () => {
    global.fetch = jest.fn(async () => mkRes(200, {}));
    await api.apiGet('/me');

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.authorization).toBeUndefined();
  });

  it('omits Authorization when auth: false even if a token is stored', async () => {
    await api.setToken('tok-xyz');
    global.fetch = jest.fn(async () => mkRes(200, {}));
    await api.apiGet('/public', { auth: false });

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.authorization).toBeUndefined();
  });
});

describe('response handling', () => {
  it('returns parsed JSON on a 2xx', async () => {
    global.fetch = jest.fn(async () => mkRes(201, { created: true }));
    await expect(api.apiPost('/x', {})).resolves.toEqual({ created: true });
  });

  it('returns null when a 2xx has no JSON body', async () => {
    global.fetch = jest.fn(async () => mkRes(204, undefined));
    await expect(api.apiGet('/empty')).resolves.toBeNull();
  });

  it('throws an Error with .code and .status from a non-2xx error body', async () => {
    global.fetch = jest.fn(async () => mkRes(409, { error: 'exists' }));
    expect.assertions(4);
    try {
      await api.apiPost('/signup', { email: 'a@b.com' });
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('exists');
      expect(err.message).toBe('exists');
      expect(err.status).toBe(409);
    }
  });

  it('throws code "http_<status>" message when a non-2xx has no error field', async () => {
    // data is present but lacks `error`, so err.code is undefined.
    global.fetch = jest.fn(async () => mkRes(500, { somethingElse: true }));
    expect.assertions(3);
    try {
      await api.apiGet('/boom');
    } catch (err) {
      expect(err.message).toBe('http_500');
      expect(err.code).toBeUndefined();
      expect(err.status).toBe(500);
    }
  });

  it('throws "http_<status>" when a non-2xx has no JSON body at all', async () => {
    // No JSON body → data stays null → err.code = (null && ...) === null.
    global.fetch = jest.fn(async () => mkRes(404, undefined));
    expect.assertions(3);
    try {
      await api.apiGet('/missing');
    } catch (err) {
      expect(err.message).toBe('http_404');
      expect(err.code).toBeNull();
      expect(err.status).toBe(404);
    }
  });
});
