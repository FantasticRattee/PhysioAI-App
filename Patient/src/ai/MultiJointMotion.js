// PhysioAI · Multi-joint motion model.
// Builds rest→target joint motion metadata and scores live transition quality.

import { idx } from './landmarks.js';

const CANDIDATE_JOINTS = {
  upper: ['neck', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow'],
  lower: ['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'],
  shoulder: ['neck', 'left_shoulder', 'right_shoulder'],
  left_arm: ['left_shoulder', 'left_elbow'],
  right_arm: ['right_shoulder', 'right_elbow'],
  left_leg: ['left_hip', 'left_knee', 'left_ankle'],
  right_leg: ['right_hip', 'right_knee', 'right_ankle'],
  full: [
    'back', 'neck',
    'left_shoulder', 'right_shoulder',
    'left_elbow', 'right_elbow',
    'left_hip', 'right_hip',
    'left_knee', 'right_knee',
    'left_ankle', 'right_ankle',
  ],
};

const BODY_REGION_ALIASES = {
  whole: 'full',
  whole_body: 'full',
  full_body: 'full',
};

const MIN_RANGE_DEG = 15;
const KEEP_RATIO = 0.45;
const MAX_REP_JOINTS = 4;
const DEFAULT_ALTERNATING_SIDES = ['left', 'right'];
const PATH_POINT_BY_JOINT = {
  left_shoulder: 'left_wrist',
  right_shoulder: 'right_wrist',
  left_elbow: 'left_wrist',
  right_elbow: 'right_wrist',
  left_hip: 'left_hip',
  right_hip: 'right_hip',
  left_knee: 'left_knee',
  right_knee: 'right_knee',
  left_ankle: 'left_ankle',
  right_ankle: 'right_ankle',
  back: 'mid_shoulder',
  neck: 'nose',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function effectiveRange(motion) {
  return Math.max(
    Number.isFinite(motion?.range) ? motion.range : 0,
    Number.isFinite(motion?.trajectoryRange) ? motion.trajectoryRange : 0,
    Number.isFinite(motion?.target) && Number.isFinite(motion?.rest) ? Math.abs(motion.target - motion.rest) : 0,
  );
}

function contributesToProgress(motion) {
  if (typeof motion?.contributesToProgress === 'boolean') return motion.contributesToProgress;
  if (motion?.role === 'reference_pattern') return false;
  return effectiveRange(motion) >= MIN_RANGE_DEG;
}

function scoreDecline(value, okAt, badAt) {
  if (!Number.isFinite(value)) return 100;
  if (value <= okAt) return 100;
  if (value >= badAt) return 0;
  return Math.round(100 * (1 - ((value - okAt) / (badAt - okAt))));
}

function sideOf(joint) {
  if (joint?.startsWith('left_')) return 'left';
  if (joint?.startsWith('right_')) return 'right';
  return null;
}

function jointKind(joint) {
  return joint?.replace(/^(left|right)_/, '') || '';
}

function inferMovementPattern(repJoints, explicit) {
  if (explicit) return explicit;
  return bilateralPairs(repJoints).length ? 'bilateralSync' : 'unilateral';
}

function bilateralPairs(joints = []) {
  const set = new Set(joints);
  const out = [];
  for (const joint of joints) {
    if (sideOf(joint) !== 'left') continue;
    const right = `right_${jointKind(joint)}`;
    if (set.has(right)) out.push([joint, right]);
  }
  return out;
}

export function candidateJoints(bodyRegion = 'full') {
  const region = BODY_REGION_ALIASES[bodyRegion] || bodyRegion;
  return CANDIDATE_JOINTS[region] || CANDIDATE_JOINTS.full;
}

export function selectRepJoints(restAngles, targetAngles, bodyRegion = 'full') {
  const motions = candidateJoints(bodyRegion)
    .map((joint) => {
      const rest = restAngles?.[joint];
      const target = targetAngles?.[joint];
      const range = Math.abs((target ?? NaN) - (rest ?? NaN));
      return { joint, rest, target, range };
    })
    .filter((m) => Number.isFinite(m.rest) && Number.isFinite(m.target) && m.range >= MIN_RANGE_DEG)
    .sort((a, b) => b.range - a.range);

  const maxRange = motions[0]?.range || 0;
  const selected = motions
    .filter((m) => m.range >= Math.max(MIN_RANGE_DEG, maxRange * KEEP_RATIO))
    .slice(0, MAX_REP_JOINTS);

  return { repJoints: selected.map((m) => m.joint), motions, dominantJoint: selected[0]?.joint || null };
}

export function buildMotionConfig({ exercise, reference }) {
  const region = reference?.bodyRegion || exercise?.bodyRegion || 'full';
  const refMotion = reference?.jointMotion || exercise?.jointMotion || null;
  const repJoints = reference?.repJoints || exercise?.repJoints || (refMotion ? Object.keys(refMotion) : null);
  const dominantJoint = reference?.dominantJoint || exercise?.dominantJoint || reference?.primaryJoint || exercise?.primaryJoint;

  if (repJoints?.length && refMotion) {
    const weights = normalizeWeights(repJoints.map((joint) => refMotion[joint]?.weight ?? refMotion[joint]?.range ?? 1));
    const movementPattern = inferMovementPattern(repJoints, reference?.movementPattern || exercise?.movementPattern);
    return {
      repMode: reference?.repMode || exercise?.repMode || (repJoints.length > 1 ? 'multi' : 'single'),
      movementPattern,
      alternatingSides: reference?.alternatingSides || exercise?.alternatingSides || DEFAULT_ALTERNATING_SIDES,
      countMode: reference?.countMode || exercise?.countMode || 'per_side',
      bodyRegion: region,
      repJoints,
      primaryJoints: reference?.primaryJoints || exercise?.primaryJoints || repJoints,
      dominantJoint,
      jointMotion: refMotion,
      sideMotions: reference?.sideMotions || exercise?.sideMotions || null,
      referenceSequence: reference?.referenceSequence || exercise?.referenceSequence || null,
      weights,
      targetJointAnglesBySide: reference?.targetJointAnglesBySide || exercise?.targetJointAnglesBySide || null,
      restLandmarks: reference?.restLandmarks || exercise?.restLandmarks || null,
      targetLandmarks: reference?.targetLandmarks || reference?.landmarks || exercise?.targetLandmarks || null,
      targetLandmarksBySide: reference?.targetLandmarksBySide || exercise?.targetLandmarksBySide || null,
    };
  }

  const joint = dominantJoint || 'right_shoulder';
  const rest = reference?.plan?.restAngle ?? exercise?.rest ?? 0;
  const target = reference?.plan?.targetAngle ?? exercise?.target ?? rest;
  return {
    repMode: 'single',
    movementPattern: 'unilateral',
    alternatingSides: DEFAULT_ALTERNATING_SIDES,
    countMode: 'per_side',
    bodyRegion: region,
    repJoints: [joint],
    primaryJoints: [joint],
    dominantJoint: joint,
    jointMotion: {
      [joint]: { rest, target, range: Math.abs(target - rest), dir: target >= rest ? 'up' : 'down', tol: exercise?.tol ?? 15, weight: 1 },
    },
    weights: [1],
    referenceSequence: reference?.referenceSequence || exercise?.referenceSequence || null,
    restLandmarks: reference?.restLandmarks || null,
    targetLandmarks: reference?.targetLandmarks || reference?.landmarks || null,
  };
}

function normalizeWeights(values) {
  const sum = values.reduce((a, b) => a + (Number.isFinite(b) ? Math.max(0, b) : 0), 0) || 1;
  return values.map((v) => (Number.isFinite(v) ? Math.max(0, v) / sum : 0));
}

function progressForJoint(angle, motion) {
  const denom = motion.target - motion.rest;
  if (!Number.isFinite(angle) || Math.abs(denom) < 1e-6) return null;
  return (angle - motion.rest) / denom;
}

function rawPoint(landmarks, name) {
  const index = idx(name);
  if (index < 0) return null;
  const p = landmarks?.[index];
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return p;
}

function midpoint(landmarks, aName, bName) {
  const a = rawPoint(landmarks, aName);
  const b = rawPoint(landmarks, bName);
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
}

function pointFor(landmarks, joint) {
  const name = PATH_POINT_BY_JOINT[joint] || joint;
  if (name === 'mid_shoulder') return midpoint(landmarks, 'left_shoulder', 'right_shoulder');
  if (name === 'mid_hip') return midpoint(landmarks, 'left_hip', 'right_hip');
  if (name === 'mid_knee') return midpoint(landmarks, 'left_knee', 'right_knee');
  return rawPoint(landmarks, name);
}

function pointSegmentDistance(p, a, b) {
  if (!p || !a || !b) return null;
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-8) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / len2, 0, 1);
  const x = a.x + vx * t;
  const y = a.y + vy * t;
  const dist = Math.hypot(p.x - x, p.y - y);
  return dist / Math.max(Math.sqrt(len2), 1e-4);
}

function targetLandmarksFor(config, side = null) {
  if (side && config?.targetLandmarksBySide?.[side]) return config.targetLandmarksBySide[side];
  return config?.targetLandmarks;
}

function trajectoryFrames(sequence, phase = null) {
  const frames = Array.isArray(sequence?.frames) ? sequence.frames : [];
  const targetMs = Number(sequence?.phases?.targetMs ?? sequence?.targetAtMs);
  const phaseFrames = Number.isFinite(targetMs) && (phase === 'outbound' || phase === 'return')
    ? frames.filter((frame) => phase === 'outbound'
      ? (Number(frame?.t) || 0) <= targetMs
      : (Number(frame?.t) || 0) >= targetMs)
    : frames;
  return phaseFrames
    .filter((frame) => Number.isFinite(frame?.p) && frame.angles && typeof frame.angles === 'object')
    .slice()
    .sort((a, b) => a.p - b.p);
}

function interpolateTrajectoryAngles(sequence, progress, joints, phase = null) {
  const frames = trajectoryFrames(sequence, phase);
  if (frames.length < 2 || !Number.isFinite(progress)) return null;
  const p = clamp(progress, 0, 1);
  let prev = frames[0];
  let next = frames[frames.length - 1];
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].p >= p) {
      prev = frames[i - 1];
      next = frames[i];
      break;
    }
  }
  const span = Math.max(1e-6, next.p - prev.p);
  const ratio = clamp((p - prev.p) / span, 0, 1);
  const out = {};
  for (const joint of joints) {
    const a = prev.angles?.[joint];
    const b = next.angles?.[joint];
    if (Number.isFinite(a) && Number.isFinite(b)) out[joint] = a + (b - a) * ratio;
  }
  return Object.keys(out).length ? out : null;
}

function trajectoryAngleDeviation(liveAngles, config, joints, progress, phase = null) {
  const expected = interpolateTrajectoryAngles(config.referenceSequence, progress, joints, phase);
  if (!expected) return null;
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    const live = liveAngles?.[joint];
    const target = expected[joint];
    if (!Number.isFinite(live) || !Number.isFinite(target)) continue;
    const range = Math.max(8, effectiveRange(config.jointMotion?.[joint]));
    const weight = config.weights?.[i] ?? 1 / joints.length;
    sum += (Math.abs(live - target) / range) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? sum / weightSum : null;
}

function evaluateJointSet(liveAngles, landmarks, config, dt, previous, joints, targetLandmarks = null, trajectoryPhase = null) {
  if (!joints.length || !Number.isFinite(dt) || dt <= 0) return null;

  const progresses = [];
  const progressByJoint = {};
  const speeds = [];
  const pathDeviations = [];
  let missingCount = 0;
  let weightedProgress = 0;
  let progressWeightSum = 0;
  let weightedSpeed = 0;
  let weightedAccel = 0;
  let qualityWeightSum = 0;

  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    const motion = config.jointMotion?.[joint];
    if (!motion) continue;
    const angle = liveAngles?.[joint];
    const weight = config.weights?.[i] ?? 1 / joints.length;
    if (!Number.isFinite(angle)) {
      missingCount++;
      continue;
    }
    const prevAngle = previous?.angles?.[joint];
    const prevSpeed = previous?.speeds?.[joint] || 0;
    const speed = Number.isFinite(prevAngle) ? Math.abs(angle - prevAngle) / dt : 0;
    const accel = Math.abs(speed - prevSpeed) / dt;

    speeds.push(speed);
    weightedSpeed += speed * weight;
    weightedAccel += accel * weight;
    qualityWeightSum += weight;

    const p = pointFor(landmarks, joint);
    const a = pointFor(config.restLandmarks, joint);
    const b = pointFor(targetLandmarks || config.targetLandmarks, joint);
    const pathDev = pointSegmentDistance(p, a, b);
    if (pathDev != null) pathDeviations.push(pathDev);

    if (!contributesToProgress(motion)) {
      progressByJoint[joint] = null;
      continue;
    }

    const progress = progressForJoint(angle, motion);
    if (progress == null) {
      missingCount++;
      continue;
    }
    progresses.push(progress);
    progressByJoint[joint] = progress;
    weightedProgress += progress * weight;
    progressWeightSum += weight;
  }

  if (!progresses.length || progressWeightSum <= 0 || qualityWeightSum <= 0) return null;

  const avgProgress = weightedProgress / progressWeightSum;
  const minProgress = Math.min(...progresses);
  const maxProgress = Math.max(...progresses);
  const avgPathDeviation = pathDeviations.length
    ? pathDeviations.reduce((a, b) => a + b, 0) / pathDeviations.length
    : 0;

  const tempoScore = scoreDecline(weightedSpeed / qualityWeightSum, 180, 520);
  const smoothnessScore = scoreDecline(weightedAccel / qualityWeightSum, 1800, 6500);
  const straightPathScore = scoreDecline(avgPathDeviation, 0.14, 0.40);
  const trajectoryDeviation = trajectoryAngleDeviation(liveAngles, config, joints, avgProgress, trajectoryPhase);
  const trajectoryScore = trajectoryDeviation == null ? null : scoreDecline(trajectoryDeviation, 0.12, 0.38);
  const pathScore = trajectoryScore == null
    ? straightPathScore
    : Math.round(trajectoryScore * 0.72 + straightPathScore * 0.28);
  const trackingScore = scoreDecline(missingCount / Math.max(1, joints.length), 0, 0.35);
  return {
    avgProgress,
    minProgress,
    maxProgress,
    progressByJoint,
    tempoScore,
    smoothnessScore,
    pathScore,
    trajectoryScore,
    straightPathScore,
    trackingScore,
    weightedSpeed: weightedSpeed / qualityWeightSum,
    weightedAccel: weightedAccel / qualityWeightSum,
  };
}

function pairSyncScore(joints, progressByJoint, movementPattern) {
  if (movementPattern !== 'bilateralSync') return 100;
  const spreads = bilateralPairs(joints)
    .map(([left, right]) => {
      const l = progressByJoint[left];
      const r = progressByJoint[right];
      return Number.isFinite(l) && Number.isFinite(r) ? Math.abs(l - r) : null;
    })
    .filter((v) => v != null);
  if (!spreads.length) return 100;
  return scoreDecline(Math.max(...spreads), 0.22, 0.65);
}

function nextFrameState(liveAngles, joints, dt, previous) {
  const nextAngles = {};
  const nextSpeeds = {};
  for (const joint of joints) {
    const angle = liveAngles?.[joint];
    if (!Number.isFinite(angle)) continue;
    const prevAngle = previous?.angles?.[joint];
    nextAngles[joint] = angle;
    nextSpeeds[joint] = Number.isFinite(prevAngle) ? Math.abs(angle - prevAngle) / dt : 0;
  }
  return { angles: nextAngles, speeds: nextSpeeds };
}

function issueFrom(scores) {
  return scores
    .filter((x) => x.score < 75)
    .sort((a, b) => a.score - b.score)[0]?.key || null;
}

function evaluateRegularMotionFrame(liveAngles, landmarks, config, dt, previous) {
  const joints = config?.repJoints || [];
  const trajectoryPhase = previous?.motionPhase === 'return' ? 'return' : 'outbound';
  const metrics = evaluateJointSet(liveAngles, landmarks, config, dt, previous, joints, config.targetLandmarks, trajectoryPhase);
  if (!metrics) return null;
  const syncScore = pairSyncScore(joints, metrics.progressByJoint, config.movementPattern);
  const motionScore = Math.round(
    metrics.tempoScore * 0.22 + metrics.smoothnessScore * 0.22 + metrics.pathScore * 0.22 + syncScore * 0.22 + metrics.trackingScore * 0.12
  );
  const issue = issueFrom([
    { key: 'tracking', score: metrics.trackingScore },
    { key: 'tempo', score: metrics.tempoScore },
    { key: 'smoothness', score: metrics.smoothnessScore },
    { key: 'path', score: metrics.pathScore },
    { key: 'sync', score: syncScore },
  ]);

  const atPeak = metrics.trackingScore >= 70 && metrics.avgProgress >= 0.90 && metrics.minProgress >= 0.75;
  const atRest = metrics.trackingScore >= 70 && metrics.avgProgress <= 0.20 && metrics.maxProgress <= 0.35;
  const next = nextFrameState(liveAngles, joints, dt, previous);
  next.motionPhase = atPeak || (trajectoryPhase === 'return' && !atRest) ? 'return' : 'outbound';

  return {
    motionScore,
    tempoScore: metrics.tempoScore,
    smoothnessScore: metrics.smoothnessScore,
    pathScore: metrics.pathScore,
    syncScore,
    trackingScore: metrics.trackingScore,
    progress: metrics.avgProgress,
    minProgress: metrics.minProgress,
    maxProgress: metrics.maxProgress,
    atPeak,
    atRest,
    severe: metrics.trackingScore <= 20 || metrics.weightedSpeed >= 900 || (metrics.smoothnessScore <= 5 && metrics.weightedSpeed >= 350) || metrics.pathScore <= 10 || syncScore <= 10,
    issue,
    next,
  };
}

function sideConfig(config, side) {
  const sideMotion = config?.sideMotions?.[side];
  const repJoints = sideMotion?.repJoints || (config?.repJoints || []).filter((joint) => sideOf(joint) === side);
  if (!repJoints.length) return null;
  const jointMotion = sideMotion?.jointMotion || config.jointMotion;
  return {
    ...config,
    repJoints,
    jointMotion,
    weights: normalizeWeights(repJoints.map((joint) => jointMotion?.[joint]?.weight ?? jointMotion?.[joint]?.range ?? 1)),
    targetLandmarks: targetLandmarksFor(config, side),
  };
}

function evaluateAlternatingMotionFrame(liveAngles, landmarks, config, dt, previous) {
  const sides = config.alternatingSides || DEFAULT_ALTERNATING_SIDES;
  const expectedSide = previous?.expectedSide || sides[0];
  const sideMetrics = {};
  for (const side of sides) {
    const cfg = sideConfig(config, side);
    if (!cfg) continue;
    sideMetrics[side] = evaluateJointSet(liveAngles, landmarks, cfg, dt, previous, cfg.repJoints, cfg.targetLandmarks);
  }
  const expected = sideMetrics[expectedSide];
  if (!expected) return null;

  const otherSides = sides.filter((side) => side !== expectedSide);
  const maxOtherProgress = Math.max(0, ...otherSides.map((side) => clamp(sideMetrics[side]?.maxProgress ?? 0, 0, 1)));
  const strongestSide = sides
    .map((side) => ({ side, p: sideMetrics[side]?.avgProgress ?? -Infinity }))
    .sort((a, b) => b.p - a.p)[0]?.side || expectedSide;
  const wrongSideActive = strongestSide !== expectedSide && (sideMetrics[strongestSide]?.avgProgress ?? 0) >= 0.65 && expected.avgProgress < 0.65;
  const bothSidesActive = expected.avgProgress >= 0.55 && maxOtherProgress >= 0.55;
  const inactiveSideScore = scoreDecline(maxOtherProgress, 0.25, 0.65);
  const sequenceScore = wrongSideActive ? 0 : bothSidesActive ? 20 : 100;
  const syncScore = Math.min(inactiveSideScore, sequenceScore);
  const motionScore = Math.round(
    expected.tempoScore * 0.22 + expected.smoothnessScore * 0.22 + expected.pathScore * 0.22 + syncScore * 0.22 + expected.trackingScore * 0.12
  );
  const issue = issueFrom([
    { key: 'tracking', score: expected.trackingScore },
    { key: 'sequence', score: sequenceScore },
    { key: 'inactiveSide', score: inactiveSideScore },
    { key: 'tempo', score: expected.tempoScore },
    { key: 'smoothness', score: expected.smoothnessScore },
    { key: 'path', score: expected.pathScore },
  ]);
  const allRest = sides.every((side) => (sideMetrics[side]?.maxProgress ?? 0) <= 0.35);
  const atPeak = expected.trackingScore >= 70 && expected.avgProgress >= 0.90 && expected.minProgress >= 0.75 && maxOtherProgress <= 0.35 && !wrongSideActive;
  const atRest = expected.trackingScore >= 70 && allRest;
  const next = nextFrameState(liveAngles, config.repJoints || [], dt, previous);
  next.expectedSide = expectedSide;

  return {
    motionScore,
    tempoScore: expected.tempoScore,
    smoothnessScore: expected.smoothnessScore,
    pathScore: expected.pathScore,
    syncScore,
    inactiveSideScore,
    sequenceScore,
    trackingScore: expected.trackingScore,
    progress: expected.avgProgress,
    minProgress: expected.minProgress,
    maxProgress: expected.maxProgress,
    expectedSide,
    activeSide: strongestSide,
    atPeak,
    atRest,
    severe: wrongSideActive || bothSidesActive || expected.trackingScore <= 20 || expected.weightedSpeed >= 900 || (expected.smoothnessScore <= 5 && expected.weightedSpeed >= 350) || expected.pathScore <= 10,
    issue,
    next,
  };
}

export function evaluateMultiJointMotionFrame(liveAngles, landmarks, config, dt, previous) {
  if (config?.movementPattern === 'alternating') {
    return evaluateAlternatingMotionFrame(liveAngles, landmarks, config, dt, previous);
  }
  return evaluateRegularMotionFrame(liveAngles, landmarks, config, dt, previous);
}
