// Tests for Therapist/shared/core/api.js (jsdom environment).
// API_BASE is read at import time from window.PHYSIOAI_API_BASE, so we set it
// before importing and use jest.resetModules() + dynamic import to re-read it.

const TOKEN_KEY = 'physioai.v1.token';

/**
 * Re-import the api module with a given window.PHYSIOAI_API_BASE value.
 * Returns the freshly-loaded module namespace.
 */
async function loadApi(apiBase) {
  jest.resetModules();
  if (apiBase === undefined) {
    delete window.PHYSIOAI_API_BASE;
  } else {
    window.PHYSIOAI_API_BASE = apiBase;
  }
  // Dynamic import so import-time constants re-read the current window value.
  return import('../../Therapist/shared/core/api.js');
}

function mockFetchOnce({ ok = true, status = 200, json = {} } = {}) {
  global.fetch.mockResolvedValueOnce({
    ok,
    status,
    json: async () => json,
  });
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetModules();
  delete window.PHYSIOAI_API_BASE;
});

describe('config: API_BASE / isCloud', () => {
  it('API_BASE reflects window.PHYSIOAI_API_BASE and isCloud() is true when set', async () => {
    const api = await loadApi('https://api.test');
    expect(api.API_BASE).toBe('https://api.test');
    expect(api.isCloud()).toBe(true);
  });

  it('API_BASE is empty string and isCloud() is false when unset', async () => {
    const api = await loadApi(undefined);
    expect(api.API_BASE).toBe('');
    expect(api.isCloud()).toBe(false);
  });

  it('exposes DEMO_ENABLED and isDemoEnabled() consistently', async () => {
    const api = await loadApi('https://api.test');
    expect(typeof api.DEMO_ENABLED).toBe('boolean');
    expect(api.isDemoEnabled()).toBe(api.DEMO_ENABLED);
  });
});

describe('getToken / setToken', () => {
  it('round-trips a token through localStorage', async () => {
    const api = await loadApi('https://api.test');
    expect(api.getToken()).toBeNull();

    api.setToken('abc123');
    expect(api.getToken()).toBe('abc123');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('abc123');
  });

  it('setToken with falsy value removes the stored token', async () => {
    const api = await loadApi('https://api.test');
    api.setToken('abc123');
    expect(api.getToken()).toBe('abc123');

    api.setToken(null);
    expect(api.getToken()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();

    api.setToken('xyz');
    api.setToken('');
    expect(api.getToken()).toBeNull();
  });
});

describe('apiGet', () => {
  it('GETs API_BASE + path with content-type header and parses JSON', async () => {
    const api = await loadApi('https://api.test');
    mockFetchOnce({ json: { hello: 'world' } });

    const result = await api.apiGet('/v1/ping');

    expect(result).toEqual({ hello: 'world' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/v1/ping');
    expect(opts.method).toBe('GET');
    expect(opts.headers['content-type']).toBe('application/json');
    // GET with no body => body undefined
    expect(opts.body).toBeUndefined();
  });

  it('adds Authorization Bearer header when a token is stored', async () => {
    const api = await loadApi('https://api.test');
    api.setToken('tok-42');
    mockFetchOnce({ json: {} });

    await api.apiGet('/v1/me');

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.authorization).toBe('Bearer tok-42');
  });

  it('omits Authorization header when no token is stored', async () => {
    const api = await loadApi('https://api.test');
    mockFetchOnce({ json: {} });

    await api.apiGet('/v1/public');

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.authorization).toBeUndefined();
  });

  it('omits Authorization header even with token when auth:false is passed', async () => {
    const api = await loadApi('https://api.test');
    api.setToken('tok-42');
    mockFetchOnce({ json: {} });

    await api.apiGet('/v1/public', { auth: false });

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.authorization).toBeUndefined();
  });
});

describe('apiPost / apiPut / apiDelete', () => {
  it('apiPost sends POST with JSON-stringified body', async () => {
    const api = await loadApi('https://api.test');
    mockFetchOnce({ json: { id: 1 } });

    const body = { name: 'Alice', age: 30 };
    const result = await api.apiPost('/v1/users', body);

    expect(result).toEqual({ id: 1 });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/v1/users');
    expect(opts.method).toBe('POST');
    expect(opts.headers['content-type']).toBe('application/json');
    expect(opts.body).toBe(JSON.stringify(body));
  });

  it('apiPut sends PUT with JSON-stringified body', async () => {
    const api = await loadApi('https://api.test');
    mockFetchOnce({ json: { ok: true } });

    const body = { active: false };
    await api.apiPut('/v1/users/1', body);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/v1/users/1');
    expect(opts.method).toBe('PUT');
    expect(opts.body).toBe(JSON.stringify(body));
  });

  it('apiDelete sends DELETE; body undefined when none provided', async () => {
    const api = await loadApi('https://api.test');
    mockFetchOnce({ json: { deleted: true } });

    await api.apiDelete('/v1/users/1');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/v1/users/1');
    expect(opts.method).toBe('DELETE');
    expect(opts.body).toBeUndefined();
  });

  it('apiDelete forwards a body when one is provided', async () => {
    const api = await loadApi('https://api.test');
    mockFetchOnce({ json: {} });

    const body = { reason: 'cleanup' };
    await api.apiDelete('/v1/users/1', body);

    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.method).toBe('DELETE');
    expect(opts.body).toBe(JSON.stringify(body));
  });
});

describe('error handling (non-2xx)', () => {
  it('throws an Error whose .code and message come from {error} and sets .status', async () => {
    const api = await loadApi('https://api.test');
    mockFetchOnce({ ok: false, status: 400, json: { error: 'invalid' } });

    await expect(api.apiGet('/v1/bad')).rejects.toMatchObject({
      message: 'invalid',
      code: 'invalid',
      status: 400,
    });
  });

  it('rejected value is a real Error instance', async () => {
    const api = await loadApi('https://api.test');
    mockFetchOnce({ ok: false, status: 403, json: { error: 'forbidden' } });

    await expect(api.apiGet('/v1/secret')).rejects.toBeInstanceOf(Error);
  });

  it('falls back to http_<status> message when no error field present', async () => {
    const api = await loadApi('https://api.test');
    mockFetchOnce({ ok: false, status: 500, json: {} });

    let caught;
    try {
      await api.apiGet('/v1/boom');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('http_500');
    expect(caught.code).toBeUndefined();
    expect(caught.status).toBe(500);
  });

  it('handles a non-2xx response whose body is not JSON (json() throws)', async () => {
    const api = await loadApi('https://api.test');
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    });

    let caught;
    try {
      await api.apiGet('/v1/gateway');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('http_502');
    expect(caught.status).toBe(502);
  });
});

describe('API_BASE prefixing when empty (same-origin)', () => {
  it('prefixes nothing when API_BASE is empty', async () => {
    const api = await loadApi(undefined);
    mockFetchOnce({ json: {} });

    await api.apiGet('/v1/ping');

    const [url] = global.fetch.mock.calls[0];
    expect(url).toBe('/v1/ping');
  });
});
