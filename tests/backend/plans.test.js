// Backend integration tests for /plans + access control.
// Runs supertest against the real Express app (server.js) + Railway Postgres via Prisma.
//
// Behavior under test (from backend/server.js):
//   • GET /plans  -> planFromRow(row) = row ? cleanPlan(row.data, patientId) : null
//       => when NO plan row exists yet, the server responds with JSON `null`.
//       => once a plan exists, cleanPlan normalizes it:
//          { patientId, items:[], freqPerDay:1, daysPerWeek:7, durationDays:28,
//            durationWeeks:4, startDate:null, notes:'', updatedAt:<number> }
//   • PUT /plans  -> cleanPlan(req.body, patientId), upserted, returned via planFromRow
//       - durationDays derived from durationWeeks (weeks*7) when only weeks given
//       - durationWeeks derived from durationDays (max(1, ceil(days/7))) when only days given
//   • Access control via canAccessPatient():
//       - self always allowed
//       - therapist allowed iff a therapistPatient link exists
//       - otherwise 403 { error: 'forbidden' }
const { app, request, prisma, makeUser, authed, cleanupTestUsers } = require('./_setup');

afterAll(async () => {
  await cleanupTestUsers();
  await prisma.$disconnect();
});

describe('GET /plans (own)', () => {
  it('returns JSON null for a patient with no plan yet', async () => {
    const patient = await makeUser('patient');
    const res = await authed('get', '/plans', patient.token);

    // planFromRow(null) === null, so the server sends the literal JSON `null`.
    expect(res.status).toBe(200);
    expect(res.text).toBe('null');
  });

  it('returns cleanPlan defaults once a plan exists (PUT then GET)', async () => {
    const patient = await makeUser('patient');
    await authed('put', '/plans', patient.token).send({ items: [] });
    const res = await authed('get', '/plans', patient.token);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      patientId: patient.user.id,
      items: [],
      freqPerDay: 1,
      daysPerWeek: 7,
      durationDays: 28,
      durationWeeks: 4,
      startDate: null,
      notes: '',
    });
    expect(typeof res.body.updatedAt).toBe('number');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(0);
  });

  it('requires authentication (401 unauthorized without a token)', async () => {
    const res = await request(app).get('/plans');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });
});

describe('PUT /plans (own) — normalization & derivation', () => {
  it('normalizes the body and derives durationDays from durationWeeks (weeks*7=14)', async () => {
    const patient = await makeUser('patient');
    const body = {
      items: [{ exerciseId: 'shoulder', reps: 10, sets: 3 }],
      notes: 'hi',
      durationWeeks: 2,
    };
    const res = await authed('put', '/plans', patient.token).send(body);

    expect(res.status).toBe(200);
    expect(res.body.patientId).toBe(patient.user.id);
    // items preserved exactly
    expect(res.body.items).toEqual([{ exerciseId: 'shoulder', reps: 10, sets: 3 }]);
    expect(res.body.notes).toBe('hi');
    // durationDays derived = durationWeeks * 7
    expect(res.body.durationWeeks).toBe(2);
    expect(res.body.durationDays).toBe(14);
    // untouched fields fall back to defaults
    expect(res.body.freqPerDay).toBe(1);
    expect(res.body.daysPerWeek).toBe(7);
    expect(res.body.startDate).toBe(null);
    expect(typeof res.body.updatedAt).toBe('number');
  });

  it('derives durationWeeks from durationDays (durationDays:28 -> durationWeeks:4)', async () => {
    const patient = await makeUser('patient');
    const res = await authed('put', '/plans', patient.token).send({ durationDays: 28 });

    expect(res.status).toBe(200);
    expect(res.body.durationDays).toBe(28);
    expect(res.body.durationWeeks).toBe(4);
  });

  it('rounds durationWeeks up via ceil when days are not a multiple of 7 (10 -> 2)', async () => {
    const patient = await makeUser('patient');
    const res = await authed('put', '/plans', patient.token).send({ durationDays: 10 });

    expect(res.status).toBe(200);
    expect(res.body.durationDays).toBe(10);
    // Math.max(1, Math.ceil(10/7)) === 2
    expect(res.body.durationWeeks).toBe(2);
  });

  it('keeps explicit durationDays when both days and weeks are provided', async () => {
    const patient = await makeUser('patient');
    const res = await authed('put', '/plans', patient.token).send({
      durationDays: 21,
      durationWeeks: 5,
    });

    expect(res.status).toBe(200);
    // both supplied -> no derivation; values pass through
    expect(res.body.durationDays).toBe(21);
    expect(res.body.durationWeeks).toBe(5);
  });

  it('coerces a non-array items field to an empty array', async () => {
    const patient = await makeUser('patient');
    const res = await authed('put', '/plans', patient.token).send({ items: 'not-an-array' });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('requires authentication (401 unauthorized without a token)', async () => {
    const res = await request(app).put('/plans').send({ notes: 'x' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });
});

describe('PUT then GET round-trip', () => {
  it('GET returns the same items/notes that were PUT', async () => {
    const patient = await makeUser('patient');
    const items = [
      { exerciseId: 'shoulder', reps: 10, sets: 3 },
      { exerciseId: 'knee', reps: 12, sets: 2 },
    ];
    const putRes = await authed('put', '/plans', patient.token).send({
      items,
      notes: 'round-trip',
      durationWeeks: 3,
    });
    expect(putRes.status).toBe(200);

    const getRes = await authed('get', '/plans', patient.token);
    expect(getRes.status).toBe(200);
    expect(getRes.body.patientId).toBe(patient.user.id);
    expect(getRes.body.items).toEqual(items);
    expect(getRes.body.notes).toBe('round-trip');
    expect(getRes.body.durationWeeks).toBe(3);
    expect(getRes.body.durationDays).toBe(21);
  });
});

describe('Access control (?patientId=)', () => {
  it('a linked therapist can GET the patient plan via ?patientId= (200)', async () => {
    const patient = await makeUser('patient');
    const therapist = await makeUser('therapist');

    // patient creates a plan first so there is something to read back
    await authed('put', '/plans', patient.token).send({
      items: [{ exerciseId: 'knee', reps: 5, sets: 2 }],
    });

    // link the therapist to the patient
    const linkRes = await authed('post', '/patients/link', therapist.token).send({
      patientId: patient.user.id,
    });
    expect(linkRes.status).toBe(201);

    const res = await authed('get', `/plans?patientId=${patient.user.id}`, therapist.token);
    expect(res.status).toBe(200);
    expect(res.body.patientId).toBe(patient.user.id);
    expect(res.body.items).toHaveLength(1);
  });

  it('a linked therapist can PUT the patient plan via ?patientId= (200)', async () => {
    const patient = await makeUser('patient');
    const therapist = await makeUser('therapist');

    const linkRes = await authed('post', '/patients/link', therapist.token).send({
      patientId: patient.user.id,
    });
    expect(linkRes.status).toBe(201);

    const items = [{ exerciseId: 'hip', reps: 8, sets: 4 }];
    const putRes = await authed('put', `/plans?patientId=${patient.user.id}`, therapist.token).send({
      items,
      notes: 'from therapist',
    });
    expect(putRes.status).toBe(200);
    expect(putRes.body.patientId).toBe(patient.user.id);
    expect(putRes.body.items).toEqual(items);
    expect(putRes.body.notes).toBe('from therapist');

    // the patient can read what the therapist wrote
    const getRes = await authed('get', '/plans', patient.token);
    expect(getRes.status).toBe(200);
    expect(getRes.body.items).toEqual(items);
    expect(getRes.body.notes).toBe('from therapist');
  });

  it('a therapist NOT linked to the patient is forbidden on GET (403 forbidden)', async () => {
    const patient = await makeUser('patient');
    const therapist = await makeUser('therapist');

    const res = await authed('get', `/plans?patientId=${patient.user.id}`, therapist.token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('a therapist NOT linked to the patient is forbidden on PUT (403 forbidden)', async () => {
    const patient = await makeUser('patient');
    const therapist = await makeUser('therapist');

    const res = await authed('put', `/plans?patientId=${patient.user.id}`, therapist.token).send({
      notes: 'should be blocked',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('a patient requesting another patient plan is forbidden (403 forbidden)', async () => {
    const patientA = await makeUser('patient');
    const patientB = await makeUser('patient');

    const res = await authed('get', `/plans?patientId=${patientB.user.id}`, patientA.token);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('a patient cannot PUT another patient plan (403 forbidden)', async () => {
    const patientA = await makeUser('patient');
    const patientB = await makeUser('patient');

    const res = await authed('put', `/plans?patientId=${patientB.user.id}`, patientA.token).send({
      notes: 'should be blocked',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });
});
