// Backend integration tests for /auth/* — supertest against the REAL server
// (Prisma on Railway Postgres). Every user created here uses an
// @physioai-test.invalid email so cleanupTestUsers() can cascade-delete them.
const jwt = require('jsonwebtoken');
const {
  app,
  request,
  prisma,
  makeUser,
  authed,
  cleanupTestUsers,
  uniqueEmail,
  TEST_EMAIL_DOMAIN,
} = require('./_setup');

afterAll(async () => {
  await cleanupTestUsers();
  await prisma.$disconnect();
});

describe('POST /auth/register', () => {
  it('registers a patient by default and returns 200 {token, user}', async () => {
    const email = uniqueEmail('reg');
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: 'secret123', name: 'Reg User' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Reg User',
      email: email.toLowerCase(),
      role: 'patient',
    });
    // Public user must NOT leak the password hash.
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('lowercases the email on register', async () => {
    const local = `Mixed.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const mixed = `${local}@${TEST_EMAIL_DOMAIN}`;
    const res = await request(app)
      .post('/auth/register')
      .send({ email: mixed, password: 'secret123', name: 'Mixed Case' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(mixed.toLowerCase());
  });

  it('honors role:"therapist"', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('thera'), password: 'secret123', name: 'Doc', role: 'therapist' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('therapist');
  });

  it('coerces any unknown role to "patient"', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('admin'), password: 'secret123', name: 'Sneaky', role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('patient');
  });

  it('400 {error:"required"} when email is missing', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ password: 'secret123', name: 'No Email' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'required' });
  });

  it('400 {error:"required"} when password is missing', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('nopw'), name: 'No Password' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'required' });
  });

  it('400 {error:"required"} when name is missing', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('noname'), password: 'secret123' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'required' });
  });

  it('400 {error:"required"} when name is only whitespace', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('blankname'), password: 'secret123', name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'required' });
  });

  it('400 {error:"invalid"} when password length < 6', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('shortpw'), password: '12345', name: 'Short PW' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid');
  });

  it('accepts a password of exactly 6 characters (boundary)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('sixpw'), password: '123456', name: 'Six PW' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('patient');
  });

  it('400 {error:"exists"} on duplicate email', async () => {
    const existing = await makeUser('patient');
    const res = await request(app)
      .post('/auth/register')
      .send({ email: existing.email, password: 'secret123', name: 'Dup User' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'exists' });
  });

  it('400 {error:"exists"} on duplicate email differing only by case', async () => {
    const existing = await makeUser('patient'); // email already lowercased by makeUser
    const res = await request(app)
      .post('/auth/register')
      .send({ email: existing.email.toUpperCase(), password: 'secret123', name: 'Dup Case' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'exists' });
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials -> 200 {token, user}', async () => {
    const u = await makeUser('patient');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: u.email, password: u.password });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toEqual({
      id: u.user.id,
      name: u.user.name,
      email: u.email,
      role: 'patient',
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('matches email case-insensitively (register lower, login UPPER)', async () => {
    const u = await makeUser('patient');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: u.email.toUpperCase(), password: u.password });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(u.user.id);
    expect(res.body.user.email).toBe(u.email);
  });

  it('401 {error:"invalid"} on wrong password', async () => {
    const u = await makeUser('patient');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: u.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid' });
  });

  it('401 {error:"invalid"} on unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: uniqueEmail('ghost'), password: 'secret123' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid' });
  });

  it('400 {error:"required"} when email is missing', async () => {
    const res = await request(app).post('/auth/login').send({ password: 'secret123' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'required' });
  });

  it('400 {error:"required"} when password is missing', async () => {
    const res = await request(app).post('/auth/login').send({ email: uniqueEmail('nopw') });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'required' });
  });

  it('400 {error:"required"} when body is empty', async () => {
    const res = await request(app).post('/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'required' });
  });
});

describe('POST /auth/resend-verification', () => {
  it('returns 200 {ok:true} without auth', async () => {
    const res = await request(app).post('/auth/resend-verification').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 200 {ok:true} even with an arbitrary body and no token', async () => {
    const res = await request(app)
      .post('/auth/resend-verification')
      .send({ email: uniqueEmail('resend') });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('GET /auth/me', () => {
  it('returns 200 {user} for the registered user with a valid Bearer token', async () => {
    const u = await makeUser('therapist');
    const res = await authed('get', '/auth/me', u.token);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: u.user.id,
      name: u.user.name,
      email: u.email,
      role: 'therapist',
    });
  });

  it('accepts a token issued by /auth/login', async () => {
    const u = await makeUser('patient');
    const login = await request(app)
      .post('/auth/login')
      .send({ email: u.email, password: u.password });
    expect(login.status).toBe(200);

    const res = await authed('get', '/auth/me', login.body.token);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(u.user.id);
  });

  it('issues a verifiable JWT whose sub is the user id', async () => {
    const u = await makeUser('patient');
    const decoded = jwt.decode(u.token);
    expect(decoded).toBeTruthy();
    expect(decoded.sub).toBe(u.user.id);
    expect(decoded.email).toBe(u.email);
    expect(decoded.role).toBe('patient');
  });

  it('401 {error:"unauthorized"} when no token is provided', async () => {
    const res = await authed('get', '/auth/me', null);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('401 {error:"unauthorized"} for a malformed/garbage token', async () => {
    const res = await authed('get', '/auth/me', 'not-a-real-jwt');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('401 {error:"unauthorized"} for a JWT signed with the wrong secret', async () => {
    const u = await makeUser('patient');
    const forged = jwt.sign({ sub: u.user.id, email: u.email, role: 'patient' }, 'totally-wrong-secret');
    const res = await authed('get', '/auth/me', forged);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('401 {error:"unauthorized"} when the Authorization header lacks the Bearer scheme', async () => {
    const u = await makeUser('patient');
    const res = await request(app).get('/auth/me').set('Authorization', u.token); // no "Bearer "

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });
});
