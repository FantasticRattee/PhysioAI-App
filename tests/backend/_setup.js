// Shared helpers for backend integration tests.
//
// Requiring ../../backend/server.js:
//   • loads ../backend/.env (DATABASE_URL + JWT_SECRET) via its own loadDotEnv()
//   • exports the Express `app` (never calls listen — require.main !== module)
//   • exports `.prisma` (added for test teardown)
//
// All test users get an @physioai-test.invalid email so cleanupTestUsers() can
// find and cascade-delete everything the suite created — leaving real data alone.
const request = require('supertest');
const app = require('../../backend/server');
const prisma = app.prisma;

const TEST_EMAIL_DOMAIN = 'physioai-test.invalid';
let seq = 0;
function uniqueEmail(prefix = 'u') {
  seq += 1;
  return `${prefix}.${Date.now()}.${seq}.${Math.random().toString(36).slice(2, 8)}@${TEST_EMAIL_DOMAIN}`;
}

// Register a fresh user through the real API. Returns { token, user, email, password }.
async function makeUser(role = 'patient', overrides = {}) {
  const email = (overrides.email || uniqueEmail(role)).toLowerCase();
  const password = overrides.password || 'secret123';
  const name = overrides.name || `Test ${role}`;
  const res = await request(app).post('/auth/register').send({ email, password, name, role });
  if (res.status !== 200) {
    throw new Error(`makeUser(${role}) register failed [${res.status}]: ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, user: res.body.user, email, password };
}

// supertest request with optional Bearer token. method: 'get'|'post'|'put'|'delete'.
function authed(method, path, token) {
  const r = request(app)[method](path);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
}

// Delete every row this suite created (matched by the test email domain).
// Schema has onDelete:Cascade, but we delete children first to be explicit/safe.
async function cleanupTestUsers() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  await prisma.therapistPatient.deleteMany({
    where: { OR: [{ therapistId: { in: ids } }, { patientId: { in: ids } }] },
  });
  await prisma.session.deleteMany({ where: { patientId: { in: ids } } });
  await prisma.reference.deleteMany({ where: { patientId: { in: ids } } });
  await prisma.plan.deleteMany({ where: { patientId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

module.exports = {
  app,
  prisma,
  request,
  uniqueEmail,
  makeUser,
  authed,
  cleanupTestUsers,
  TEST_EMAIL_DOMAIN,
};
