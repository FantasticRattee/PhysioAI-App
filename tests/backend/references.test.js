// Backend integration tests for /references (supertest against the real Railway DB).
//
// Endpoint contract (backend/server.js):
//   GET    /references[?patientId=]        -> 200 [ { exerciseId, ...data } ]
//   POST   /references  { exerciseId, ... } -> 200 { exerciseId, ...data }  (upsert)
//                                              patientId + exerciseId stripped from stored data blob
//                                              missing exerciseId -> 400 { error:'required' }
//   DELETE /references?exerciseId=...       -> 204 (no body)
//                                              missing exerciseId -> 400 { error:'required' }
//   Access control via canAccessPatient: patient owns own data; therapist needs a
//   therapistPatient link; unlinked therapist / patient-for-another -> 403 { error:'forbidden' }.
const { app, request, prisma, makeUser, authed, cleanupTestUsers, TEST_EMAIL_DOMAIN } = require('./_setup');

async function linkPatient(therapistToken, patientId) {
  return authed('post', '/patients/link', therapistToken).send({ patientId });
}

describe('/references', () => {
  afterAll(async () => {
    await cleanupTestUsers();
    await prisma.$disconnect();
  });

  describe('GET /references (own)', () => {
    it('returns an empty array initially for a fresh patient', async () => {
      const { token } = await makeUser('patient');
      const res = await authed('get', '/references', token);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual([]);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/references');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });
  });

  describe('POST /references', () => {
    it('rejects a body with no exerciseId -> 400 required', async () => {
      const { token } = await makeUser('patient');
      const res = await authed('post', '/references', token).send({ jointAngles: { elbow: 90 } });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'required' });
    });

    it('stores a reference, stripping patientId+exerciseId from the data blob but keeping exerciseId in the response', async () => {
      const { token } = await makeUser('patient');
      const res = await authed('post', '/references', token).send({
        exerciseId: 'shoulder',
        jointAngles: { shoulderAbduction: 120, elbowFlexion: 30 },
        foo: 'bar',
      });
      expect(res.status).toBe(200);
      // exerciseId present in response (it comes from the row column, not the data blob).
      expect(res.body.exerciseId).toBe('shoulder');
      // Custom fields round-trip through the data blob.
      expect(res.body.foo).toBe('bar');
      expect(res.body.jointAngles).toEqual({ shoulderAbduction: 120, elbowFlexion: 30 });
      // patientId must not leak into the stored/returned data blob.
      expect(res.body).not.toHaveProperty('patientId');
    });

    it('upserts on re-POST of the same exerciseId (updates, never duplicates)', async () => {
      const { token } = await makeUser('patient');

      const first = await authed('post', '/references', token).send({
        exerciseId: 'knee',
        jointAngles: { kneeFlexion: 80 },
        version: 1,
      });
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ exerciseId: 'knee', version: 1 });

      const second = await authed('post', '/references', token).send({
        exerciseId: 'knee',
        jointAngles: { kneeFlexion: 95 },
        version: 2,
      });
      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({ exerciseId: 'knee', version: 2 });
      expect(second.body.jointAngles).toEqual({ kneeFlexion: 95 });

      // Exactly one reference row exists for this exerciseId.
      const list = await authed('get', '/references', token);
      expect(list.status).toBe(200);
      const kneeRefs = list.body.filter((r) => r.exerciseId === 'knee');
      expect(kneeRefs).toHaveLength(1);
      expect(kneeRefs[0].version).toBe(2);
    });
  });

  describe('GET after POST', () => {
    it('returns an array containing the posted reference with exerciseId and custom fields', async () => {
      const { token } = await makeUser('patient');
      await authed('post', '/references', token).send({
        exerciseId: 'shoulder',
        jointAngles: { shoulderAbduction: 110 },
        label: 'good rep',
      });

      const res = await authed('get', '/references', token);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((r) => r.exerciseId === 'shoulder');
      expect(found).toBeDefined();
      expect(found.label).toBe('good rep');
      expect(found.jointAngles).toEqual({ shoulderAbduction: 110 });
      expect(found).not.toHaveProperty('patientId');
    });
  });

  describe('DELETE /references', () => {
    it('deletes by exerciseId -> 204 with no body, then GET no longer includes it', async () => {
      const { token } = await makeUser('patient');
      await authed('post', '/references', token).send({
        exerciseId: 'shoulder',
        jointAngles: { shoulderAbduction: 100 },
      });

      // Confirm it exists first.
      const before = await authed('get', '/references', token);
      expect(before.body.some((r) => r.exerciseId === 'shoulder')).toBe(true);

      const del = await authed('delete', '/references?exerciseId=shoulder', token);
      expect(del.status).toBe(204);
      expect(del.body).toEqual({});
      expect(del.text).toBe('');

      const after = await authed('get', '/references', token);
      expect(after.status).toBe(200);
      expect(after.body.some((r) => r.exerciseId === 'shoulder')).toBe(false);
    });

    it('rejects DELETE without exerciseId -> 400 required', async () => {
      const { token } = await makeUser('patient');
      const res = await authed('delete', '/references', token);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'required' });
    });
  });

  describe('access control', () => {
    it('lets a linked therapist POST / GET / DELETE for ?patientId=', async () => {
      const patient = await makeUser('patient');
      const therapist = await makeUser('therapist');

      const link = await linkPatient(therapist.token, patient.user.id);
      expect(link.status).toBe(201);

      const qs = `?patientId=${patient.user.id}`;

      // POST as therapist for the linked patient.
      const post = await authed('post', `/references${qs}`, therapist.token).send({
        exerciseId: 'hip',
        jointAngles: { hipFlexion: 60 },
        author: 'therapist',
      });
      expect(post.status).toBe(200);
      expect(post.body).toMatchObject({ exerciseId: 'hip', author: 'therapist' });

      // GET as therapist sees the patient's reference.
      const get = await authed('get', `/references${qs}`, therapist.token);
      expect(get.status).toBe(200);
      expect(get.body.some((r) => r.exerciseId === 'hip')).toBe(true);

      // The patient sees the same reference on their own list.
      const patientGet = await authed('get', '/references', patient.token);
      expect(patientGet.status).toBe(200);
      expect(patientGet.body.some((r) => r.exerciseId === 'hip')).toBe(true);

      // DELETE as therapist removes it.
      const del = await authed('delete', `/references${qs}&exerciseId=hip`, therapist.token);
      expect(del.status).toBe(204);

      const after = await authed('get', `/references${qs}`, therapist.token);
      expect(after.body.some((r) => r.exerciseId === 'hip')).toBe(false);
    });

    it('forbids an unlinked therapist from accessing a patient (POST/GET/DELETE -> 403)', async () => {
      const patient = await makeUser('patient');
      const therapist = await makeUser('therapist'); // never linked

      const qs = `?patientId=${patient.user.id}`;

      const get = await authed('get', `/references${qs}`, therapist.token);
      expect(get.status).toBe(403);
      expect(get.body).toEqual({ error: 'forbidden' });

      const post = await authed('post', `/references${qs}`, therapist.token).send({
        exerciseId: 'ankle',
        jointAngles: { ankleDorsiflexion: 20 },
      });
      expect(post.status).toBe(403);
      expect(post.body).toEqual({ error: 'forbidden' });

      const del = await authed('delete', `/references${qs}&exerciseId=ankle`, therapist.token);
      expect(del.status).toBe(403);
      expect(del.body).toEqual({ error: 'forbidden' });
    });

    it("forbids a patient from accessing another patient's references (-> 403)", async () => {
      const owner = await makeUser('patient');
      const intruder = await makeUser('patient');

      const qs = `?patientId=${owner.user.id}`;

      const get = await authed('get', `/references${qs}`, intruder.token);
      expect(get.status).toBe(403);
      expect(get.body).toEqual({ error: 'forbidden' });

      const post = await authed('post', `/references${qs}`, intruder.token).send({
        exerciseId: 'wrist',
        jointAngles: { wristExtension: 45 },
      });
      expect(post.status).toBe(403);
      expect(post.body).toEqual({ error: 'forbidden' });

      const del = await authed('delete', `/references${qs}&exerciseId=wrist`, intruder.token);
      expect(del.status).toBe(403);
      expect(del.body).toEqual({ error: 'forbidden' });
    });
  });
});
