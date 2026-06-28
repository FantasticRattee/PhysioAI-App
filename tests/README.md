# PhysioAI — Test Design Document (TDD) & Test Suite

> AI‑assisted physiotherapy for physically‑disabled persons in Thailand.
> This folder is a **self‑contained, runnable test suite** plus this design
> document. It is **not** part of any app build or the Railway deploy — it has
> its own `package.json` and never ships.

**Status:** ✅ **909 tests / 37 suites — all green.**
(108 backend integration · 801 unit) · Jest 29 · Node ≥ 18.

---

## 1. Quick start

```bash
cd App-V3.1/tests
npm install            # one-time: jest, supertest, jsdom, babel, jsonwebtoken

npm test               # everything, safely: unit (parallel) then backend (serial)

# focused runs
npm run test:unit      # Patient AI + Therapist shared (fast, no network)
npm run test:patient   # Patient mobile only
npm run test:therapist # Therapist web only
npm run test:backend   # API integration vs the real Railway DB (serial)
npm run coverage       # line/branch coverage for the unit projects
```

> **Backend tests hit the real Railway Postgres** (the same DB used by V2), per
> the chosen strategy. They only ever create/delete rows whose email ends in
> `@physioai-test.invalid` and clean up after themselves, so real data is never
> touched. They need network access and `backend/.env` present (auto-loaded by
> `server.js`). Run them **serially** — `npm test` and `npm run test:backend`
> already do (`--runInBand`); don't run the raw `jest` binary across all
> projects at once or the parallel backend workers will race on cleanup.

---

## 2. Test strategy

A standard test pyramid mapped onto PhysioAI's three layers:

| Layer | What it is | Test style | Why |
|---|---|---|---|
| **Backend API** | Express + Prisma + JWT (`backend/server.js`) | **Integration** via `supertest` against the **real Railway DB** | The API's job *is* talking to Postgres (auth, access-control, JSONB round-trips, BigInt). Mocking Prisma would test the mock, not the contract. |
| **Patient AI pipeline** | Pose math & rules (`Patient/src/ai`, pure ESM) | **Unit**, no mocks | Deterministic math (angles, scoring, rep detection). Perfect for fast, exhaustive unit tests. |
| **Patient / Therapist core** | api/auth/store/i18n (talk to network & storage) | **Unit with mocks** (AsyncStorage / fetch / localStorage stubbed) | Logic is worth testing; the I/O is not. Mocks make branches deterministic. |
| **Therapist analytics** | Stats & clinical rules (`Therapist/shared/ai`) | **Unit**, no mocks | Pure functions over session data — directly unit-testable. |

### Environment architecture (three Jest "projects")

Defined in [`jest.config.js`](jest.config.js):

| Project | `testEnvironment` | Transform | Notes |
|---|---|---|---|
| `backend` | node | none (CommonJS) | `supertest(app)`; `server.js` exports `app` (+ `.prisma` for teardown) and never `listen()`s under test. |
| `patient` | node | babel (ESM→CJS) | `@react-native-async-storage/async-storage` & `expo-speech` auto-mocked; `global.__DEV__ = false`. |
| `therapist` | jsdom | babel (ESM→CJS) | `window`/`document`/`localStorage` provided by jsdom; `fetch` stubbed per test; MediaPipe (`PoseDetection.js`) `jest.mock`ed. |

Shared helpers: [`backend/_setup.js`](backend/_setup.js) (app, prisma, `makeUser`,
`authed`, `cleanupTestUsers`), [`mocks/`](mocks) (AsyncStorage, expo-speech),
[`setup/`](setup) (per-project globals).

---

## 3. Coverage matrix — source module → tests

### 3.1 Backend API (`backend/server.js`) — 108 tests / 7 suites

| Test file | Endpoints / concerns verified |
|---|---|
| `backend/auth.test.js` | `POST /auth/register` (200 `{token,user}`, email lowercased, role default/`therapist`/coerce, missing→400 `required`, pw<6→400 `invalid`, 6‑char boundary, duplicate + case‑insensitive dup→400 `exists`); `POST /auth/login` (ok, case‑insensitive, wrong/unknown→401 `invalid`, missing→400); `resend-verification`→`{ok:true}`; `GET /auth/me` (valid Bearer ok; no/garbage/**wrong‑secret‑forged**/no‑scheme token→401); JWT is verifiable. |
| `backend/patients.test.js` | `GET /patients` (therapist‑only; patient→403; `linkedAt` desc; `{id,name,email}` shape; isolation; empty list); `POST /patients/link` (by email/id→201, missing→400, unknown/therapist‑target→404 `not_found`, idempotent upsert). |
| `backend/plans.test.js` | `GET /plans` (no plan→JSON `null`; defaults after PUT); `PUT /plans` normalization (`durationDays`↔`durationWeeks` derivation, ceil rounding, items coercion); PUT→GET round‑trip; access control (linked therapist 200, unlinked→403, cross‑patient→403, no token→401). |
| `backend/references.test.js` | `GET` (empty init, 401); `POST` (missing `exerciseId`→400, strips `patientId`/`exerciseId` from data blob, upsert no‑dup); `DELETE` (204, missing→400); access control. |
| `backend/sessions.test.js` | `POST` (201, `sessionFromRow` shape, default id `s_<pid>_<endedAt>`, `endedAt` defaults→Number, BigInt round‑trip, `exerciseKey` fallback, same‑id upsert); `GET` (`endedAt` desc, round‑trip, empty); access control. |
| `backend/middleware.test.js` | CORS preflight (OPTIONS→204, ACAO reflects Origin, ACAH `authorization`, ACAM verbs, `Vary`); CSP on GET (`wasm-unsafe-eval`, `worker-src`); `requireAuth` 401 across all protected routes incl. malformed Bearer; `requireRole` 403 for patient on therapist routes. |
| `backend/health.test.js` | `GET /health` → `{name,status:'ok'}`. |

### 3.2 Patient AI pipeline (`Patient/src/ai`) — unit

| Source module | Test file | Verified |
|---|---|---|
| `landmarks.js` | `patient/landmarks.test.js` | 33 BlazePose names; `idx()` hit/miss (−1). |
| `JointAngleCalculator.js` | `patient/jointAngleCalculator.test.js` | `angleAt` (90/180/0/45°, [0,180], null on degenerate); 12 `JOINT_SPECS`; `MIN_VIS=0.5` boundary; `makePose`→angle round‑trip (~8° per limb). |
| `PoseComparator.js` | `patient/poseComparator.test.js` | `DEFAULT_TOLERANCE=15`, elbow=12; score 100 on match; ok/warn/bad at tol/2·tol; formula `clamp(1−Δ/(3·tol))·100`; `primary`=worst; null skip; `tolOverride`; `scoreTone` cutoffs. |
| `FormScorer.js` | `patient/formScorer.test.js` | 4 classes (correct/undershoot/lean/multi); conf formulas; low‑sample (<3) penalty; null pose. |
| `FeedbackGenerator.js` | `patient/feedbackGenerator.test.js` | `makeCue` praise (≥92), directional inc/dec per joint, tone mirrors status, `{id,text,tone}` contract (i18n mocked). |
| `ExerciseRecognition.js` | `patient/exerciseRecognition.test.js` | k‑NN recognize exact match, conf∈[0,1], margin boost, drift, null guards. |
| `MultiJointMotion.js` | `patient/multiJointMotion.test.js` | `candidateJoints`, `selectRepJoints` (`MIN_RANGE_DEG=15`, `KEEP_RATIO=0.45`, `MAX_REP_JOINTS=4`, dominant), `buildMotionConfig`, frame eval. |
| `SyntheticPose.js` | `patient/syntheticPose.test.js` | 33‑pt pose, determinism, jitter, angle round‑trip, `makeSyntheticFeed` phase/deg. |
| `BoundaryBoxGate.js` | `patient/boundaryBoxGate.test.js` | `BOUNDARY_BOX_RATIO=0.95`, box math, key joints, in/out‑of‑frame, missing (`VIS_OK=0.35`), injected `now`. |
| `CameraSetupGate.js` | `patient/cameraSetupGate.test.js` | well‑framed→ok, low‑vis/clipping→hint+penalty, `missing`. |

### 3.3 Patient core (`Patient/src/core`) — unit w/ mocks

| Source | Test file | Verified |
|---|---|---|
| `exercises.js` | `patient/exercises.test.js` | catalog shape, find/get/exists fallback, body‑region aliases, `romRange` clamp≥20, snapshot coercion. |
| `theme.js` | `patient/theme.test.js` | `scoreTone` cutoffs, `toneColor`, palette & skeleton colors. |
| `api.js` | `patient/core.api.test.js` | base‑URL trim, `isCloud`, token attach (`Bearer`), get/post/put, error→`.code`/`http_<status>`. |
| `auth.js` | `patient/core.auth.test.js` | cloud register/login, **patient‑role guard**, session+token store, logout. |
| `store.js` | `patient/core.store.test.js` | references/plan/sessions cloud+local, **dosage‑preserving** `savePlan`, settings defaults. |
| `i18n.js` | `patient/core.i18n.test.js` | `t` interpolation, en/th, key fallback, `setLang`/`onLangChange`. |
| `session.js` | `patient/core.session.test.js` | `createSession` orchestration, `pushFrame` snapshot, rep counting, `finishSummary` (Date mocked), reset. |

### 3.4 Therapist shared (`Therapist/shared`) — unit (+jsdom)

| Source | Test file | Verified |
|---|---|---|
| `ai/SessionAnalytics.js` | `therapist/sessionAnalytics.test.js` | `movingAverage`, `zScores`, `sessionScore`, `aggregate` (worstJoint, sub‑metrics), `sessionTrend` slope. |
| `ai/ClinicalRuleEngine.js` | `therapist/clinicalRuleEngine.test.js` | all alert rules & thresholds (regression z<−1.5, low‑score high/med, missed‑days high/med, trend drop, joint delta), bilingual text, severity enum. |
| `ai/MultiJointMotion.js` | `therapist/multiJointMotion.test.js` | rep‑joint selection, `buildReference{Trajectory,Motion}`, `insufficient-motion` throw, alternating sides. |
| `ai/summary.js` | `therapist/summary.test.js` | bilingual on‑device progress note, aggregates, zero‑session safe. |
| `ai/LlmSummary.js` | `therapist/llmSummary.test.js` | `isConfigured()`=false default, **prompt de‑identification** (no name/email), `summarize` null when unconfigured (no fetch), configured happy path. |
| `ai/JointAngleCalculator.js` + `ai/PoseComparator.js` | `therapist/poseMath.test.js` | angle math + comparator (PoseDetection/MediaPipe mocked). |
| `core/api.js` | `therapist/core.api.test.js` | `window.PHYSIOAI_API_BASE`, localStorage token, get/post/put/delete, error `.code`. |
| `core/auth.js` | `therapist/core.auth.test.js` | login/register, **therapist‑role guard** (`not_therapist`), verify, logout. |
| `core/exercises.js` | `therapist/core.exercises.test.js` | builtins + **custom CRUD** (save/update/delete, `not-found`), regions, `romRange`, `exLabel`. |
| `core/i18n.js` | `therapist/core.i18n.test.js` | `t` interpolation/fallback, `setLang` event. |
| `core/store.js` | `therapist/core.store.test.js` | references/plan/sessions local+cloud, seed patients, settings, `resetAll`. |
| `core/patients.js` | `therapist/core.patients.test.js` | fetch/link patients, fetch sessions/plan, cloud vs demo delegation. |
| `core/icons.js` | `therapist/icons.test.js` | `icon()` SVG string, `iconEl()` DOM node, unknown fallback. |

---

## 4. Requirements traceability

| # | PhysioAI requirement | Covered by |
|---|---|---|
| R1 | Auth & roles (patient / therapist) | `backend/auth`, `backend/middleware`, `patient/core.auth`, `therapist/core.auth` |
| R2 | Therapist assigns treatment plan to a patient | `backend/plans`, `backend/patients`, `patient/core.store`, `therapist/core.store`, `therapist/core.patients` |
| R3 | Reference‑pose capture & sync | `backend/references`, `patient/core.store`, `therapist/core.store` |
| R4 | Pose → joint angles (BlazePose) | `patient/jointAngleCalculator`, `therapist/poseMath`, `patient/landmarks` |
| R5 | Form scoring vs reference | `patient/poseComparator`, `patient/formScorer`, `therapist/poseMath` |
| R6 | **Multi‑joint exercise authoring & scoring** | `patient/multiJointMotion`, `therapist/multiJointMotion` |
| R7 | Exercise recognition | `patient/exerciseRecognition` |
| R8 | Camera framing / boundary gating | `patient/cameraSetupGate`, `patient/boundaryBoxGate` |
| R9 | Real‑time corrective feedback cues | `patient/feedbackGenerator` |
| R10 | Session logging & history | `backend/sessions`, `patient/core.store`, `therapist/core.store` |
| R11 | Clinical analytics & alerts | `therapist/sessionAnalytics`, `therapist/clinicalRuleEngine` |
| R12 | Progress summaries (on‑device + LLM, de‑identified) | `therapist/summary`, `therapist/llmSummary` |
| R13 | Bilingual TH / EN | `patient/core.i18n`, `therapist/core.i18n` |
| R14 | Exercise catalog & custom exercises | `patient/exercises`, `therapist/core.exercises` |
| R15 | API contract, CORS, CSP (WASM‑friendly) | `backend/middleware`, `backend/health` |

---

## 5. Not automated here (and how they're verified)

Some layers need real hardware, a real browser DOM, or paid services. They are
**deliberately excluded** from the automated suite and verified manually. They
are not gaps in logic coverage — the logic they wrap is already unit‑tested above.

| Area | Module(s) | Why excluded | How to verify |
|---|---|---|---|
| Live pose detection | `PoseDetection.js`, `Patient/src/pose/PoseCamera.js` | MediaPipe WASM + real camera | Manual on device (see checklist) |
| Text‑to‑speech audio | `Patient/src/core/tts.js`, `Therapist/shared/ai/ThaiTtsEngine.js` | Native speech / Web Speech API | Manual listen test (TH + EN) |
| Web UI rendering & nav | `Therapist/shared/core/ui.js`, `auth-ui.js`, `therapist/*.html` | Full DOM/visual | Manual; optionally add Playwright later |
| RN screens & practice hook | `Patient/src/screens/*`, `pose/usePractice.js` | React Native renderer | Manual; optionally add `@testing-library/react-native` |
| Live LLM summary | `LlmSummary.summarize` (configured) | External paid API | Manual with a configured endpoint (prompt building **is** tested) |

### Manual / E2E checklist
- [ ] Patient app: camera grants, skeleton overlay tracks body, boundary box turns green when framed.
- [ ] Patient app: do an exercise → reps count, score ring updates, spoken cue (TH/EN) plays.
- [ ] Multi‑joint exercise: therapist types a name, picks several joints on the skeleton, saves; patient sees every selected joint scored.
- [ ] Therapist web (served at `http://localhost:3000/`, **not** Live Server): register/login, link a patient, assign a plan, capture a reference.
- [ ] Cloud round‑trip: plan assigned on web appears in the patient app; a completed session appears in the therapist dashboard.
- [ ] Clinical alerts render for a patient with declining / missed sessions.

---

## 6. Test‑data safety (backend)

- Every test identity uses an **`@physioai-test.invalid`** email.
- `makeUser(role)` registers through the real API and returns `{token,user,…}`.
- `cleanupTestUsers()` (in each backend file's `afterAll`) finds all
  test‑domain users and **cascade‑deletes** them (schema has `onDelete:Cascade`
  on Plan/Reference/Session/TherapistPatient) → plus `prisma.$disconnect()`.
- Real user data is never selected, modified, or deleted.

---

## 7. Conventions for adding tests

- Put the file under the right project dir (`backend/`, `patient/`, `therapist/`) ending in `.test.js`.
- Import the **real source** with a relative path (e.g. `../../Patient/src/ai/PoseComparator.js`); always read the source first and assert its actual shape — never invent an API.
- **patient/**: use `import`; RN deps are auto‑mocked; stub `global.fetch` for network code; reset AsyncStorage in `beforeEach`.
- **therapist/**: jsdom gives DOM/localStorage; stub `global.fetch`; `jest.mock` `PoseDetection.js` for any AI math module.
- **backend/**: use `require('./_setup')`; always `cleanupTestUsers()` + `$disconnect()` in `afterAll`; keep new files runnable under `--runInBand`.

> **Line‑coverage caveat:** the app source lives outside this `tests/` rootDir,
> so Jest's instrumenter does not auto‑collect it; `npm run coverage` reports the
> unit projects. Coverage is therefore tracked here as the **module → test
> matrix** in §3 rather than a single line‑% number.
