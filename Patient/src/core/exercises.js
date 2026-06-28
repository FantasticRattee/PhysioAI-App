// PhysioAI · Version-1 — seed exercise library.
// Each exercise targets ONE primary joint angle (one of the engine's tracked joints).
// `target` = peak joint-angle to reach; `rest` = relaxed joint-angle.
// `dir`: 'up' (angle increases to peak) | 'down' (decreases to peak) | 'hold' (static).
// These are sensible defaults; a therapist Capture overrides them with a measured reference.

export const EXERCISES = [
  {
    id: 'shoulder', key: 'shoulder', icon: 'body', accent: '#7BA88F',
    primaryJoint: 'right_shoulder', bodyRegion: 'right_arm', dir: 'up',
    target: 158, rest: 22, tol: 15,
    reps: 12, sets: 3, holdSec: 1.5, type: 'rep',
  },
  {
    id: 'knee', key: 'knee', icon: 'body', accent: '#7BA88F',
    primaryJoint: 'right_knee', bodyRegion: 'right_leg', dir: 'up',
    target: 172, rest: 92, tol: 15,
    reps: 15, sets: 2, holdSec: 1.0, type: 'rep',
  },
  {
    id: 'hip', key: 'hip', icon: 'body', accent: '#7BA88F',
    primaryJoint: 'right_hip', bodyRegion: 'right_leg', dir: 'down',
    target: 148, rest: 176, tol: 15,
    reps: 12, sets: 2, holdSec: 1.0, type: 'rep',
  },
  {
    id: 'squat', key: 'squat', icon: 'body', accent: '#7BA88F',
    primaryJoint: 'right_knee', bodyRegion: 'full', dir: 'down',
    target: 96, rest: 170, tol: 15,
    reps: 10, sets: 3, holdSec: 1.0, type: 'rep',
  },
  {
    id: 'balance', key: 'balance', icon: 'body', accent: '#7BA88F',
    primaryJoint: 'right_knee', bodyRegion: 'right_leg', dir: 'hold',
    target: 70, rest: 70, tol: 18,
    reps: 1, sets: 2, holdSec: 20, type: 'hold',
  },
  {
    id: 'rom_left_shoulder', key: 'rom_left_shoulder', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'left_shoulder', bodyRegion: 'left_arm', dir: 'up',
    target: 158, rest: 22, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
  {
    id: 'rom_right_shoulder', key: 'rom_right_shoulder', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'right_shoulder', bodyRegion: 'right_arm', dir: 'up',
    target: 158, rest: 22, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
  {
    id: 'rom_left_elbow', key: 'rom_left_elbow', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'left_elbow', bodyRegion: 'left_arm', dir: 'up',
    target: 170, rest: 65, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
  {
    id: 'rom_right_elbow', key: 'rom_right_elbow', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'right_elbow', bodyRegion: 'right_arm', dir: 'up',
    target: 170, rest: 65, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
  {
    id: 'rom_left_hip', key: 'rom_left_hip', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'left_hip', bodyRegion: 'left_leg', dir: 'down',
    target: 148, rest: 176, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
  {
    id: 'rom_right_hip', key: 'rom_right_hip', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'right_hip', bodyRegion: 'right_leg', dir: 'down',
    target: 148, rest: 176, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
  {
    id: 'rom_left_knee', key: 'rom_left_knee', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'left_knee', bodyRegion: 'left_leg', dir: 'up',
    target: 172, rest: 95, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
  {
    id: 'rom_right_knee', key: 'rom_right_knee', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'right_knee', bodyRegion: 'right_leg', dir: 'up',
    target: 172, rest: 95, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
  {
    id: 'rom_back', key: 'rom_back', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'back', bodyRegion: 'full', dir: 'down',
    target: 135, rest: 176, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
  {
    id: 'rom_neck', key: 'rom_neck', category: 'health_rom', icon: 'body', accent: '#4F8FD9',
    primaryJoint: 'neck', bodyRegion: 'upper', dir: 'down',
    target: 145, rest: 176, tol: 12,
    reps: 5, sets: 1, holdSec: 1.0, type: 'rep', movementPattern: 'unilateral',
  },
];

// The seed library = built-in popular exercises (used for demo + patient-selectable
// "extras"). Therapist-captured custom exercises will carry source:'custom' and are
// plan-only (never shown to patients as free extras).
for (const e of EXERCISES) e.source = e.source || 'builtin';
export const isBuiltin = (ex) => (ex?.source ?? 'builtin') === 'builtin';

export const BODY_REGIONS = [
  { id: 'full', label: 'Whole Body', labelTh: 'ทั้งตัว' },
  { id: 'upper', label: 'Upper Body', labelTh: 'ส่วนบน' },
  { id: 'lower', label: 'Lower Body', labelTh: 'ส่วนล่าง' },
  { id: 'shoulder', label: 'Shoulder', labelTh: 'ไหล่' },
  { id: 'left_arm', label: 'Left Arm', labelTh: 'แขนซ้าย' },
  { id: 'right_arm', label: 'Right Arm', labelTh: 'แขนขวา' },
  { id: 'left_leg', label: 'Left Leg', labelTh: 'ขาซ้าย' },
  { id: 'right_leg', label: 'Right Leg', labelTh: 'ขาขวา' },
];

const BODY_REGION_ALIASES = {
  whole: 'full',
  whole_body: 'full',
  full_body: 'full',
};

export function normalizeBodyRegionId(bodyRegion = 'full') {
  const id = BODY_REGION_ALIASES[bodyRegion] || bodyRegion;
  return BODY_REGIONS.some((r) => r.id === id) ? id : 'full';
}

export function defaultPrimaryJoint(bodyRegion = 'full') {
  const region = normalizeBodyRegionId(bodyRegion);
  if (region === 'upper' || region === 'shoulder' || region === 'right_arm') return 'right_shoulder';
  if (region === 'left_arm') return 'left_shoulder';
  if (region === 'lower' || region === 'right_leg') return 'right_knee';
  if (region === 'left_leg') return 'left_knee';
  return 'right_knee';
}

export function inferBodyRegion(primaryJoint) {
  if (!primaryJoint) return 'full';
  if (primaryJoint === 'neck') return 'shoulder';
  if (primaryJoint === 'left_shoulder' || primaryJoint === 'left_elbow') return 'left_arm';
  if (primaryJoint === 'right_shoulder' || primaryJoint === 'right_elbow') return 'right_arm';
  if (primaryJoint.includes('shoulder')) return 'shoulder';
  if (primaryJoint === 'left_hip' || primaryJoint === 'left_knee' || primaryJoint === 'left_ankle') return 'left_leg';
  if (primaryJoint === 'right_hip' || primaryJoint === 'right_knee' || primaryJoint === 'right_ankle') return 'right_leg';
  return 'full';
}
export function getBodyRegion(ex) {
  return ex?.bodyRegion ? normalizeBodyRegionId(ex.bodyRegion) : inferBodyRegion(ex?.primaryJoint);
}

export function normalizeExerciseSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  const known = EXERCISES.find((e) => e.id === raw.id);
  if (known && raw.source !== 'custom') return known;
  const bodyRegion = raw.bodyRegion
    ? normalizeBodyRegionId(raw.bodyRegion)
    : inferBodyRegion(raw.primaryJoint);
  const primaryJoint = raw.dominantJoint || raw.primaryJoint || defaultPrimaryJoint(bodyRegion);
  const hold = raw.type === 'hold';
  return {
    id: raw.id,
    key: raw.key || raw.id,
    source: raw.source || 'custom',
    icon: raw.icon || 'body',
    accent: raw.accent || '#7BA88F',
    category: raw.category,
    label: raw.label || raw.labelTh || raw.id,
    labelTh: raw.labelTh || raw.label || raw.id,
    primaryJoint,
    dominantJoint: raw.dominantJoint || primaryJoint,
    bodyRegion,
    type: hold ? 'hold' : 'rep',
    dir: raw.dir || (hold ? 'hold' : 'up'),
    target: Number.isFinite(raw.target) ? raw.target : (hold ? 90 : 120),
    rest: Number.isFinite(raw.rest) ? raw.rest : (hold ? 90 : 30),
    tol: Number.isFinite(raw.tol) ? raw.tol : (primaryJoint.includes('elbow') || primaryJoint === 'back' || primaryJoint === 'neck' ? 12 : 15),
    reps: Number.isFinite(raw.reps) ? raw.reps : 10,
    sets: Number.isFinite(raw.sets) ? raw.sets : 3,
    holdSec: Number.isFinite(raw.holdSec) ? raw.holdSec : (hold ? 10 : 1.5),
    repMode: raw.repMode,
    movementPattern: raw.movementPattern,
    alternatingSides: raw.alternatingSides,
    countMode: raw.countMode,
    repJoints: raw.repJoints,
    primaryJoints: raw.primaryJoints,
    requestedRepJoints: raw.requestedRepJoints,
    jointMotion: raw.jointMotion,
    sideMotions: raw.sideMotions,
    jointAngles: raw.jointAngles,
    restJointAngles: raw.restJointAngles,
    targetJointAngles: raw.targetJointAngles,
    targetJointAnglesBySide: raw.targetJointAnglesBySide,
    landmarks: raw.landmarks,
    restLandmarks: raw.restLandmarks,
    targetLandmarks: raw.targetLandmarks,
    targetLandmarksBySide: raw.targetLandmarksBySide,
    returnRestJointAngles: raw.returnRestJointAngles,
    returnRestLandmarks: raw.returnRestLandmarks,
    referenceSequence: raw.referenceSequence,
  };
}

export function findExercise(id, custom = []) {
  const builtIn = EXERCISES.find((e) => e.id === id);
  if (builtIn) return builtIn;
  for (const raw of custom) {
    const ex = normalizeExerciseSnapshot(raw);
    if (ex?.id === id) return ex;
  }
  return null;
}

export function getExercise(id, custom = []) {
  return findExercise(id, custom) || EXERCISES[0];
}

export const exerciseExists = (id, custom = []) => !!findExercise(id, custom);

// Range of motion magnitude, used by the rep state-machine for hysteresis thresholds.
export function romRange(ex) {
  return Math.max(20, Math.abs(ex.target - ex.rest));
}
