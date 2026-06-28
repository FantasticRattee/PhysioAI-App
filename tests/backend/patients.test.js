// Backend integration tests for the /patients (therapist scope) endpoints.
// Runs supertest against the REAL Express app + Railway Postgres (via _setup.js).
//
// Covered:
//   GET  /patients        — role guard (401/403), array of {id,name,email} ordered
//                           by linkedAt desc, empty list for a therapist w/ no links.
//   POST /patients/link   — role guard (401/403), link by email, link by patientId,
//                           400 'required' (neither), 404 'not_found' (unknown /
//                           non-patient), idempotent upsert (no duplicates).
const {
  request,
  app,
  prisma,
  makeUser,
  authed,
  cleanupTestUsers,
} = require('./_setup');

afterAll(async () => {
  await cleanupTestUsers();
  await prisma.$disconnect();
});

describe('GET /patients', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/patients');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it("returns 403 {error:'forbidden'} for a patient token", async () => {
    const patient = await makeUser('patient');
    const res = await authed('get', '/patients', patient.token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('returns [] for a therapist with no linked patients', async () => {
    const therapist = await makeUser('therapist');
    const res = await authed('get', '/patients', therapist.token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  it('returns {id,name,email} for each linked patient, ordered by linkedAt desc', async () => {
    const therapist = await makeUser('therapist');
    const first = await makeUser('patient', { name: 'First Linked' });
    const second = await makeUser('patient', { name: 'Second Linked' });

    // Link `first`, then `second` — most recently linked must come first.
    const linkFirst = await authed('post', '/patients/link', therapist.token).send({
      patientId: first.user.id,
    });
    expect(linkFirst.status).toBe(201);
    const linkSecond = await authed('post', '/patients/link', therapist.token).send({
      patientId: second.user.id,
    });
    expect(linkSecond.status).toBe(201);

    const res = await authed('get', '/patients', therapist.token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    // Most recently linked (second) is first.
    expect(res.body[0].id).toBe(second.user.id);
    expect(res.body[1].id).toBe(first.user.id);

    // Each entry exposes exactly id, name, email (no role / passwordHash leak).
    for (const p of res.body) {
      expect(Object.keys(p).sort()).toEqual(['email', 'id', 'name']);
    }
    expect(res.body[0]).toEqual({
      id: second.user.id,
      name: 'Second Linked',
      email: second.email,
    });
    expect(res.body[1]).toEqual({
      id: first.user.id,
      name: 'First Linked',
      email: first.email,
    });
  });

  it('only returns patients linked to the requesting therapist', async () => {
    const therapistA = await makeUser('therapist');
    const therapistB = await makeUser('therapist');
    const patient = await makeUser('patient', { name: 'Owned by A' });

    const link = await authed('post', '/patients/link', therapistA.token).send({
      patientId: patient.user.id,
    });
    expect(link.status).toBe(201);

    // therapistB linked nobody — must not see therapistA's patient.
    const res = await authed('get', '/patients', therapistB.token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /patients/link', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).post('/patients/link').send({ email: 'x@y.z' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it("returns 403 {error:'forbidden'} for a patient token", async () => {
    const patient = await makeUser('patient');
    const target = await makeUser('patient');
    const res = await authed('post', '/patients/link', patient.token).send({
      patientId: target.user.id,
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it("returns 400 {error:'required'} when neither email nor patientId is provided", async () => {
    const therapist = await makeUser('therapist');
    const res = await authed('post', '/patients/link', therapist.token).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'required' });
  });

  it('links an existing patient by email -> 201 {id,name,email}', async () => {
    const therapist = await makeUser('therapist');
    const patient = await makeUser('patient', { name: 'By Email' });

    const res = await authed('post', '/patients/link', therapist.token).send({
      email: patient.email,
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: patient.user.id,
      name: 'By Email',
      email: patient.email,
    });
    expect(Object.keys(res.body).sort()).toEqual(['email', 'id', 'name']);
  });

  it('links an existing patient by email case-insensitively', async () => {
    const therapist = await makeUser('therapist');
    const patient = await makeUser('patient', { name: 'Upper Case' });

    const res = await authed('post', '/patients/link', therapist.token).send({
      email: patient.email.toUpperCase(),
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(patient.user.id);
    expect(res.body.email).toBe(patient.email);
  });

  it('links an existing patient by patientId -> 201 {id,name,email}', async () => {
    const therapist = await makeUser('therapist');
    const patient = await makeUser('patient', { name: 'By Id' });

    const res = await authed('post', '/patients/link', therapist.token).send({
      patientId: patient.user.id,
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: patient.user.id,
      name: 'By Id',
      email: patient.email,
    });
  });

  it("returns 404 {error:'not_found'} for an unknown email", async () => {
    const therapist = await makeUser('therapist');
    const res = await authed('post', '/patients/link', therapist.token).send({
      email: 'nobody.here.12345@physioai-test.invalid',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it("returns 404 {error:'not_found'} for an unknown patientId", async () => {
    const therapist = await makeUser('therapist');
    const res = await authed('post', '/patients/link', therapist.token).send({
      patientId: 'does-not-exist-id-000',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it("returns 404 {error:'not_found'} when the target email is a therapist, not a patient", async () => {
    const therapist = await makeUser('therapist');
    const otherTherapist = await makeUser('therapist');
    const res = await authed('post', '/patients/link', therapist.token).send({
      email: otherTherapist.email,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it("returns 404 {error:'not_found'} when the target id is a therapist, not a patient", async () => {
    const therapist = await makeUser('therapist');
    const otherTherapist = await makeUser('therapist');
    const res = await authed('post', '/patients/link', therapist.token).send({
      patientId: otherTherapist.user.id,
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('is idempotent — linking the same patient twice still 201 and does not duplicate', async () => {
    const therapist = await makeUser('therapist');
    const patient = await makeUser('patient', { name: 'Linked Twice' });

    const first = await authed('post', '/patients/link', therapist.token).send({
      patientId: patient.user.id,
    });
    expect(first.status).toBe(201);
    expect(first.body.id).toBe(patient.user.id);

    const second = await authed('post', '/patients/link', therapist.token).send({
      patientId: patient.user.id,
    });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(patient.user.id);
    expect(second.body).toEqual(first.body);

    // GET /patients must list the patient exactly once.
    const list = await authed('get', '/patients', therapist.token);
    expect(list.status).toBe(200);
    const matches = list.body.filter((p) => p.id === patient.user.id);
    expect(matches).toHaveLength(1);
    expect(list.body).toHaveLength(1);
  });
});
