// PhysioAI · Version-1 — Camera Setup Gate (plan S1 "Custom AI · Classifier").
// Decides good-frame vs needs-adjust BEFORE/DURING practice so the patient frames
// themselves well enough for BlazePose to read all the joints the exercise needs.
//
// Implemented as an EXPLAINABLE heuristic over the 33 landmark visibilities + their
// normalized x/y — NO ML. Inputs: 33 landmarks { x, y, z, visibility } (0..1) and the
// exercise object (for primaryJoint). Pure function: no DOM, no network.

import { idx } from './landmarks.js';

// A landmark counts as visible at/above this confidence.
const VIS_OK = 0.6;
// Match the visible 95% boundary box: 2.5% margin on every side.
const BOUNDARY_MARGIN = 0.025;
const EDGE_X = BOUNDARY_MARGIN, EDGE_Y_TOP = BOUNDARY_MARGIN, EDGE_Y_BOT = 1 - BOUNDARY_MARGIN;

const REGION_KEYS = {
  upper: ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist'],
  lower: ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'],
  shoulder: ['left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow'],
  left_arm: ['left_shoulder', 'left_elbow', 'left_wrist'],
  right_arm: ['right_shoulder', 'right_elbow', 'right_wrist'],
  left_leg: ['left_hip', 'left_knee', 'left_ankle'],
  right_leg: ['right_hip', 'right_knee', 'right_ankle'],
  full: [
    'left_shoulder', 'right_shoulder',
    'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist',
    'left_hip', 'right_hip',
    'left_knee', 'right_knee',
    'left_ankle', 'right_ankle',
  ],
};

// Neighbouring joints brought in alongside a given primary joint, so the limb that
// forms the tracked angle is fully framed (vertex + the two rays it depends on).
const NEIGHBORS = {
  left_elbow:     ['left_shoulder', 'left_wrist'],
  right_elbow:    ['right_shoulder', 'right_wrist'],
  left_shoulder:  ['left_elbow', 'left_hip'],
  right_shoulder: ['right_elbow', 'right_hip'],
  left_hip:       ['left_shoulder', 'left_knee'],
  right_hip:      ['right_shoulder', 'right_knee'],
  left_knee:      ['left_hip', 'left_ankle'],
  right_knee:     ['right_hip', 'right_ankle'],
  left_ankle:     ['left_knee', 'left_foot_index'],
  right_ankle:    ['right_knee', 'right_foot_index'],
  back:           ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_knee', 'right_knee'],
  neck:           ['nose', 'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'],
};

// Short, friendly joint names for hints (bilingual).
const JOINT_TEXT = {
  en: { nose: 'head', left_ear: 'left ear', right_ear: 'right ear', left_shoulder: 'left shoulder', right_shoulder: 'right shoulder', left_hip: 'left hip', right_hip: 'right hip', left_elbow: 'left elbow', right_elbow: 'right elbow', left_wrist: 'left wrist', right_wrist: 'right wrist', left_knee: 'left knee', right_knee: 'right knee', left_ankle: 'left ankle', right_ankle: 'right ankle', left_foot_index: 'left foot', right_foot_index: 'right foot' },
  th: { nose: 'ศีรษะ', left_ear: 'หูซ้าย', right_ear: 'หูขวา', left_shoulder: 'ไหล่ซ้าย', right_shoulder: 'ไหล่ขวา', left_hip: 'สะโพกซ้าย', right_hip: 'สะโพกขวา', left_elbow: 'ศอกซ้าย', right_elbow: 'ศอกขวา', left_wrist: 'ข้อมือซ้าย', right_wrist: 'ข้อมือขวา', left_knee: 'เข่าซ้าย', right_knee: 'เข่าขวา', left_ankle: 'ข้อเท้าซ้าย', right_ankle: 'ข้อเท้าขวา', left_foot_index: 'เท้าซ้าย', right_foot_index: 'เท้าขวา' },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const jointText = (name, lang) => (JOINT_TEXT[lang]?.[name] || JOINT_TEXT.en[name] || name);

const BODY_REGION_ALIASES = {
  whole: 'full',
  whole_body: 'full',
  full_body: 'full',
};

function normalizeRegion(region) {
  const id = BODY_REGION_ALIASES[region] || region;
  return REGION_KEYS[id] ? id : 'full';
}

function inferBodyRegion(primaryJoint) {
  if (!primaryJoint) return 'full';
  if (primaryJoint === 'neck') return 'shoulder';
  if (primaryJoint === 'left_shoulder' || primaryJoint === 'left_elbow') return 'left_arm';
  if (primaryJoint === 'right_shoulder' || primaryJoint === 'right_elbow') return 'right_arm';
  if (primaryJoint.includes('shoulder')) return 'shoulder';
  if (primaryJoint === 'left_hip' || primaryJoint === 'left_knee' || primaryJoint === 'left_ankle') return 'left_leg';
  if (primaryJoint === 'right_hip' || primaryJoint === 'right_knee' || primaryJoint === 'right_ankle') return 'right_leg';
  return 'full';
}

function bodyRegion(exercise) {
  return normalizeRegion(exercise?.bodyRegion || inferBodyRegion(exercise?.primaryJoint));
}

function expectedExitNames(exercise) {
  const joint = exercise?.primaryJoint || '';
  const region = bodyRegion(exercise);
  if (!['upper', 'full', 'shoulder', 'left_arm', 'right_arm'].includes(region)) return new Set();
  if (!joint.includes('shoulder') && !joint.includes('elbow')) return new Set();
  if (joint.startsWith('left_') || region === 'left_arm') return new Set(['left_wrist']);
  if (joint.startsWith('right_') || region === 'right_arm') return new Set(['right_wrist']);
  return new Set(['left_wrist', 'right_wrist']);
}

function isExpectedTopExit(k, name, exercise) {
  return expectedExitNames(exercise).has(name) && k.y < EDGE_Y_TOP;
}

// Unique set of key joint names this exercise needs framed.
function keyJoints(exercise) {
  const region = bodyRegion(exercise);
  const primary = exercise?.primaryJoint;
  const names = primary === 'back' || primary === 'neck' ? [] : [...REGION_KEYS[region]];
  const allowed = new Set(names);
  if (primary === 'back' || primary === 'neck') {
    for (const n of NEIGHBORS[primary]) names.push(n);
  } else if (primary && (region === 'full' || allowed.has(primary))) {
    names.push(primary);
    for (const n of (NEIGHBORS[primary] || [])) {
      if (region === 'full' || allowed.has(n)) names.push(n);
    }
  }
  return [...new Set(names)];
}

/**
 * Evaluate how well the subject is framed for this exercise.
 * @param {Array<{x:number,y:number,z:number,visibility:number}>} landmarks  33 BlazePose landmarks.
 * @param {object} exercise  exercise object (uses .primaryJoint).
 * @returns {{ok:boolean, score:number, hint:string, hintTh:string, missing:string[]}}
 *   score 0..1 framing quality; hint/hintTh are '' when ok; missing lists
 *   key joints below the visibility threshold.
 */
export function evaluateGate(landmarks, exercise) {
  if (!landmarks || !landmarks.length) {
    return { ok: false, score: 0, hint: 'Step into frame', hintTh: 'ขยับเข้าในกรอบ', missing: [] };
  }

  const keys = keyJoints(exercise);

  // 1) Which key joints are adequately visible?
  const missing = [];
  const expectedMissing = expectedExitNames(exercise);
  const blockingMissing = [];
  let visCount = 0;
  for (const name of keys) {
    const k = landmarks[idx(name)];
    if (k && (k.visibility ?? 0) >= VIS_OK) visCount++;
    else {
      missing.push(name);
      if (!expectedMissing.has(name)) blockingMissing.push(name);
    }
  }
  const expectedMissingCount = missing.filter((name) => expectedMissing.has(name)).length;
  const visDenom = Math.max(1, keys.length - expectedMissingCount);
  const visFrac = visCount / visDenom;

  // 2) Edge clipping — any visible key point pinned against the frame edge.
  let clipped = false;
  for (const name of keys) {
    const k = landmarks[idx(name)];
    if (!k || (k.visibility ?? 0) < VIS_OK) continue;
    if (isExpectedTopExit(k, name, exercise)) continue;
    if (k.x < EDGE_X || k.x > (1 - EDGE_X) || k.y < EDGE_Y_TOP || k.y > EDGE_Y_BOT) {
      clipped = true; break;
    }
  }

  // 3) Compose score from visibility and boundary clipping only.
  let score = visFrac;
  if (clipped) score -= 0.25;
  score = clamp01(score);

  const ok = blockingMissing.length === 0 && !clipped;
  if (ok) return { ok: true, score, hint: '', hintTh: '', missing: [] };

  // 4) Hint priority: missing joints → outside boundary.
  let hint = '', hintTh = '';
  if (blockingMissing.length) {
    const en = blockingMissing.map((n) => jointText(n, 'en')).join(', ');
    const th = blockingMissing.map((n) => jointText(n, 'th')).join(', ');
    hint = `Make sure your ${en} are visible`;
    hintTh = `ให้เห็น${th}ในกล้อง`;
  } else if (clipped) {
    hint = 'Move inside the boundary box';
    hintTh = 'ขยับให้อยู่ในกรอบ';
  } else {
    hint = 'Adjust your position';
    hintTh = 'ปรับตำแหน่งของคุณ';
  }

  return { ok: false, score, hint, hintTh, missing };
}
