// PhysioAI · Version-1 — Exercise Recognition (plan S2: "Custom AI · Classifier").
//
// Given the patient's live joint angles, guess WHICH prescribed exercise they
// are performing. Implemented as nearest-reference matching — a k-NN classifier
// with k=1 over reference poses, using mean absolute angle distance (degrees) in
// the 10-joint angle space. No ML, no training, no network: it is fully
// explainable (the distance and per-joint diffs are inspectable) and runs the
// same on-device as the rest of the pipeline.
//
// Each candidate's target pose comes from its captured reference (preferred);
// when no reference exists we synthesise one from the exercise definition so the
// classifier still has something to compare against.

import { jointAngleCalculator, JOINT_SPECS } from './JointAngleCalculator.js';
import { makePose } from './SyntheticPose.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Joint names in the engine's canonical order.
const JOINT_KEYS = JOINT_SPECS.map((s) => s.joint);

/** Synthesise a target angle map from an exercise definition (fallback when no reference). */
function targetFromExercise(ex) {
  return jointAngleCalculator(makePose(ex.primaryJoint, ex.target));
}

/**
 * Mean absolute angle difference over joints present (non-null) in BOTH maps.
 * @returns {{distance:number|null, overlap:number}} distance in degrees; null if no shared joints.
 */
function angleDistance(liveAngles, targetAngles) {
  let total = 0, n = 0;
  for (const j of JOINT_KEYS) {
    const live = liveAngles ? liveAngles[j] : null;
    const target = targetAngles ? targetAngles[j] : null;
    if (live != null && target != null) {
      total += Math.abs(live - target);
      n++;
    }
  }
  return { distance: n === 0 ? null : total / n, overlap: n };
}

/**
 * Recognise which prescribed exercise the live pose matches (k-NN, k=1).
 *
 * @param {Object} liveAngles    {joint:deg|null} from jointAngleCalculator().
 * @param {Object} referencesMap { [exerciseId]: reference } — reference.jointAngles is {joint:deg|null}.
 * @param {Array}  exercises     exercise objects (used to synthesise targets when no reference exists).
 * @returns {{exerciseId:string, conf:number, distance:number}|null}
 *   `conf` 0..1 = clamp(1 − distance/90) for the best match, nudged up by its margin
 *   over the runner-up (a clearly-separated winner reads as more confident).
 *   Returns null when liveAngles has no usable joints or no candidate overlaps.
 */
export function recognizeExercise(liveAngles, referencesMap = {}, exercises = []) {
  // Bail early if the live pose has no usable joint angles.
  const hasLive = liveAngles && JOINT_KEYS.some((j) => liveAngles[j] != null);
  if (!hasLive || !Array.isArray(exercises) || exercises.length === 0) return null;

  const scored = [];
  for (const ex of exercises) {
    if (!ex || !ex.id) continue;
    const ref = referencesMap[ex.id];
    const target = (ref && ref.jointAngles) ? ref.jointAngles : targetFromExercise(ex);
    const { distance, overlap } = angleDistance(liveAngles, target);
    if (distance == null || overlap === 0) continue;
    scored.push({ exerciseId: ex.id, distance });
  }
  if (scored.length === 0) return null;

  // k=1: pick the nearest reference pose.
  scored.sort((a, b) => a.distance - b.distance);
  const best = scored[0];
  const second = scored[1];

  // Base confidence shrinks with distance (0° → 1.0, 90°+ → 0.0).
  let conf = clamp01(1 - best.distance / 90);
  // Margin adjustment: a winner well-separated from the runner-up is more trustworthy.
  if (second) {
    const margin = (second.distance - best.distance) / 90; // 0..1-ish
    conf = clamp01(conf * (1 + 0.5 * clamp01(margin)));
  }

  return { exerciseId: best.exerciseId, conf, distance: best.distance };
}
