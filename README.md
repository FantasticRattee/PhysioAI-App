# PhysioAI

ระบบกายภาพบำบัดอัจฉริยะสำหรับผู้พิการทางร่างกาย — AI physiotherapy for physically-disabled people. On-device pose analysis (MediaPipe BlazePose), a Patient mobile app, a Therapist web console, and a shared API backed by Supabase.

## Structure

```
App-V3/
├── backend/     API service — Express + Supabase (Auth + Postgres + RLS).
│                Shared by BOTH apps. Also serves the Therapist web on a Node host.
│                  server.js · api/index.js (Vercel fn) · supabase/ (migrations) · vercel.json
├── Patient/     Mobile app — Expo / React Native. On-device MediaPipe pose pipeline.
├── Therapist/   Web console (static) — vanilla-JS ES modules. capture / plan / dashboard.
│                  index.html · therapist/ · shared/ (shared/ai = pose engine)
├── HANDOVER.md
└── Theme.md
```

> The API used to live inside `Therapist/`; it was extracted to `backend/` so the shared
> service is obvious and the Therapist folder is pure front-end.

## Run locally

**Backend + Therapist web (one Node process):**
```bash
cd backend
cp .env.example .env.local        # fill in Supabase URL + keys
npm install
npm start                         # serves the API + the Therapist web on :3000
# open http://localhost:3000/therapist/dashboard.html
```
The Node server serves `../Therapist` with a MediaPipe-WASM-friendly CSP, so the pose model loads.

**Patient mobile (Expo):**
```bash
cd Patient
cp .env.example .env              # set EXPO_PUBLIC_API_BASE to the backend URL
npm install
npx expo run:ios --device         # or: npx expo start --dev-client
```

## Database (Supabase)

```bash
cd backend
npm run supabase:link             # links to your Supabase project
npm run supabase:push             # applies supabase/migrations (schema + RLS + therapist_patients)
```
Requires `SUPABASE_SERVICE_ROLE_KEY` for therapist↔patient linking.

## Deploy

The API and the web are now separate folders, so pick one model:

- **Node host (Railway / Render / Fly) — one deploy:** run `node backend/server.js`; it serves the API *and* the Therapist web (`WEB_DIR` overrides the web path). Point `EXPO_PUBLIC_API_BASE` (Patient) and the Therapist `API_BASE` at this URL.
- **Vercel — two deploys:** `backend/` as the serverless API (`backend/vercel.json` → `api/index.js`), and `Therapist/` as a static site (CSP comes from a `vercel.json` in `Therapist/`). Set CORS on the API and point both clients' `API_BASE` at the API URL.

## Env vars (backend)

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — see `backend/.env.example`.
