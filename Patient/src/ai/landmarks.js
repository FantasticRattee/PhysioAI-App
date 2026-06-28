// PhysioAI · Version-2 (React Native) — BlazePose 33-landmark schema.
//
// Extracted so the pure-JS AI logic (angle calc, comparator, gate, synthetic)
// stays free of any native/MediaPipe dependency. The native pose backend
// (react-native-mediapipe) emits landmarks in THIS exact order, matching V1.

export const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];

export const idx = (name) => LANDMARK_NAMES.indexOf(name);
