// PhysioAI · Version-1 — Pose Comparator (diagram node P2.4).
//
// Custom AI · Rule-based. Compares the patient's live joint angles against the
// therapist's reference pose, per joint, using an absolute angle delta + a
// per-joint tolerance. Produces an overall score 0–100 plus per-joint deltas and a
// per-joint status (ok/warn/bad). The "measure" step that feeds the Form Scorer.

import { JOINT_SPECS } from './JointAngleCalculator.js';

export const DEFAULT_TOLERANCE = 15;

// Per-joint tolerance — elbows tighter (clinical), others 15°.
export const JOINT_TOLERANCE = {
  left_elbow: 12, right_elbow: 12,
  left_shoulder: 15, right_shoulder: 15,
  left_hip: 15, right_hip: 15,
  left_knee: 15, right_knee: 15,
  left_ankle: 15, right_ankle: 15,
  back: 12, neck: 12,
};

/**
 * Rule-based Pose Comparator.
 * For each joint: delta = |ref − live|; status by per-joint threshold.
 * Per-joint score = clamp(1 − delta/(tol·3)) so a joint exactly on tolerance
 * still scores well and degrades smoothly. Overall = mean over valid joints.
 *
 * @returns {{score:number|null, joints:Array, primary:Object|null, validCount:number}}
 */
export function poseComparator(refAngles, liveAngles, tolOverride = {}) {
  const joints = [];
  let total = 0, n = 0, worst = null;
  for (const s of JOINT_SPECS) {
    const ref = refAngles ? refAngles[s.joint] : null;
    const live = liveAngles ? liveAngles[s.joint] : null;
    const tol = tolOverride[s.joint] ?? JOINT_TOLERANCE[s.joint] ?? DEFAULT_TOLERANCE;
    const row = { joint: s.joint, label: s.label, labelTh: s.labelTh, ref, live, tol, delta: null, status: 'none', score: null };
    if (ref != null && live != null) {
      const delta = Math.abs(ref - live);
      const score = Math.max(0, 1 - delta / (tol * 3)) * 100;
      row.delta = delta;
      row.score = score;
      row.status = delta <= tol ? 'ok' : delta <= tol * 2 ? 'warn' : 'bad';
      total += score; n++;
      if (!worst || delta / tol > worst.delta / worst.tol) worst = row;
    }
    joints.push(row);
  }
  return {
    score: n === 0 ? null : Math.round(total / n),
    joints,
    primary: worst,
    validCount: n,
  };
}

export function scoreTone(score) {
  if (score == null) return 'none';
  return score >= 75 ? 'good' : score >= 50 ? 'warn' : 'bad';
}
