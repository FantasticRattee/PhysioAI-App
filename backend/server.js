// PhysioAI · API server — Express + Prisma (PostgreSQL on Railway) + JWT auth.
//
// V3 app on V2's backend stack. Same REST contract the apps already use
// ({ token, user } auth + Bearer; /plans /references /sessions /patients keyed by
// patientId). Also serves the Therapist web (../Therapist) with a MediaPipe-WASM
// friendly CSP when run on a Node host.
const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

loadDotEnv();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';
if (JWT_SECRET === 'dev-secret-change-me') {
  console.warn('[PhysioAI] WARNING: JWT_SECRET is the insecure default — set JWT_SECRET in env.');
}

// Minimal .env loader (so Prisma + the server share one file; no dotenv dep).
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key && process.env[key] == null) process.env[key] = val;
  }
}

/* ── helpers ─────────────────────────────────────────────── */
function apiError(res, status, error, detail) {
  const body = { error };
  if (detail && process.env.NODE_ENV !== 'production') body.detail = detail;
  return res.status(status).json(body);
}
function bearerToken(req) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}
function signToken(u) {
  return jwt.sign({ sub: u.id, email: u.email, role: u.role, name: u.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) return apiError(res, 401, 'unauthorized');
  try {
    const p = jwt.verify(token, JWT_SECRET);
    req.auth = { user: { id: p.sub, email: p.email, name: p.name, role: p.role } };
    next();
  } catch {
    return apiError(res, 401, 'unauthorized');
  }
}
function requireRole(role) {
  return (req, res, next) => (req.auth?.user?.role === role ? next() : apiError(res, 403, 'forbidden'));
}
function targetPatientId(req) {
  return req.query.patientId || req.body?.patientId || req.auth.user.id;
}
async function canAccessPatient(req, patientId) {
  if (!patientId) return false;
  if (req.auth.user.id === patientId) return true;
  if (req.auth.user.role !== 'therapist') return false;
  const link = await prisma.therapistPatient.findUnique({
    where: { therapistId_patientId: { therapistId: req.auth.user.id, patientId } },
  });
  return !!link;
}

function cleanPlan(plan, patientId) {
  const p = plan || {};
  return {
    patientId,
    items: Array.isArray(p.items) ? p.items : [],
    freqPerDay: p.freqPerDay ?? 1,
    daysPerWeek: p.daysPerWeek ?? 7,
    durationDays: p.durationDays ?? (p.durationWeeks ? p.durationWeeks * 7 : 28),
    durationWeeks: p.durationWeeks ?? Math.max(1, Math.ceil((p.durationDays || 28) / 7)),
    startDate: p.startDate ?? null,
    notes: p.notes ?? '',
    updatedAt: p.updatedAt ?? Date.now(),
  };
}
const planFromRow = (row) => (row ? cleanPlan(row.data, row.patientId) : null);
const referenceFromRow = (row) => ({ exerciseId: row.exerciseId, ...(row.data || {}) });
function sessionFromRow(row) {
  const data = row.data || {};
  return {
    id: row.id,
    patientId: row.patientId,
    exerciseId: row.exerciseId || data.exerciseId,
    ...data,
    endedAt: data.endedAt ?? Number(row.endedAt),
  };
}
function isoEpochMs(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : Date.now();
}

/* ── CORS + CSP (bearer tokens, no cookies) ──────────────── */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob: https: *; style-src 'self' 'unsafe-inline' https: *; " +
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https: *; font-src 'self' data: https: *; " +
    "connect-src 'self' https: *; media-src 'self' blob: https: *; worker-src 'self' blob:; " +
    "object-src 'none'; frame-src 'self' https: *;"
  );
  next();
});
app.use(express.json({ limit: '8mb' }));

app.get('/health', (_req, res) => res.json({ name: 'PhysioAI API (Prisma)', status: 'ok' }));

/* ── auth ────────────────────────────────────────────────── */
app.post('/auth/register', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim();
  const role = req.body.role === 'therapist' ? 'therapist' : 'patient';
  if (!email || !password || !name) return apiError(res, 400, 'required');
  if (password.length < 6) return apiError(res, 400, 'invalid', 'Password should be at least 6 characters.');
  try {
    if (await prisma.user.findUnique({ where: { email } })) return apiError(res, 400, 'exists');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash, name, role } });
    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

app.post('/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return apiError(res, 400, 'required');
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return apiError(res, 401, 'invalid');
    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

// Email verification is not used with JWT auth — kept as a harmless no-op so the
// client's optional "resend" call never 404s.
app.post('/auth/resend-verification', (_req, res) => res.json({ ok: true }));

app.get('/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth.user.id } });
  return res.json({ user: user ? publicUser(user) : req.auth.user });
});

/* ── patients (therapist) ────────────────────────────────── */
app.get('/patients', requireAuth, requireRole('therapist'), async (req, res) => {
  try {
    const links = await prisma.therapistPatient.findMany({
      where: { therapistId: req.auth.user.id },
      orderBy: { linkedAt: 'desc' },
      include: { patient: { select: { id: true, name: true, email: true } } },
    });
    return res.json(links.map((l) => l.patient));
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

app.post('/patients/link', requireAuth, requireRole('therapist'), async (req, res) => {
  const patientId = String(req.body.patientId || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!patientId && !email) return apiError(res, 400, 'required');
  try {
    const patient = await prisma.user.findFirst({
      where: { role: 'patient', ...(patientId ? { id: patientId } : { email }) },
    });
    if (!patient) return apiError(res, 404, 'not_found');
    await prisma.therapistPatient.upsert({
      where: { therapistId_patientId: { therapistId: req.auth.user.id, patientId: patient.id } },
      create: { therapistId: req.auth.user.id, patientId: patient.id },
      update: {},
    });
    return res.status(201).json({ id: patient.id, name: patient.name, email: patient.email });
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

/* ── plans ───────────────────────────────────────────────── */
app.get('/plans', requireAuth, async (req, res) => {
  const patientId = targetPatientId(req);
  try {
    if (!(await canAccessPatient(req, patientId))) return apiError(res, 403, 'forbidden');
    const row = await prisma.plan.findUnique({ where: { patientId } });
    return res.json(planFromRow(row));
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

app.put('/plans', requireAuth, async (req, res) => {
  const patientId = targetPatientId(req);
  try {
    if (!(await canAccessPatient(req, patientId))) return apiError(res, 403, 'forbidden');
    const plan = cleanPlan(req.body, patientId);
    const row = await prisma.plan.upsert({
      where: { patientId },
      create: { patientId, data: plan },
      update: { data: plan },
    });
    return res.json(planFromRow(row));
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

/* ── references ──────────────────────────────────────────── */
app.get('/references', requireAuth, async (req, res) => {
  const patientId = targetPatientId(req);
  try {
    if (!(await canAccessPatient(req, patientId))) return apiError(res, 403, 'forbidden');
    const rows = await prisma.reference.findMany({ where: { patientId } });
    return res.json(rows.map(referenceFromRow));
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

app.post('/references', requireAuth, async (req, res) => {
  const patientId = targetPatientId(req);
  const exerciseId = req.body.exerciseId;
  if (!exerciseId) return apiError(res, 400, 'required');
  try {
    if (!(await canAccessPatient(req, patientId))) return apiError(res, 403, 'forbidden');
    const { patientId: _p, exerciseId: _e, ...reference } = req.body;
    const row = await prisma.reference.upsert({
      where: { patientId_exerciseId: { patientId, exerciseId } },
      create: { patientId, exerciseId, data: reference },
      update: { data: reference },
    });
    return res.json(referenceFromRow(row));
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

app.delete('/references', requireAuth, async (req, res) => {
  const patientId = targetPatientId(req);
  const exerciseId = req.query.exerciseId || req.body?.exerciseId;
  if (!exerciseId) return apiError(res, 400, 'required');
  try {
    if (!(await canAccessPatient(req, patientId))) return apiError(res, 403, 'forbidden');
    await prisma.reference.deleteMany({ where: { patientId, exerciseId: String(exerciseId) } });
    return res.status(204).send();
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

/* ── sessions ────────────────────────────────────────────── */
app.get('/sessions', requireAuth, async (req, res) => {
  const patientId = targetPatientId(req);
  try {
    if (!(await canAccessPatient(req, patientId))) return apiError(res, 403, 'forbidden');
    const rows = await prisma.session.findMany({ where: { patientId }, orderBy: { endedAt: 'desc' } });
    return res.json(rows.map(sessionFromRow));
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

app.post('/sessions', requireAuth, async (req, res) => {
  const patientId = targetPatientId(req);
  try {
    if (!(await canAccessPatient(req, patientId))) return apiError(res, 403, 'forbidden');
    const endedAt = isoEpochMs(req.body.endedAt || Date.now());
    const session = { ...req.body, patientId, endedAt };
    const id = req.body.id || `s_${patientId}_${endedAt}`;
    const exerciseId = req.body.exerciseId || req.body.exerciseKey || null;
    const row = await prisma.session.upsert({
      where: { id },
      create: { id, patientId, exerciseId, endedAt: BigInt(endedAt), data: session },
      update: { exerciseId, endedAt: BigInt(endedAt), data: session },
    });
    return res.status(201).json(sessionFromRow(row));
  } catch (e) {
    return apiError(res, 500, 'server_error', e.message);
  }
});

/* ── static Therapist web (Node-host mode) ───────────────── */
const WEB_DIR = process.env.WEB_DIR || path.join(__dirname, '..', 'Therapist');
app.use(express.static(WEB_DIR, { extensions: ['html'] }));

function start() {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    const mode = process.env.DATABASE_URL ? 'DB configured' : 'DATABASE_URL missing';
    console.log(`PhysioAI API on :${port} (${mode})`);
  });
}
if (require.main === module) start();

module.exports = app;
module.exports.app = app;
module.exports.start = start;
