// PhysioAI · Version-1 — Synthetic Pose Generator (Demo mode — NOT a diagram node).
//
// Builds anatomically-plausible 33 landmarks and rotates the primary limb so the
// Joint Angle Calculator yields a requested angle. This lets the FULL real
// pipeline (angles → comparator → form scorer → feedback → reps) run identically
// whether the input is a webcam or a simulation, so the app is demoable with no
// camera. Pure helper; depends only on the landmark schema.

import { LANDMARK_NAMES } from './landmarks.js';

function neutralPose() {
  // Normalized coords, y grows downward, subject facing camera, centred.
  const P = {
    nose: [0.50, 0.12],
    left_eye_inner: [0.485, 0.11], left_eye: [0.478, 0.11], left_eye_outer: [0.47, 0.11],
    right_eye_inner: [0.515, 0.11], right_eye: [0.522, 0.11], right_eye_outer: [0.53, 0.11],
    left_ear: [0.455, 0.125], right_ear: [0.545, 0.125],
    mouth_left: [0.487, 0.155], mouth_right: [0.513, 0.155],
    left_shoulder: [0.40, 0.27], right_shoulder: [0.60, 0.27],
    left_elbow: [0.365, 0.41], right_elbow: [0.635, 0.41],
    left_wrist: [0.35, 0.54], right_wrist: [0.65, 0.54],
    left_pinky: [0.345, 0.575], right_pinky: [0.655, 0.575],
    left_index: [0.35, 0.58], right_index: [0.65, 0.58],
    left_thumb: [0.36, 0.565], right_thumb: [0.64, 0.565],
    left_hip: [0.44, 0.56], right_hip: [0.56, 0.56],
    left_knee: [0.44, 0.76], right_knee: [0.56, 0.76],
    left_ankle: [0.44, 0.94], right_ankle: [0.56, 0.94],
    left_heel: [0.43, 0.955], right_heel: [0.57, 0.955],
    left_foot_index: [0.465, 0.965], right_foot_index: [0.535, 0.965],
  };
  return P;
}

// Which points move when a given joint angle changes, plus the fixed anchor ray.
const FK = {
  right_shoulder: { vertex: 'right_shoulder', anchor: 'right_hip',     moving: 'right_elbow', chain: ['right_elbow', 'right_wrist', 'right_pinky', 'right_index', 'right_thumb'], sign: -1 },
  left_shoulder:  { vertex: 'left_shoulder',  anchor: 'left_hip',      moving: 'left_elbow',  chain: ['left_elbow', 'left_wrist', 'left_pinky', 'left_index', 'left_thumb'],     sign:  1 },
  right_elbow:    { vertex: 'right_elbow',    anchor: 'right_shoulder', moving: 'right_wrist', chain: ['right_wrist', 'right_pinky', 'right_index', 'right_thumb'],               sign:  1 },
  left_elbow:     { vertex: 'left_elbow',     anchor: 'left_shoulder',  moving: 'left_wrist',  chain: ['left_wrist', 'left_pinky', 'left_index', 'left_thumb'],                   sign: -1 },
  right_hip:      { vertex: 'right_hip',      anchor: 'right_shoulder', moving: 'right_knee',  chain: ['right_knee', 'right_ankle', 'right_heel', 'right_foot_index'],            sign: -1 },
  left_hip:       { vertex: 'left_hip',       anchor: 'left_shoulder',  moving: 'left_knee',   chain: ['left_knee', 'left_ankle', 'left_heel', 'left_foot_index'],                sign:  1 },
  right_knee:     { vertex: 'right_knee',     anchor: 'right_hip',      moving: 'right_ankle', chain: ['right_ankle', 'right_heel', 'right_foot_index'],                          sign:  1 },
  left_knee:      { vertex: 'left_knee',      anchor: 'left_hip',       moving: 'left_ankle',  chain: ['left_ankle', 'left_heel', 'left_foot_index'],                            sign: -1 },
  right_ankle:    { vertex: 'right_ankle',    anchor: 'right_knee',     moving: 'right_foot_index', chain: ['right_foot_index', 'right_heel'],                                   sign:  1 },
  left_ankle:     { vertex: 'left_ankle',     anchor: 'left_knee',      moving: 'left_foot_index',  chain: ['left_foot_index', 'left_heel'],                                     sign: -1 },
};

const UPPER_BODY_CHAIN = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
];
const HEAD_CHAIN = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
];

function rot(px, py, cx, cy, rad) {
  const s = Math.sin(rad), co = Math.cos(rad);
  const dx = px - cx, dy = py - cy;
  return [cx + dx * co - dy * s, cy + dx * s + dy * co];
}

function midpoint(P, a, b) {
  return [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2];
}

function rotateNames(P, names, cx, cy, delta) {
  for (const name of names) {
    const [x, y] = P[name];
    P[name] = rot(x, y, cx, cy, delta);
  }
}

function setVirtualJointAngle(P, primaryJoint, deg) {
  if (primaryJoint === 'back') {
    const [hx, hy] = midpoint(P, 'left_hip', 'right_hip');
    const [kx, ky] = midpoint(P, 'left_knee', 'right_knee');
    const [sx, sy] = midpoint(P, 'left_shoulder', 'right_shoulder');
    const lowerAng = Math.atan2(ky - hy, kx - hx);
    const currentAng = Math.atan2(sy - hy, sx - hx);
    const desiredAng = lowerAng - deg * Math.PI / 180;
    rotateNames(P, UPPER_BODY_CHAIN, hx, hy, desiredAng - currentAng);
    return true;
  }
  if (primaryJoint === 'neck') {
    const [sx, sy] = midpoint(P, 'left_shoulder', 'right_shoulder');
    const [hx, hy] = midpoint(P, 'left_hip', 'right_hip');
    const [ex, ey] = midpoint(P, 'left_ear', 'right_ear');
    const trunkAng = Math.atan2(hy - sy, hx - sx);
    const currentAng = Math.atan2(ey - sy, ex - sx);
    const desiredAng = trunkAng - deg * Math.PI / 180;
    rotateNames(P, HEAD_CHAIN, sx, sy, desiredAng - currentAng);
    return true;
  }
  return false;
}

/** Build 33 landmarks with `primaryJoint` set to `deg`. */
export function makePose(primaryJoint, deg, jitter = 0) {
  const P = neutralPose();
  const cfg = FK[primaryJoint];
  if (setVirtualJointAngle(P, primaryJoint, deg)) {
    // Virtual ROM joints are produced from midpoints rather than one named landmark.
  } else if (cfg) {
    const [vx, vy] = P[cfg.vertex];
    const [ax, ay] = P[cfg.anchor];
    const anchorAng = Math.atan2(ay - vy, ax - vx);              // direction vertex→anchor
    const desired = anchorAng + cfg.sign * (deg * Math.PI / 180); // desired vertex→moving dir
    const [mx, my] = P[cfg.moving];
    const curAng = Math.atan2(my - vy, mx - vx);
    const delta = desired - curAng;
    for (const name of cfg.chain) {
      const [x, y] = P[name];
      P[name] = rot(x, y, vx, vy, delta);
    }
  }
  // Convert to landmark objects (33), in spec order, with optional jitter.
  return LANDMARK_NAMES.map((name) => {
    const [x, y] = P[name];
    const j = jitter ? (Math.sin((x + y) * 97.13 + jitter) * 0.0015) : 0;
    return { x: x + j, y: y + j, z: 0, visibility: 1 };
  });
}

/**
 * Drive a demo session: returns a function(t) → landmarks animating the
 * exercise's primary joint between rest and target (sine), for type 'rep',
 * or holding near target with small drift, for type 'hold'.
 */
export function makeSyntheticFeed(exercise, periodSec = 4) {
  const { primaryJoint, rest, target, type } = exercise;
  return function feed(elapsedSec) {
    let phase;
    if (type === 'hold') {
      phase = 0.82 + 0.12 * Math.sin(elapsedSec * 1.3); // hover near target with sway
    } else {
      phase = 0.5 - 0.5 * Math.cos((elapsedSec % periodSec) / periodSec * Math.PI * 2);
    }
    const deg = rest + (target - rest) * phase;
    return { landmarks: makePose(primaryJoint, deg, elapsedSec * 2), phase, deg };
  };
}
