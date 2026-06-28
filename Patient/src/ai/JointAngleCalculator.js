// PhysioAI · Version-1 — Joint Angle Calculator (diagram node P1.3 / P2.3).
//
// Algorithm (math, not AI). Converts BlazePose's 33 landmarks into 12 joint
// angles via 2D inverse-trigonometry (atan2), so poses can be compared fairly
// across body sizes and camera distances. Owns JOINT_SPECS — the canonical
// definition of the tracked joints (vertex + the two rays it spans).

import { idx } from './landmarks.js';

const MIN_VIS = 0.5;

// ─── The tracked joints (vertex b, with rays b→a and b→c) ─
export const JOINT_SPECS = [
  { joint: 'left_elbow',     a: 'left_shoulder',  b: 'left_elbow',     c: 'left_wrist',       label: 'L. elbow',    labelTh: 'ศอกซ้าย' },
  { joint: 'right_elbow',    a: 'right_shoulder', b: 'right_elbow',    c: 'right_wrist',      label: 'R. elbow',    labelTh: 'ศอกขวา' },
  { joint: 'left_shoulder',  a: 'left_elbow',     b: 'left_shoulder',  c: 'left_hip',         label: 'L. shoulder', labelTh: 'ไหล่ซ้าย' },
  { joint: 'right_shoulder', a: 'right_elbow',    b: 'right_shoulder', c: 'right_hip',        label: 'R. shoulder', labelTh: 'ไหล่ขวา' },
  { joint: 'left_hip',       a: 'left_shoulder',  b: 'left_hip',       c: 'left_knee',        label: 'L. hip',      labelTh: 'สะโพกซ้าย' },
  { joint: 'right_hip',      a: 'right_shoulder', b: 'right_hip',      c: 'right_knee',       label: 'R. hip',      labelTh: 'สะโพกขวา' },
  { joint: 'left_knee',      a: 'left_hip',       b: 'left_knee',      c: 'left_ankle',       label: 'L. knee',     labelTh: 'เข่าซ้าย' },
  { joint: 'right_knee',     a: 'right_hip',      b: 'right_knee',      c: 'right_ankle',      label: 'R. knee',     labelTh: 'เข่าขวา' },
  { joint: 'left_ankle',     a: 'left_knee',      b: 'left_ankle',     c: 'left_foot_index',  label: 'L. ankle',    labelTh: 'ข้อเท้าซ้าย' },
  { joint: 'right_ankle',    a: 'right_knee',     b: 'right_ankle',    c: 'right_foot_index', label: 'R. ankle',    labelTh: 'ข้อเท้าขวา' },
  { joint: 'back',           a: 'mid_shoulder',   b: 'mid_hip',        c: 'mid_knee',         label: 'Back',        labelTh: 'หลัง' },
  { joint: 'neck',           a: 'head_center',    b: 'mid_shoulder',   c: 'mid_hip',          label: 'Neck',        labelTh: 'คอ' },
];

// ─── Joint-angle math (atan2 form) ──────────────────────────
export function angleAt(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;          // 2D cross magnitude
  if ((v1x === 0 && v1y === 0) || (v2x === 0 && v2y === 0)) return null;
  const deg = Math.atan2(Math.abs(cross), dot) * 180 / Math.PI;
  return Number.isFinite(deg) ? deg : null;
}

function rawVisibleKp(landmarks, name) {
  const index = idx(name);
  if (index < 0) return null;
  const k = landmarks[index];
  if (!k) return null;
  if ((k.visibility ?? 1) < MIN_VIS) return null;
  return k;
}

function midpoint(landmarks, aName, bName) {
  const a = rawVisibleKp(landmarks, aName);
  const b = rawVisibleKp(landmarks, bName);
  if (!a || !b) return null;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

function visibleKp(landmarks, name) {
  if (name === 'mid_shoulder') return midpoint(landmarks, 'left_shoulder', 'right_shoulder');
  if (name === 'mid_hip') return midpoint(landmarks, 'left_hip', 'right_hip');
  if (name === 'mid_knee') return midpoint(landmarks, 'left_knee', 'right_knee');
  if (name === 'head_center') return midpoint(landmarks, 'left_ear', 'right_ear') || rawVisibleKp(landmarks, 'nose');
  return rawVisibleKp(landmarks, name);
}

function fallbackKp(landmarks, spec, role, vertex) {
  if (!vertex || role !== 'c') return null;
  if (spec.joint === 'left_shoulder' || spec.joint === 'right_shoulder') {
    return { x: vertex.x, y: vertex.y + 0.25, z: vertex.z ?? 0, visibility: 1 };
  }
  return null;
}

/** 33 landmarks → { jointName: degrees | null } for all tracked joints. */
export function jointAngleCalculator(landmarks) {
  const out = {};
  for (const s of JOINT_SPECS) {
    const a = visibleKp(landmarks, s.a);
    const b = visibleKp(landmarks, s.b);
    const c = visibleKp(landmarks, s.c) || fallbackKp(landmarks, s, 'c', b);
    out[s.joint] = (a && b && c) ? angleAt(a, b, c) : null;
  }
  return out;
}
