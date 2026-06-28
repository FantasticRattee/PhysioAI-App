// Tests for Patient/src/core/auth.js (cloud path).
//
// auth.js imports AsyncStorage (auto-mocked) and several helpers from ./api.js.
// We mock ./api.js so isCloud()=>true and isDemoEnabled()=>false, forcing the
// cloud branch in register/login, and drive apiPost via mockResolvedValue.

import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../../Patient/src/core/api.js', () => ({
  isCloud: () => true,
  isDemoEnabled: () => false,
  apiConfigError: (c) => Object.assign(new Error(c || 'cfg'), { code: c }),
  apiPost: jest.fn(),
  setToken: jest.fn(async () => {}),
}));

import { apiPost, setToken } from '../../Patient/src/core/api.js';
import { register, login, getSession, logout } from '../../Patient/src/core/auth.js';

const K_SESSION = 'physioai.v2.session';

beforeEach(() => {
  AsyncStorage.__reset();
  jest.clearAllMocks();
});

describe('register (cloud path)', () => {
  const PATIENT = { id: 'p1', name: 'Alice', email: 'alice@example.com', role: 'patient' };

  it('calls apiPost /auth/register with normalized fields, stores session + token, returns the user session', async () => {
    apiPost.mockResolvedValue({ token: 'tok-abc', user: PATIENT });

    const session = await register({ name: '  Alice  ', email: '  Alice@Example.com  ', password: 'secret' });

    // apiPost called with the registration endpoint and normalized payload.
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith(
      '/auth/register',
      { name: 'Alice', email: 'alice@example.com', password: 'secret', role: 'patient' },
      { auth: false },
    );

    // Token persisted via setToken.
    expect(setToken).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledWith('tok-abc');

    // saveSession returns the user object (NOT the token wrapper).
    expect(session).toEqual(PATIENT);

    // Session was written to AsyncStorage under the session key.
    const stored = JSON.parse(AsyncStorage.__dump()[K_SESSION]);
    expect(stored).toEqual(PATIENT);
  });

  it('throws code "required" without calling apiPost when name is missing', async () => {
    await expect(register({ name: '', email: 'a@b.com', password: 'pw' })).rejects.toMatchObject({
      code: 'required',
      message: 'required',
    });
    expect(apiPost).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
  });

  it('throws code "required" when email is missing', async () => {
    await expect(register({ name: 'Bob', email: '   ', password: 'pw' })).rejects.toMatchObject({ code: 'required' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('throws code "required" when password is missing', async () => {
    await expect(register({ name: 'Bob', email: 'b@c.com', password: '' })).rejects.toMatchObject({ code: 'required' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('propagates apiPost errors (e.g. exists) and does not store a session', async () => {
    const err = Object.assign(new Error('exists'), { code: 'exists' });
    apiPost.mockRejectedValue(err);

    await expect(register({ name: 'Bob', email: 'b@c.com', password: 'pw' })).rejects.toMatchObject({ code: 'exists' });
    expect(setToken).not.toHaveBeenCalled();
    expect(AsyncStorage.__dump()[K_SESSION]).toBeUndefined();
  });
});

describe('login (cloud path)', () => {
  const PATIENT = { id: 'p2', name: 'Carol', email: 'carol@example.com', role: 'patient' };

  it('calls apiPost /auth/login with normalized creds, stores session + token, returns user session', async () => {
    apiPost.mockResolvedValue({ token: 'tok-login', user: PATIENT });

    const session = await login({ email: '  Carol@Example.com ', password: 'pw' });

    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith('/auth/login', { email: 'carol@example.com', password: 'pw' }, { auth: false });

    expect(setToken).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledWith('tok-login');

    expect(session).toEqual(PATIENT);
    expect(JSON.parse(AsyncStorage.__dump()[K_SESSION])).toEqual(PATIENT);
  });

  it('throws code "not_patient" and clears token when user.role is not patient', async () => {
    apiPost.mockResolvedValue({
      token: 'tok-therapist',
      user: { id: 't1', name: 'Dr', email: 'dr@example.com', role: 'therapist' },
    });

    await expect(login({ email: 'dr@example.com', password: 'pw' })).rejects.toMatchObject({
      code: 'not_patient',
      message: 'not_patient',
    });

    // setToken(null) is called to clear any partial auth state.
    expect(setToken).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledWith(null);

    // No session is stored on a rejected (wrong-role) login.
    expect(AsyncStorage.__dump()[K_SESSION]).toBeUndefined();
  });

  it('does NOT throw not_patient when user has no role field (role-less response)', async () => {
    const roleless = { id: 'p3', name: 'Eve', email: 'eve@example.com' };
    apiPost.mockResolvedValue({ token: 'tok-x', user: roleless });

    const session = await login({ email: 'eve@example.com', password: 'pw' });

    expect(session).toEqual(roleless);
    expect(setToken).toHaveBeenCalledWith('tok-x');
  });

  it('throws code "required" without calling apiPost when email is missing', async () => {
    await expect(login({ email: '', password: 'pw' })).rejects.toMatchObject({ code: 'required' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('throws code "required" without calling apiPost when password is missing', async () => {
    await expect(login({ email: 'a@b.com', password: '' })).rejects.toMatchObject({ code: 'required' });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('propagates apiPost errors (e.g. invalid creds)', async () => {
    apiPost.mockRejectedValue(Object.assign(new Error('invalid'), { code: 'invalid' }));
    await expect(login({ email: 'a@b.com', password: 'wrong' })).rejects.toMatchObject({ code: 'invalid' });
    expect(setToken).not.toHaveBeenCalled();
    expect(AsyncStorage.__dump()[K_SESSION]).toBeUndefined();
  });
});

describe('getSession', () => {
  it('returns null when no session is stored', async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  it('returns the stored session object after a successful login', async () => {
    const PATIENT = { id: 'p9', name: 'Frank', email: 'frank@example.com', role: 'patient' };
    apiPost.mockResolvedValue({ token: 't', user: PATIENT });
    await login({ email: 'frank@example.com', password: 'pw' });

    await expect(getSession()).resolves.toEqual(PATIENT);
  });

  it('returns the raw stored value parsed from AsyncStorage', async () => {
    const stored = { guest: true, name: 'Guest' };
    await AsyncStorage.setItem(K_SESSION, JSON.stringify(stored));
    await expect(getSession()).resolves.toEqual(stored);
  });
});

describe('logout', () => {
  it('removes the stored session and calls setToken(null) on cloud', async () => {
    await AsyncStorage.setItem(K_SESSION, JSON.stringify({ id: 'p', role: 'patient' }));

    await logout();

    expect(AsyncStorage.__dump()[K_SESSION]).toBeUndefined();
    expect(setToken).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledWith(null);
    await expect(getSession()).resolves.toBeNull();
  });

  it('is idempotent when no session exists', async () => {
    await expect(logout()).resolves.toBeUndefined();
    expect(setToken).toHaveBeenCalledWith(null);
    await expect(getSession()).resolves.toBeNull();
  });
});
