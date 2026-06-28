// Tests for Therapist/shared/core/auth.js
// We mock ./api.js so login/register/verify exercise auth.js logic only,
// while getToken/setToken/getTherapist persistence rides on real jsdom localStorage.

jest.mock('../../Therapist/shared/core/api.js', () => ({
  apiPost: jest.fn(),
  apiGet: jest.fn(),
  setToken: jest.fn(),
  getToken: jest.fn(),
  isDemoEnabled: () => false,
}));

import {
  apiPost,
  apiGet,
  setToken,
  getToken,
} from '../../Therapist/shared/core/api.js';
import {
  login,
  register,
  getTherapist,
  isLoggedIn,
  logout,
  verify,
  isGuest,
  continueAsGuest,
  resendVerification,
} from '../../Therapist/shared/core/auth.js';

const K_THERAPIST = 'physioai.v1.therapist';
const K_GUEST = 'physioai.v1.guest';
const therapistUser = { id: 't1', name: 'Dr. Who', email: 'doc@clinic.io', role: 'therapist' };

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  // default: no token present unless a test arranges otherwise
  getToken.mockReturnValue(null);
});

describe('login()', () => {
  it('logs in a therapist: posts to /auth/login (auth:false), stores token + user, returns user', async () => {
    apiPost.mockResolvedValue({ token: 'tok-123', user: therapistUser });

    const result = await login({ email: '  DOC@Clinic.io ', password: 'pw' });

    // email is trimmed + lowercased before the call
    expect(apiPost).toHaveBeenCalledWith(
      '/auth/login',
      { email: 'doc@clinic.io', password: 'pw' },
      { auth: false },
    );
    expect(setToken).toHaveBeenCalledWith('tok-123');
    expect(result).toEqual(therapistUser);
    // user cached in localStorage, guest flag cleared
    expect(JSON.parse(localStorage.getItem(K_THERAPIST))).toEqual(therapistUser);
    expect(localStorage.getItem(K_GUEST)).toBeNull();
  });

  it('clears the guest flag on a successful login', async () => {
    localStorage.setItem(K_GUEST, '1');
    apiPost.mockResolvedValue({ token: 'tok-123', user: therapistUser });

    await login({ email: 'doc@clinic.io', password: 'pw' });

    expect(localStorage.getItem(K_GUEST)).toBeNull();
  });

  it('rejects a non-therapist role with Error("not_therapist") and clears the token', async () => {
    apiPost.mockResolvedValue({ token: 'tok-123', user: { ...therapistUser, role: 'patient' } });

    await expect(login({ email: 'doc@clinic.io', password: 'pw' })).rejects.toMatchObject({
      message: 'not_therapist',
      code: 'not_therapist',
    });
    expect(setToken).toHaveBeenCalledWith(null);
    // not cached
    expect(localStorage.getItem(K_THERAPIST)).toBeNull();
  });

  it('treats a missing role as not_therapist', async () => {
    apiPost.mockResolvedValue({ token: 'tok-123', user: { id: 'x', email: 'a@b.c' } });

    await expect(login({ email: 'a@b.c', password: 'pw' })).rejects.toMatchObject({
      code: 'not_therapist',
    });
    expect(setToken).toHaveBeenCalledWith(null);
  });

  it('throws Error("required") and never calls the API when email is missing', async () => {
    await expect(login({ email: '', password: 'pw' })).rejects.toMatchObject({
      message: 'required',
      code: 'required',
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('throws Error("required") and never calls the API when password is missing', async () => {
    await expect(login({ email: 'doc@clinic.io', password: '' })).rejects.toMatchObject({
      code: 'required',
    });
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe('register()', () => {
  it('posts name/email/password with role:therapist (auth:false), stores token + user, returns user', async () => {
    apiPost.mockResolvedValue({ token: 'reg-tok', user: therapistUser });

    const result = await register({ name: '  Dr. Who ', email: ' DOC@Clinic.io ', password: 'pw' });

    expect(apiPost).toHaveBeenCalledWith(
      '/auth/register',
      { name: 'Dr. Who', email: 'doc@clinic.io', password: 'pw', role: 'therapist' },
      { auth: false },
    );
    expect(setToken).toHaveBeenCalledWith('reg-tok');
    expect(result).toEqual(therapistUser);
    expect(JSON.parse(localStorage.getItem(K_THERAPIST))).toEqual(therapistUser);
  });

  it('throws Error("required") and never calls the API when name is missing', async () => {
    await expect(register({ name: '', email: 'doc@clinic.io', password: 'pw' })).rejects.toMatchObject({
      message: 'required',
      code: 'required',
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('throws Error("required") when email is missing', async () => {
    await expect(register({ name: 'Doc', email: '', password: 'pw' })).rejects.toMatchObject({
      code: 'required',
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('throws Error("required") when password is missing', async () => {
    await expect(register({ name: 'Doc', email: 'doc@clinic.io', password: '' })).rejects.toMatchObject({
      code: 'required',
    });
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe('getTherapist()', () => {
  it('returns null when nothing is stored', () => {
    expect(getTherapist()).toBeNull();
  });

  it('returns the parsed cached user when present', () => {
    localStorage.setItem(K_THERAPIST, JSON.stringify(therapistUser));
    expect(getTherapist()).toEqual(therapistUser);
  });

  it('returns null on malformed JSON instead of throwing', () => {
    localStorage.setItem(K_THERAPIST, '{not valid json');
    expect(getTherapist()).toBeNull();
  });
});

describe('isLoggedIn()', () => {
  it('is false with no token even when a user is cached', () => {
    localStorage.setItem(K_THERAPIST, JSON.stringify(therapistUser));
    getToken.mockReturnValue(null);
    expect(isLoggedIn()).toBe(false);
  });

  it('is false with a token but no cached user', () => {
    getToken.mockReturnValue('tok');
    expect(isLoggedIn()).toBe(false);
  });

  it('is true only when both token and cached user are present', () => {
    getToken.mockReturnValue('tok');
    localStorage.setItem(K_THERAPIST, JSON.stringify(therapistUser));
    expect(isLoggedIn()).toBe(true);
  });
});

describe('logout()', () => {
  it('clears the token and removes cached user + guest flag', () => {
    localStorage.setItem(K_THERAPIST, JSON.stringify(therapistUser));
    localStorage.setItem(K_GUEST, '1');

    logout();

    expect(setToken).toHaveBeenCalledWith(null);
    expect(localStorage.getItem(K_THERAPIST)).toBeNull();
    expect(localStorage.getItem(K_GUEST)).toBeNull();
  });
});

describe('verify()', () => {
  it('calls GET /auth/me and caches+returns a therapist user', async () => {
    apiGet.mockResolvedValue({ user: therapistUser });

    const result = await verify();

    expect(apiGet).toHaveBeenCalledWith('/auth/me');
    expect(result).toEqual(therapistUser);
    expect(JSON.parse(localStorage.getItem(K_THERAPIST))).toEqual(therapistUser);
  });

  it('returns null (no caching) when /auth/me yields a non-therapist role', async () => {
    apiGet.mockResolvedValue({ user: { ...therapistUser, role: 'patient' } });

    const result = await verify();

    expect(result).toBeNull();
    expect(localStorage.getItem(K_THERAPIST)).toBeNull();
  });

  it('returns null and swallows network errors (offline-friendly)', async () => {
    apiGet.mockRejectedValue(new Error('network down'));

    await expect(verify()).resolves.toBeNull();
  });
});

describe('guest mode (demo disabled in this suite)', () => {
  it('isGuest() is false when demo is disabled, even with the guest flag set', () => {
    localStorage.setItem(K_GUEST, '1');
    expect(isGuest()).toBe(false);
  });

  it('continueAsGuest() throws demo_disabled when demo is off', () => {
    expect(() => continueAsGuest()).toThrow('demo_disabled');
    try {
      continueAsGuest();
    } catch (err) {
      expect(err.code).toBe('demo_disabled');
    }
    expect(localStorage.getItem(K_GUEST)).toBeNull();
  });
});

describe('resendVerification()', () => {
  it('posts the trimmed/lowercased email to /auth/resend-verification (auth:false)', async () => {
    apiPost.mockResolvedValue({ ok: true });

    const result = await resendVerification('  DOC@Clinic.io ');

    expect(apiPost).toHaveBeenCalledWith(
      '/auth/resend-verification',
      { email: 'doc@clinic.io' },
      { auth: false },
    );
    expect(result).toEqual({ ok: true });
  });

  it('throws Error("required") and never calls the API when email is empty', async () => {
    await expect(resendVerification('')).rejects.toMatchObject({
      message: 'required',
      code: 'required',
    });
    expect(apiPost).not.toHaveBeenCalled();
  });
});
