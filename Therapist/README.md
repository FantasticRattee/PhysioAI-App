# PhysioAI — Therapist Console (Web)

The **therapist-facing** web app. Runs the real on-device **BlazePose** pipeline in the browser to capture reference poses, build treatment plans, record ML datasets, and review patient progress.

> **App split:** Patient = `../Patient/` (React Native / Expo) · **Therapist = this** (vanilla JS + ES modules, no build step) · shared backend = this Express server backed by **Supabase**.

---

## Run
ES modules + camera need an HTTP origin (not `file://`):
```bash
cd /Users/title/Desktop/AppTitle/Therapist
npm install
npm start      # → http://localhost:3000
```
Chrome recommended. The Node server serves static files and the Supabase-backed API.

### Supabase setup
1. Log in and link the local Supabase CLI project once:
   ```bash
   npm run supabase:login
   npm run supabase:link
   ```
2. Preview and push migrations:
   ```bash
   npm run supabase:push:dry
   npm run supabase:push
   ```
3. In Supabase Data API settings, expose `profiles`, `therapist_patients`, `plans`, `references`, and `sessions` if your project does not expose new tables automatically.
4. Set env vars in `.env.local` locally and in Vercel Project Settings when deployed:
   - `EXPO_PUBLIC_SUPABASE_URL` or `REACT_APP_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_KEY` or `REACT_APP_SUPABASE_PUBLISHABLE_KEY`
   - server-only `SUPABASE_SERVICE_ROLE_KEY` for admin-backed auth/profile upserts and patient linking
   - If `SUPABASE_SERVICE_ROLE_KEY` is omitted, Supabase may require email verification before first sign-in; the app will show a verification-email message after register.
5. Patient app production builds need `EXPO_PUBLIC_API_BASE=<your deployed Express API URL>`. Demo/mock mode is local/dev only unless `EXPO_PUBLIC_ENABLE_DEMO=true` is set intentionally.

### Vercel deploy
Use `Therapist/` as the Vercel project root. The project uses `vercel.json` to route API endpoints (`/auth/*`, `/patients`, `/patients/link`, `/plans`, `/references`, `/sessions`, `/health`) to the Express function in `api/index.js`, while static files stay served from the project root.

```bash
npm run vercel:dev
npm run vercel:deploy
npm run vercel:deploy:prod
```

---

## Screens
| Screen | File | What it does |
|---|---|---|
| Landing | `index.html` | Entry |
| **Setup** | `therapist/capture.html` | Capture a reference pose or record one-rep motion trajectory, live 12-joint table, validate, add to a patient's plan |
| **Plan Builder (HEP)** | `therapist/plan.html` | Per-patient Home Exercise Program: pick exercises, reps/sets/hold, schedule, notes |
| **Data Recorder** | `therapist/record.html` | Record `angles[12]+delta[12]` CSV for the ML Form Scorer experiment |
| **Dashboard** | `therapist/dashboard.html` | Patient list, KPIs, form-score trend, recent sessions, on-device session summary |

Floating top-right nav jumps between screens; the globe toggles TH/EN (persisted).

---

## Auth & data
- **Therapist login** — `shared/core/{auth-ui,auth,api}.js`: login/register against the local Express API (`/auth/*`), backed by Supabase Auth; JWT stored in `localStorage`.
- **Patient roster** — from Supabase (`GET /patients`) when logged in. It returns only patients linked to the therapist through `therapist_patients`; use `POST /patients/link` with patient email/id to create that link. Demo roster is limited to local/dev demo mode; production API errors are shown instead of replaced with sample patients.
- **Plans / references / sessions** — sync through the Express API to Supabase tables (`plans`, `references`, `sessions`). For real therapist accounts, Plan/Capture load the selected patient's plan/references from cloud first, then keep `localStorage` as a browser cache. References can include a recorded one-rep angle trajectory (`referenceSequence`) for real-time path scoring. Plan and reference saves must reach the cloud before showing success.
- Backend health: `/health`.

---

## Structure
```
Therapist/
├── index.html
├── therapist/   capture.html · plan.html · record.html · dashboard.html
└── shared/
    ├── core/    api · auth · auth-ui · patients · store · exercises · i18n · icons · ui
    ├── ai/      PoseDetection (vendored BlazePose) · JointAngleCalculator · PoseComparator
    │            · ClinicalRuleEngine · SessionAnalytics · SyntheticPose · summary · LlmSummary
    │            · BoundaryBoxGate · MultiJointMotion
    │            · ThaiTtsEngine (Web Speech; available, not currently wired to a screen)
    ├── assets/  theme.css · logos · icons
    ├── vendor/  MediaPipe Tasks-Vision + WASM (vendored → offline)
    └── models/  pose_landmarker_lite.task · pose_landmarker_full.task
```

---

## AI pipeline (rule-based · AI-Flow-5)
33 landmarks (BlazePose) → 12 joint angles (`atan2`, including virtual back/neck ROM) → **rule-based** per-joint comparator (15°, elbows/back/neck 12°) → score + per-joint deltas → feedback cue → visual / Web-Speech TTS.

A RandomForest form-scorer was trained as a **comparison baseline** (rule-based 0.994 vs RF 0.735 person-wise, due to rule-generated labels) — **rule-based is the shipped scorer**. Model + trainer + datasets live in `../../AI_Models/ML Form Scorer/` (see `ClaudeHandoff.md` Pending #5).

---

## Offline & privacy
MediaPipe engine + WASM + pose models are vendored under `shared/vendor` + `shared/models` → after first load, detection runs with no network. No video leaves the device; only numeric angles / session data are stored.

---

## Notes
- Vanilla JS + ES modules — no build/bundler.
- **TTS** here = **Web Speech API** (`shared/ai/ThaiTtsEngine.js`), the browser analog of the Patient app's `expo-speech`. The patient (RN) app speaks Thai cues live; this web engine is available but not currently wired into a therapist screen.
- The old `patient/*.html` mobile mirror (home / practice / audio / visual) was **removed** — the patient experience now lives in the React-Native `App/Patient` app.
