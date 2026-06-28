# PhysioAI — Patient App (React Native / Expo)

Cross-platform (Android + iOS) rebuild of the V1 patient side. **Round 1 = Practice mode**
(Home / exercise list → live practice → session summary). Audio-only & Visual-only modes
come next.

The AI pipeline is the **same logic as V1** (BlazePose 33-landmark schema), ported verbatim —
only the platform layer (pose camera, TTS, storage, UI) is native.

## Architecture (1 file ≈ 1 responsibility)
```
App.js                      navigation root (Home → Practice)
index.js                    Expo entry (registerRootComponent)
src/
├─ ai/                      ← pure-JS AI brain, ported from V1 (unchanged logic)
│   landmarks.js              BlazePose 33-landmark schema
│   JointAngleCalculator.js   landmarks → 10 joint angles (atan2)
│   PoseComparator.js         live vs reference → score + delta[10]
│   FormScorer.js             rule-based 4-class form classifier
│   FeedbackGenerator.js      delta → bilingual cue
│   CameraSetupGate.js        visibility[33] → good / needs-adjust
│   ExerciseRecognition.js    nearest-reference exercise match
│   SyntheticPose.js          demo-mode pose generator (no camera)
├─ core/
│   session.js                per-frame controller (V1 runner's brain, framework-free)
│   exercises.js              exercise library
│   i18n.js                   TH/EN strings (AsyncStorage-backed)
│   store.js                  persistence (AsyncStorage)
│   tts.js                    Thai TTS (expo-speech)
│   theme.js                  design tokens
├─ pose/
│   usePractice.js            React hook: session loop + demo feed + TTS + logging
│   PoseCamera.js             native MediaPipe camera → 33 landmarks (live mode)
├─ components/                Skeleton.js (SVG overlay), ScoreRing.js
└─ screens/                   HomeScreen.js, PracticeScreen.js
```

## Setup
```bash
cd App/Patient
npm install
# align native package versions to your Expo SDK:
npx expo install react-native-svg @react-native-async-storage/async-storage expo-speech \
  react-native-screens react-native-safe-area-context react-native-vision-camera react-native-worklets-core
npm install @react-navigation/native @react-navigation/native-stack react-native-mediapipe
```

To use the Supabase-backed cloud API:
```bash
EXPO_PUBLIC_API_BASE=https://your-physioai-api.example.com npx expo start --dev-client
```
`EXPO_PUBLIC_API_BASE` is required for production builds. Local demo/mock storage is enabled only in development when the API base is blank, or explicitly with `EXPO_PUBLIC_ENABLE_DEMO=true`.

## Run

### A) Demo mode — fastest, no native pose (try Expo Go first)
```bash
EXPO_PUBLIC_ENABLE_DEMO=true npx expo start
```
Open in Expo Go → pick an exercise → **Demo mode**. A synthetic pose drives the *full real
pipeline* (angles → comparator → Form Scorer → feedback → rep counting → TTS), so you can test
the whole flow + UI without a camera or a custom build.

### B) Live on-device pose — needs an Expo *dev build*
`react-native-mediapipe` is a native module → **Expo Go can't run it**. Build a dev client:
```bash
npx expo prebuild
npx expo run:android      # needs Android Studio
npx expo run:ios          # needs Xcode (macOS)
```
Then on the Practice screen choose **Start camera**.

## Enable live pose (finish the native wiring)
`src/pose/PoseCamera.js` targets `react-native-mediapipe ~0.5.x`. If your installed version's
API differs, adjust the two marked spots (the `usePoseDetection` call and `normalizeResults`) —
keep the normalized output as 33 × `{ x, y, z, visibility }` in BlazePose order and everything
downstream works unchanged. Bundle the model asset (`pose_landmarker_lite.task`) per the
react-native-mediapipe docs.

## Notes / honesty
- **Not yet device-verified.** Authored without an Android/iOS simulator available, so the
  **demo-mode flow + AI logic** rest on V1's already-verified pipeline, but the native build
  (camera / permissions / model bundling) must be run + checked on your machine.
- Pinned versions are best-effort — run `npx expo install` to reconcile with your Expo SDK.
- After moving/renaming the project folder, run `cd ios && pod install` so iOS autolinking
  paths point to the current project location.
- References (therapist-captured target poses) are read from the cloud API (`GET /references`)
  for the logged-in patient. When absent, practice falls back to exercise-default target angles
  (same as V1).
- Everything runs **on-device** (pose, scoring, TTS, storage). Nothing is uploaded.
