// Backend integration tests for /sessions (supertest against the real Railway DB).
//
// Covers: POST /sessions create + upsert semantics, sessionFromRow response shape
// (id/patientId/exerciseId defaults, endedAt as a Number), exerciseKey fallback,
// GET /sessions ordering (endedAt desc) + endedAt round-trip, and access control
// (linked therapist via ?patientId=, unlinked 403, patient-for-another 403, no token 401).
const {
  app,
  request,
  prisma,
  makeUser,
  authed,
  cleanupTestUsers,
  TEST_EMAIL_DOMAIN,
} = require('./_setup');

describe('/sessions', () => {
  let patient; // { token, user, ... }

  beforeAll(async () => {
    patient = await makeUser('patient');
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await prisma.$disconnect();
  });

  describe('POST /sessions', () => {
    it('creates a session (201) with the sessionFromRow shape from a minimal body', async () => {
      const before = Date.now();
      const res = await authed('post', '/sessions', patient.token).send({
        exerciseId: 'shoulder',
        reps: 5,
        avgScore: 80,
      });
      const after = Date.now();

      expect(res.status).toBe(201);
      expect(res.body.patientId).toBe(patient.user.id);
      expect(res.body.exerciseId).toBe('shoulder');
      // spread of data — the posted fields round-trip
      expect(res.body.reps).toBe(5);
      expect(res.body.avgScore).toBe(80);
      // id defaults to `s_<patientId>_<endedAt>` when not supplied
      expect(res.body.id).toBe(`s_${patient.user.id}_${res.body.endedAt}`);
      // endedAt defaults to ~now and is returned as a Number (not BigInt/string)
      expect(typeof res.body.endedAt).toBe('number');
      expect(res.body.endedAt).toBeGreaterThanOrEqual(before);
      expect(res.body.endedAt).toBeLessThanOrEqual(after);
    });

    it('honors an explicit endedAt and returns it as the same Number', async () => {
      const endedAt = Date.now() - 60_000;
      const res = await authed('post', '/sessions', patient.token).send({
        exerciseId: 'knee',
        endedAt,
        reps: 3,
      });

      expect(res.status).toBe(201);
      expect(res.body.endedAt).toBe(endedAt);
      expect(typeof res.body.endedAt).toBe('number');
      expect(res.body.id).toBe(`s_${patient.user.id}_${endedAt}`);
    });

    it('uses exerciseKey as the exerciseId fallback when exerciseId is absent', async () => {
      const res = await authed('post', '/sessions', patient.token).send({
        exerciseKey: 'hip',
        reps: 2,
        avgScore: 55,
      });

      expect(res.status).toBe(201);
      expect(res.body.exerciseId).toBe('hip');
      // exerciseKey is still present via the data spread
      expect(res.body.exerciseKey).toBe('hip');
    });

    it('upserts when the same id is posted twice (GET count stays stable)', async () => {
      const id = `s_${patient.user.id}_upsert_${Date.now()}`;
      const endedAt = Date.now();

      const first = await authed('post', '/sessions', patient.token).send({
        id,
        exerciseId: 'ankle',
        endedAt,
        reps: 1,
        avgScore: 40,
      });
      expect(first.status).toBe(201);

      const countAfterFirst = await prisma.session.count({ where: { id } });
      expect(countAfterFirst).toBe(1);

      const second = await authed('post', '/sessions', patient.token).send({
        id,
        exerciseId: 'ankle',
        endedAt,
        reps: 9,
        avgScore: 90,
      });
      expect(second.status).toBe(201);
      // updated fields reflected
      expect(second.body.reps).toBe(9);
      expect(second.body.avgScore).toBe(90);

      // still exactly one row for that id (upsert, not insert)
      const countAfterSecond = await prisma.session.count({ where: { id } });
      expect(countAfterSecond).toBe(1);
    });

    it('rejects an unauthenticated POST with 401 unauthorized', async () => {
      const res = await authed('post', '/sessions', null).send({
        exerciseId: 'shoulder',
        reps: 5,
        avgScore: 80,
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });
  });

  describe('GET /sessions', () => {
    it('returns an array ordered by endedAt desc, with endedAt round-tripping', async () => {
      const owner = await makeUser('patient');
      const older = Date.now() - 120_000;
      const newer = Date.now() - 1_000;

      const olderRes = await authed('post', '/sessions', owner.token).send({
        id: `s_${owner.user.id}_old_${older}`,
        exerciseId: 'shoulder',
        endedAt: older,
        reps: 4,
      });
      expect(olderRes.status).toBe(201);

      const newerRes = await authed('post', '/sessions', owner.token).send({
        id: `s_${owner.user.id}_new_${newer}`,
        exerciseId: 'knee',
        endedAt: newer,
        reps: 6,
      });
      expect(newerRes.status).toBe(201);

      const res = await authed('get', '/sessions', owner.token);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      // newest first
      expect(res.body[0].endedAt).toBe(newer);
      expect(res.body[1].endedAt).toBe(older);
      expect(res.body[0].exerciseId).toBe('knee');
      expect(res.body[1].exerciseId).toBe('shoulder');

      // endedAt is a Number on every row
      for (const row of res.body) {
        expect(typeof row.endedAt).toBe('number');
      }

      // descending order invariant
      for (let i = 1; i < res.body.length; i++) {
        expect(res.body[i - 1].endedAt).toBeGreaterThanOrEqual(res.body[i].endedAt);
      }
    });

    it('returns an empty array for a patient with no sessions', async () => {
      const empty = await makeUser('patient');
      const res = await authed('get', '/sessions', empty.token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('rejects an unauthenticated GET with 401 unauthorized', async () => {
      const res = await authed('get', '/sessions', null);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });
  });

  describe('access control', () => {
    it('lets a linked therapist POST and GET via ?patientId=', async () => {
      const subject = await makeUser('patient');
      const therapist = await makeUser('therapist');

      // link the therapist to the patient
      const link = await authed('post', '/patients/link', therapist.token).send({
        patientId: subject.user.id,
      });
      expect(link.status).toBe(201);

      const endedAt = Date.now() - 5_000;
      const post = await authed(
        'post',
        `/sessions?patientId=${subject.user.id}`,
        therapist.token,
      ).send({ exerciseId: 'shoulder', endedAt, reps: 7, avgScore: 70 });
      expect(post.status).toBe(201);
      expect(post.body.patientId).toBe(subject.user.id);
      expect(post.body.exerciseId).toBe('shoulder');

      const get = await authed(
        'get',
        `/sessions?patientId=${subject.user.id}`,
        therapist.token,
      );
      expect(get.status).toBe(200);
      expect(Array.isArray(get.body)).toBe(true);
      expect(get.body.some((s) => s.endedAt === endedAt)).toBe(true);
      expect(get.body.every((s) => s.patientId === subject.user.id)).toBe(true);
    });

    it('forbids an unlinked therapist from POST/GET with 403 forbidden', async () => {
      const subject = await makeUser('patient');
      const therapist = await makeUser('therapist'); // never linked

      const post = await authed(
        'post',
        `/sessions?patientId=${subject.user.id}`,
        therapist.token,
      ).send({ exerciseId: 'shoulder', reps: 5, avgScore: 80 });
      expect(post.status).toBe(403);
      expect(post.body.error).toBe('forbidden');

      const get = await authed(
        'get',
        `/sessions?patientId=${subject.user.id}`,
        therapist.token,
      );
      expect(get.status).toBe(403);
      expect(get.body.error).toBe('forbidden');
    });

    it('forbids a patient from accessing another patient with 403 forbidden', async () => {
      const a = await makeUser('patient');
      const b = await makeUser('patient');

      const post = await authed(
        'post',
        `/sessions?patientId=${b.user.id}`,
        a.token,
      ).send({ exerciseId: 'shoulder', reps: 5, avgScore: 80 });
      expect(post.status).toBe(403);
      expect(post.body.error).toBe('forbidden');

      const get = await authed('get', `/sessions?patientId=${b.user.id}`, a.token);
      expect(get.status).toBe(403);
      expect(get.body.error).toBe('forbidden');
    });

    it('uses the email domain for every test user (cleanup-safe)', () => {
      expect(patient.email.endsWith(`@${TEST_EMAIL_DOMAIN}`)).toBe(true);
    });
  });
});
