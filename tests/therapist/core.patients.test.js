// Tests for Therapist/shared/core/patients.js (jsdom environment).
//
// patients.js branches on isLoggedIn(): when logged in it delegates to the cloud
// (apiGet/apiPost from api.js); otherwise it falls back to demo data from store.js,
// but ONLY when isDemoEnabled() is true. We mock all three collaborator modules
// (api.js, auth.js, store.js) so we can assert exactly which delegate is invoked
// and with which arguments, independent of any real network/localStorage.

import {
  fetchPatients,
  linkPatient,
  fetchSessions,
  fetchPlan,
} from '../../Therapist/shared/core/patients.js';

import { apiGet, apiPost, isDemoEnabled } from '../../Therapist/shared/core/api.js';
import { isLoggedIn } from '../../Therapist/shared/core/auth.js';
import {
  getPatients as demoPatients,
  getSessions as demoSessions,
} from '../../Therapist/shared/core/store.js';

jest.mock('../../Therapist/shared/core/api.js', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  isDemoEnabled: jest.fn(),
}));

jest.mock('../../Therapist/shared/core/auth.js', () => ({
  isLoggedIn: jest.fn(),
}));

jest.mock('../../Therapist/shared/core/store.js', () => ({
  getPatients: jest.fn(),
  getSessions: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Sensible defaults; individual tests override as needed.
  isLoggedIn.mockReturnValue(false);
  isDemoEnabled.mockReturnValue(true);
});

describe('fetchPatients()', () => {
  describe('logged in (cloud)', () => {
    beforeEach(() => isLoggedIn.mockReturnValue(true));

    it('GETs /patients and maps each row to { id, name, email }', async () => {
      apiGet.mockResolvedValue([
        { id: 'p1', name: 'Aree S.', email: 'aree@example.com', extra: 'drop-me' },
        { id: 'p2', name: 'Somchai P.', email: 'somchai@example.com' },
      ]);

      const result = await fetchPatients();

      expect(apiGet).toHaveBeenCalledTimes(1);
      expect(apiGet).toHaveBeenCalledWith('/patients');
      expect(result).toEqual([
        { id: 'p1', name: 'Aree S.', email: 'aree@example.com' },
        { id: 'p2', name: 'Somchai P.', email: 'somchai@example.com' },
      ]);
      // Demo fallback must NOT be touched when logged in.
      expect(demoPatients).not.toHaveBeenCalled();
    });

    it('returns an empty array when the cloud has no patients', async () => {
      apiGet.mockResolvedValue([]);

      const result = await fetchPatients();

      expect(result).toEqual([]);
      expect(apiGet).toHaveBeenCalledWith('/patients');
    });

    it('only keeps the id/name/email keys (missing email becomes undefined)', async () => {
      apiGet.mockResolvedValue([{ id: 'p9', name: 'No Email' }]);

      const result = await fetchPatients();

      expect(result).toEqual([{ id: 'p9', name: 'No Email', email: undefined }]);
      expect(Object.keys(result[0]).sort()).toEqual(['email', 'id', 'name']);
    });

    it('throws invalid_patients_response when the response is not an array', async () => {
      apiGet.mockResolvedValue({ not: 'an array' });

      await expect(fetchPatients()).rejects.toMatchObject({
        message: 'invalid_patients_response',
        code: 'invalid_patients_response',
      });
      await expect(fetchPatients()).rejects.toBeInstanceOf(Error);
    });

    it('throws invalid_patients_response when the response is null', async () => {
      apiGet.mockResolvedValue(null);

      await expect(fetchPatients()).rejects.toMatchObject({
        code: 'invalid_patients_response',
      });
    });

    it('propagates errors thrown by apiGet', async () => {
      const boom = Object.assign(new Error('http_500'), { status: 500 });
      apiGet.mockRejectedValue(boom);

      await expect(fetchPatients()).rejects.toBe(boom);
    });
  });

  describe('not logged in (demo fallback)', () => {
    it('returns store.getPatients() when demo is enabled', async () => {
      isLoggedIn.mockReturnValue(false);
      isDemoEnabled.mockReturnValue(true);
      const seed = [{ id: 'p1', name: 'Aree S.' }];
      demoPatients.mockReturnValue(seed);

      const result = await fetchPatients();

      expect(result).toBe(seed);
      expect(demoPatients).toHaveBeenCalledTimes(1);
      expect(apiGet).not.toHaveBeenCalled();
    });

    it('returns [] (no demo) when not logged in and demo is disabled', async () => {
      isLoggedIn.mockReturnValue(false);
      isDemoEnabled.mockReturnValue(false);

      const result = await fetchPatients();

      expect(result).toEqual([]);
      expect(demoPatients).not.toHaveBeenCalled();
      expect(apiGet).not.toHaveBeenCalled();
    });
  });
});

describe('linkPatient(emailOrId)', () => {
  it('throws login_required when not logged in (before any validation)', async () => {
    isLoggedIn.mockReturnValue(false);

    await expect(linkPatient('aree@example.com')).rejects.toMatchObject({
      message: 'login_required',
      code: 'login_required',
    });
    expect(apiPost).not.toHaveBeenCalled();
  });

  describe('logged in', () => {
    beforeEach(() => isLoggedIn.mockReturnValue(true));

    it('throws "required" for empty / whitespace / nullish input', async () => {
      for (const bad of ['', '   ', null, undefined]) {
        await expect(linkPatient(bad)).rejects.toMatchObject({
          message: 'required',
          code: 'required',
        });
      }
      expect(apiPost).not.toHaveBeenCalled();
    });

    it('POSTs /patients/link with a lowercased email body when value has "@"', async () => {
      apiPost.mockResolvedValue({ id: 'p7', name: 'Linked', email: 'linked@x.com' });

      const result = await linkPatient('  Linked@X.com  ');

      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(apiPost).toHaveBeenCalledWith('/patients/link', { email: 'linked@x.com' });
      expect(result).toEqual({ id: 'p7', name: 'Linked', email: 'linked@x.com' });
    });

    it('POSTs /patients/link with a patientId body when value has no "@"', async () => {
      apiPost.mockResolvedValue({ id: 'p3', name: 'By Id', email: 'byid@x.com' });

      const result = await linkPatient('  p3  ');

      expect(apiPost).toHaveBeenCalledWith('/patients/link', { patientId: 'p3' });
      expect(result).toEqual({ id: 'p3', name: 'By Id', email: 'byid@x.com' });
    });

    it('returns only { id, name, email } from the linked patient', async () => {
      apiPost.mockResolvedValue({
        id: 'p5',
        name: 'Trimmed',
        email: 'p5@x.com',
        role: 'patient',
        secret: 'nope',
      });

      const result = await linkPatient('p5');

      expect(result).toEqual({ id: 'p5', name: 'Trimmed', email: 'p5@x.com' });
      expect(Object.keys(result).sort()).toEqual(['email', 'id', 'name']);
    });

    it('propagates errors thrown by apiPost', async () => {
      const boom = Object.assign(new Error('not_found'), { code: 'not_found' });
      apiPost.mockRejectedValue(boom);

      await expect(linkPatient('ghost@x.com')).rejects.toBe(boom);
    });
  });
});

describe('fetchSessions(patientId)', () => {
  describe('logged in (cloud)', () => {
    beforeEach(() => isLoggedIn.mockReturnValue(true));

    it('GETs /sessions?patientId= with the encoded id and returns the array', async () => {
      const rows = [{ id: 's1', patientId: 'p1', endedAt: 1 }];
      apiGet.mockResolvedValue(rows);

      const result = await fetchSessions('p1');

      expect(apiGet).toHaveBeenCalledTimes(1);
      expect(apiGet).toHaveBeenCalledWith('/sessions?patientId=p1');
      expect(result).toBe(rows);
      expect(demoSessions).not.toHaveBeenCalled();
    });

    it('URL-encodes the patientId', async () => {
      apiGet.mockResolvedValue([]);

      await fetchSessions('a b/c&d');

      expect(apiGet).toHaveBeenCalledWith(
        '/sessions?patientId=' + encodeURIComponent('a b/c&d'),
      );
    });

    it('returns [] when the cloud response is not an array', async () => {
      apiGet.mockResolvedValue({ oops: true });

      const result = await fetchSessions('p1');

      expect(result).toEqual([]);
    });

    it('returns [] when the cloud response is null', async () => {
      apiGet.mockResolvedValue(null);

      expect(await fetchSessions('p1')).toEqual([]);
    });
  });

  describe('not logged in (demo fallback)', () => {
    it('returns store.getSessions(patientId) when demo is enabled', async () => {
      isLoggedIn.mockReturnValue(false);
      isDemoEnabled.mockReturnValue(true);
      const seed = [{ id: 'seed_0', patientId: 'p2' }];
      demoSessions.mockReturnValue(seed);

      const result = await fetchSessions('p2');

      expect(result).toBe(seed);
      expect(demoSessions).toHaveBeenCalledTimes(1);
      expect(demoSessions).toHaveBeenCalledWith('p2');
      expect(apiGet).not.toHaveBeenCalled();
    });

    it('returns [] (no demo) when not logged in and demo is disabled', async () => {
      isLoggedIn.mockReturnValue(false);
      isDemoEnabled.mockReturnValue(false);

      const result = await fetchSessions('p2');

      expect(result).toEqual([]);
      expect(demoSessions).not.toHaveBeenCalled();
      expect(apiGet).not.toHaveBeenCalled();
    });
  });
});

describe('fetchPlan(patientId)', () => {
  it('returns null when not logged in (regardless of demo flag)', async () => {
    isLoggedIn.mockReturnValue(false);
    isDemoEnabled.mockReturnValue(true);

    const result = await fetchPlan('p1');

    expect(result).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });

  describe('logged in (cloud)', () => {
    beforeEach(() => isLoggedIn.mockReturnValue(true));

    it('GETs /plans?patientId= with the encoded id and returns the response as-is', async () => {
      const plan = { patientId: 'p1', items: [{ exerciseId: 'shoulder' }] };
      apiGet.mockResolvedValue(plan);

      const result = await fetchPlan('p1');

      expect(apiGet).toHaveBeenCalledTimes(1);
      expect(apiGet).toHaveBeenCalledWith('/plans?patientId=p1');
      expect(result).toBe(plan);
    });

    it('URL-encodes the patientId', async () => {
      apiGet.mockResolvedValue(null);

      await fetchPlan('x y&z');

      expect(apiGet).toHaveBeenCalledWith(
        '/plans?patientId=' + encodeURIComponent('x y&z'),
      );
    });

    it('returns whatever apiGet returns, including null (no plan)', async () => {
      apiGet.mockResolvedValue(null);

      expect(await fetchPlan('p1')).toBeNull();
    });

    it('propagates errors thrown by apiGet', async () => {
      const boom = new Error('http_404');
      apiGet.mockRejectedValue(boom);

      await expect(fetchPlan('p1')).rejects.toBe(boom);
    });
  });
});
