// Backend integration tests for cross-cutting middleware in backend/server.js:
//   • CORS (Access-Control-Allow-* headers + OPTIONS preflight -> 204)
//   • Content-Security-Policy on normal responses (MediaPipe-WASM friendly)
//   • requireAuth -> 401 { error: 'unauthorized' } on protected routes w/o Bearer
//   • requireRole('therapist') -> 403 { error: 'forbidden' } for a patient
//
// supertest against the REAL app (real Railway Postgres). Tokens come from
// makeUser(...); afterAll cascades-cleanup test users and disconnects Prisma.
const {
  app,
  request,
  prisma,
  makeUser,
  authed,
  cleanupTestUsers,
} = require('./_setup');

describe('CORS middleware', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with no body for OPTIONS on any path', async () => {
      const res = await request(app).options('/auth/me');
      expect(res.status).toBe(204);
      expect(res.text).toBeFalsy();
    });

    it('returns 204 for OPTIONS on an arbitrary/unknown path', async () => {
      const res = await request(app).options('/this/path/does/not/exist');
      expect(res.status).toBe(204);
    });

    it('reflects the request Origin in Access-Control-Allow-Origin', async () => {
      const origin = 'https://app.example.com';
      const res = await request(app).options('/plans').set('Origin', origin);
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    });

    it('falls back to * for Access-Control-Allow-Origin when no Origin sent', async () => {
      const res = await request(app).options('/plans');
      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('allows the authorization request header', async () => {
      const res = await request(app).options('/sessions');
      expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
      expect(res.headers['access-control-allow-headers']).toMatch(/content-type/i);
    });

    it('advertises the expected HTTP verbs in Access-Control-Allow-Methods', async () => {
      const res = await request(app).options('/references');
      const methods = res.headers['access-control-allow-methods'] || '';
      for (const verb of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
        expect(methods).toContain(verb);
      }
    });

    it('sets a Vary header covering Origin', async () => {
      const res = await request(app).options('/health');
      expect((res.headers['vary'] || '')).toMatch(/Origin/i);
    });
  });

  describe('CORS headers on a normal (non-preflight) request', () => {
    it('reflects Origin on a plain GET', async () => {
      const origin = 'https://patient.example.org';
      const res = await request(app).get('/health').set('Origin', origin);
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    });

    it('falls back to * on a plain GET without Origin', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });
});

describe('Content-Security-Policy middleware', () => {
  it('sets a CSP header on a normal GET /health response', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('CSP allows wasm-unsafe-eval (MediaPipe WASM)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toContain('wasm-unsafe-eval');
  });

  it('CSP defines a worker-src directive (blob: web workers)', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain('worker-src');
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it('does NOT set CSP on an OPTIONS preflight (it short-circuits at 204)', async () => {
    const res = await request(app).options('/health');
    expect(res.status).toBe(204);
    expect(res.headers['content-security-policy']).toBeUndefined();
  });
});

describe('requireAuth — protected routes without a Bearer token', () => {
  const protectedGets = ['/auth/me', '/plans', '/references', '/sessions', '/patients'];

  for (const path of protectedGets) {
    it(`GET ${path} without token -> 401 { error: 'unauthorized' }`, async () => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });
  }

  it('rejects a malformed Authorization header (not Bearer) -> 401', async () => {
    const res = await request(app).get('/plans').set('Authorization', 'Token abc123');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('rejects a Bearer token with a garbage/invalid JWT -> 401', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('rejects an empty Bearer token -> 401', async () => {
    const res = await request(app).get('/sessions').set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });
});

describe('requireRole — patient hitting therapist-only routes', () => {
  let patient;

  beforeAll(async () => {
    patient = await makeUser('patient');
  });

  it('GET /patients as a patient -> 403 { error: \'forbidden\' }', async () => {
    const res = await authed('get', '/patients', patient.token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('POST /patients/link as a patient -> 403 { error: \'forbidden\' }', async () => {
    const res = await authed('post', '/patients/link', patient.token).send({
      email: 'someone@physioai-test.invalid',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('a valid therapist token passes requireRole and reaches the handler (200, array)', async () => {
    const therapist = await makeUser('therapist');
    const res = await authed('get', '/patients', therapist.token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

afterAll(async () => {
  await cleanupTestUsers();
  await prisma.$disconnect();
});
