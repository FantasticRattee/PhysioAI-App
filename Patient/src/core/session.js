// PhysioAI · Version-2 — Practice session controller.
//
// The V1 runner's brain, made framework-agnostic: NO camera, canvas, rAF or DOM.
// You feed it one frame of landmarks + dt at a time (from the native pose camera
// OR the synthetic demo feed) and it returns a snapshot. The React layer
// (usePractice) owns the camera, TTS and storage; this stays pure + testable.
//
// Per-frame pipeline (identical AI to V1):
//   landmarks → jointAngleCalculator → poseComparator → Form Scorer
//             → Feedback cue → rep state-machine → snapshot

import { jointAngleCalculator } from '../ai/JointAngleCalculator.js';
import { poseComparator } from '../ai/PoseComparator.js';
import { formScorer } from '../ai/FormScorer.js';
import { makeCue } from '../ai/FeedbackGenerator.js';
import { evaluateGate } from '../ai/CameraSetupGate.js';
import { recognizeExercise } from '../ai/ExerciseRecognition.js';
import { makePose } from '../ai/SyntheticPose.js';
import { EXERCISES, romRange } from './exercises.js';
import { buildMotionConfig, evaluateMultiJointMotionFrame } from '../ai/MultiJointMotion.js';

// Resolve the effective exercise for a run. Two sources, by concern:
//  • Quality target (tol, targetAngle) comes from the captured reference.
//  • Dosage (reps/sets/holdSec) comes from the therapist's PLAN (`dose`), which is
//    the single source of truth. Falls back to the reference's legacy plan, then to
//    the exercise-library defaults — so an unprescribed/extra exercise still runs.
function withPlan(ex, ref, dose) {
  const p = (ref && ref.plan) || {};
  const d = dose || {};
  const dominantJoint = ref?.dominantJoint || ref?.primaryJoint || ex.primaryJoint;
  return {
    ...ex,
    repMode: ref?.repMode ?? ex.repMode,
    movementPattern: ref?.movementPattern ?? ex.movementPattern,
    alternatingSides: ref?.alternatingSides ?? ex.alternatingSides,
    countMode: d.countMode ?? ref?.countMode ?? ex.countMode,
    repJoints: ref?.repJoints ?? ex.repJoints,
    primaryJoints: ref?.primaryJoints ?? ex.primaryJoints,
    dominantJoint,
    primaryJoint: dominantJoint,
    jointMotion: ref?.jointMotion ?? ex.jointMotion,
    sideMotions: ref?.sideMotions ?? ex.sideMotions,
    restJointAngles: ref?.restJointAngles ?? ex.restJointAngles,
    targetJointAngles: ref?.targetJointAngles ?? ex.targetJointAngles,
    targetJointAnglesBySide: ref?.targetJointAnglesBySide ?? ex.targetJointAnglesBySide,
    restLandmarks: ref?.restLandmarks ?? ex.restLandmarks,
    targetLandmarks: ref?.targetLandmarks ?? ref?.landmarks ?? ex.targetLandmarks,
    targetLandmarksBySide: ref?.targetLandmarksBySide ?? ex.targetLandmarksBySide,
    tol: p.tol ?? ex.tol,
    target: p.targetAngle ?? ex.target,
    rest: p.restAngle ?? ref?.restAngle ?? ex.rest,
    dir: p.dir ?? ref?.dir ?? ex.dir,
    reps: d.reps ?? p.reps ?? ex.reps,
    sets: d.sets ?? p.sets ?? ex.sets,
    holdSec: d.holdSec ?? p.holdSec ?? ex.holdSec,
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const avg = (sum, n, fallback = 0) => (n ? Math.round(sum / n) : fallback);

function qualityBucket(score) {
  if (score == null) return null;
  return score >= 75 ? null : score >= 50 ? 'medium' : 'low';
}

function scoreDecline(value, okAt, badAt) {
  if (!Number.isFinite(value)) return 100;
  if (value <= okAt) return 100;
  if (value >= badAt) return 0;
  return Math.round(100 * (1 - ((value - okAt) / (badAt - okAt))));
}

function newRepQuality() {
  return {
    poseSum: 0,
    motionSum: 0,
    tempoSum: 0,
    smoothnessSum: 0,
    pathSum: 0,
    syncSum: 0,
    n: 0,
    issues: {},
  };
}

function qualitySnapshot(q, extra = {}) {
  return {
    poseScore: avg(q.poseSum, q.n, null),
    motionScore: avg(q.motionSum, q.n, null),
    tempoScore: avg(q.tempoSum, q.n, null),
    smoothnessScore: avg(q.smoothnessSum, q.n, null),
    pathScore: avg(q.pathSum, q.n, null),
    syncScore: avg(q.syncSum, q.n, null),
    issues: { ...q.issues },
    ...extra,
  };
}

// ── Rep / hold state machine (ported verbatim from V1) ──
function createCounter(ex, { onRep, onSet, onDone }) {
  const totalSets = ex.sets;
  const repsTarget = ex.type === 'hold' ? 1 : ex.reps;
  const range = romRange(ex);
  const alternating = ex.movementPattern === 'alternating';
  const alternatingSides = ex.alternatingSides?.length ? ex.alternatingSides : ['left', 'right'];
  const s = {
    setsDone: 0, repsInSet: 0, peakHold: 0, holdAccum: 0, phase: 'rest', done: false, needsReset: false,
    alternatingExpectedIndex: 0,
    alternatingExpectedSide: alternatingSides[0],
    alternatingCycleCount: 0,
    lastCompletedSide: null,
  };

  function registerRep() {
    s.repsInSet++;
    onRep && onRep(s);
    if (s.repsInSet >= repsTarget) {
      s.setsDone++; s.repsInSet = 0;
      onSet && onSet(s);
      if (s.setsDone >= totalSets) { s.done = true; onDone && onDone(s); }
    }
  }

  function isAtRest(angle) {
    if (angle == null) return false;
    return ex.dir === 'up' ? angle <= ex.rest + range * 0.4 : angle >= ex.rest - range * 0.4;
  }

  function invalidateForBoundary() {
    if (ex.type === 'hold') {
      s.holdAccum = 0;
      return;
    }
    s.needsReset = true;
    s.phase = 'rest';
    s.peakHold = 0;
    if (alternating) s.alternatingCycleCount = 0;
  }

  function completeAlternatingSide() {
    const completedSide = s.alternatingExpectedSide;
    s.lastCompletedSide = completedSide;
    s.alternatingExpectedIndex = (s.alternatingExpectedIndex + 1) % alternatingSides.length;
    s.alternatingExpectedSide = alternatingSides[s.alternatingExpectedIndex];
    if (ex.countMode === 'cycle') {
      s.alternatingCycleCount++;
      if (s.alternatingCycleCount >= alternatingSides.length) {
        s.alternatingCycleCount = 0;
        registerRep();
      }
    } else {
      registerRep();
    }
  }

  function tick(angle, score, dt, opts = {}) {
    if (s.done) return;
    if (opts.boundaryStatus === 'outside' || opts.motionInvalid) {
      invalidateForBoundary();
      return;
    }
    if (angle == null) return;
    if (ex.type === 'hold') {
      const inZone = (opts.atPeak ?? (Math.abs(angle - ex.target) <= ex.tol)) && (score ?? 0) >= 55;
      if (inZone) { s.holdAccum += dt; if (s.holdAccum >= ex.holdSec) { s.holdAccum = 0; registerRep(); } }
      else { s.holdAccum = Math.max(0, s.holdAccum - dt * 0.5); }
    } else {
      const atPeak = opts.atPeak ?? (ex.dir === 'up' ? angle >= ex.target - ex.tol : angle <= ex.target + ex.tol);
      const atRest = opts.atRest ?? isAtRest(angle);
      const peakDwell = Math.min(ex.holdSec, 0.45);
      if (s.needsReset) {
        if (atRest) s.needsReset = false;
        else return;
      }
      if (s.phase === 'rest') {
        s.peakHold = atPeak ? s.peakHold + dt : 0;
        if (s.peakHold >= peakDwell) s.phase = 'peak';
      } else {
        if (atPeak) s.peakHold += dt;
        if (atRest) {
          if (alternating) completeAlternatingSide();
          else registerRep();
          s.phase = 'rest'; s.peakHold = 0;
        }
      }
    }
  }

  function holdProgress() {
    if (ex.type === 'hold') return Math.min(1, s.holdAccum / ex.holdSec);
    return Math.min(1, s.peakHold / Math.max(0.001, ex.holdSec));
  }

  return { tick, state: s, totalSets, repsTarget, holdProgress, isAtRest };
}

export function createSession(opts) {
  const { reference, allRefs = {}, patientId = 'p1', onEvent } = opts;
  let lang = opts.lang || 'th';
  const source = opts.source || 'live';
  const kind = opts.kind || 'plan'; // 'plan' (counts toward adherence) | 'extra'
  const exercise = withPlan(opts.exercise, reference, opts.dose);
  const motionConfig = buildMotionConfig({ exercise, reference });

  const refAngles = (reference && reference.jointAngles)
    ? reference.jointAngles
    : (exercise.targetJointAngles || exercise.jointAngles)
      ? (exercise.targetJointAngles || exercise.jointAngles)
    : jointAngleCalculator(makePose(exercise.primaryJoint, exercise.target));
  const tolOverride = {};
  for (const joint of motionConfig.repJoints || [exercise.primaryJoint]) {
    tolOverride[joint] = motionConfig.jointMotion?.[joint]?.tol ?? exercise.tol;
  }

  let stats, counter, elapsed, lastRecog, lastRecogAt, snapshot;

  function init() {
    stats = {
      scoreSum: 0, scoreN: 0,
      poseScoreSum: 0, poseScoreN: 0,
      motionScoreSum: 0, motionScoreN: 0,
      tempoScoreSum: 0, smoothnessScoreSum: 0, pathScoreSum: 0, syncScoreSum: 0,
      deltaSum: {}, deltaN: {}, repTimes: [], formCounts: {},
      motionIssueCounts: {}, invalidRepCount: 0, repQualityLog: [],
      currentRep: newRepQuality(), invalidOpen: false, prevMotion: null,
    };
    elapsed = 0; lastRecog = null; lastRecogAt = -1;
    snapshot = null;
    counter = createCounter(exercise, {
      onRep: (s) => {
        const atSec = Math.round(elapsed * 10) / 10;
        stats.repTimes.push(atSec);
        stats.repQualityLog.push(qualitySnapshot(stats.currentRep, { valid: true, atSec }));
        stats.currentRep = newRepQuality();
        stats.invalidOpen = false;
        onEvent && onEvent({ type: 'rep', counter: s });
      },
      onSet: (s) => onEvent && onEvent({ type: 'set', counter: s }),
      onDone: () => onEvent && onEvent({ type: 'done' }),
    });
  }
  init();

  function addIssue(key) {
    if (!key) return;
    stats.motionIssueCounts[key] = (stats.motionIssueCounts[key] || 0) + 1;
    stats.currentRep.issues[key] = (stats.currentRep.issues[key] || 0) + 1;
  }

  function addFrameQuality(poseScore, motion) {
    if (poseScore != null) {
      stats.poseScoreSum += poseScore;
      stats.poseScoreN++;
      stats.currentRep.poseSum += poseScore;
    }
    if (motion) {
      stats.motionScoreSum += motion.motionScore;
      stats.tempoScoreSum += motion.tempoScore;
      stats.smoothnessScoreSum += motion.smoothnessScore;
      stats.pathScoreSum += motion.pathScore;
      stats.syncScoreSum += motion.syncScore;
      stats.motionScoreN++;
      stats.currentRep.motionSum += motion.motionScore;
      stats.currentRep.tempoSum += motion.tempoScore;
      stats.currentRep.smoothnessSum += motion.smoothnessScore;
      stats.currentRep.pathSum += motion.pathScore;
      stats.currentRep.syncSum += motion.syncScore;
      stats.currentRep.n++;
      addIssue(motion.issue);
    }
  }

  function markInvalid(reason) {
    if (stats.invalidOpen) return;
    stats.invalidOpen = true;
    stats.invalidRepCount++;
    addIssue(reason);
    stats.repQualityLog.push(qualitySnapshot(stats.currentRep, {
      valid: false,
      atSec: Math.round(elapsed * 10) / 10,
      reason,
    }));
    stats.currentRep = newRepQuality();
  }

  // count=false → run the full pipeline (angles/score/gate/skeleton) but DON'T advance
  // reps. Used during the positioning + countdown phases so setup frames aren't counted.
  function pushFrame(landmarks, dt, count = true, frameGate = null) {
    if (!landmarks) return snapshot;
    elapsed += dt;
    const liveAngles = jointAngleCalculator(landmarks);
    const expectedSide = motionConfig.movementPattern === 'alternating'
      ? counter.state.alternatingExpectedSide
      : null;
    const frameRefAngles = expectedSide
      ? (motionConfig.targetJointAnglesBySide?.[expectedSide] || refAngles)
      : refAngles;
    const cmp = poseComparator(frameRefAngles, liveAngles, tolOverride);
    const primaryAngle = liveAngles[motionConfig.dominantJoint || exercise.primaryJoint];
    const targetAngle = frameRefAngles[motionConfig.dominantJoint || exercise.primaryJoint];

    const trackedRows = cmp.joints.filter((j) => motionConfig.repJoints?.includes(j.joint) && j.score != null);
    const poseScore = trackedRows.length
      ? Math.round(trackedRows.reduce((sum, row) => {
          const idx = motionConfig.repJoints.indexOf(row.joint);
          const weight = motionConfig.weights?.[idx] ?? 1 / trackedRows.length;
          return sum + row.score * weight;
        }, 0) / trackedRows.reduce((sum, row) => {
          const idx = motionConfig.repJoints.indexOf(row.joint);
          return sum + (motionConfig.weights?.[idx] ?? 1 / trackedRows.length);
        }, 0))
      : cmp.score;
    const prevMotion = expectedSide ? { ...(stats.prevMotion || {}), expectedSide } : stats.prevMotion;
    const motion = evaluateMultiJointMotionFrame(liveAngles, landmarks, motionConfig, dt, prevMotion);
    if (motion?.next) stats.prevMotion = motion.next;
    const score = poseScore == null
      ? null
      : Math.round(poseScore * 0.6 + (motion?.motionScore ?? 100) * 0.4);
    cmp.score = score;

    const cue = makeCue(cmp, lang);
    const formClass = formScorer(cmp, motionConfig.dominantJoint || exercise.primaryJoint);
    if (score != null && formClass.conf > 0) stats.formCounts[formClass.cls] = (stats.formCounts[formClass.cls] || 0) + 1;
    const baseGate = evaluateGate(landmarks, exercise);
    const boundary = frameGate?.boundary || frameGate || null;
    const boundaryStatus = boundary?.status || 'inside';
    const blockForLiveFraming = source === 'live' && (!baseGate.ok || boundaryStatus === 'outside');
    const blockingBoundaryStatus = blockForLiveFraming ? 'outside' : boundaryStatus;
    const boundaryCopy = boundary ? {
      status: boundary.status,
      box: boundary.box,
      bodyBox: boundary.bodyBox,
      willExit: !!boundary.willExit,
    } : null;
    let gate = { ...baseGate, boundary: boundaryCopy, boundaryStatus, blockingBoundaryStatus };
    if (baseGate.ok && boundaryStatus !== 'inside') {
      gate = {
        ...gate,
        ok: false,
        hint: boundary?.hint || 'Move inside the frame',
        hintTh: boundary?.hintTh || 'ขยับตัวให้อยู่ในกรอบ',
      };
    }
    if (elapsed - lastRecogAt > 1.0) { lastRecog = recognizeExercise(liveAngles, allRefs, EXERCISES); lastRecogAt = elapsed; }

    if (count) {
      addFrameQuality(poseScore, motion);
      if (blockingBoundaryStatus === 'outside') markInvalid('boundary');
      else if (motion?.severe) markInvalid(motion.issue || 'motion');
    }
    if (count) counter.tick(primaryAngle, score, dt, {
      boundaryStatus: blockingBoundaryStatus,
      motionInvalid: !!motion?.severe,
      atPeak: motion?.atPeak,
      atRest: motion?.atRest,
    });
    if (stats.prevMotion && motionConfig.movementPattern === 'alternating') {
      stats.prevMotion.expectedSide = counter.state.alternatingExpectedSide;
    }
    if (count && !counter.state.needsReset && blockingBoundaryStatus !== 'outside' && !motion?.severe) {
      stats.invalidOpen = false;
    }
    if (count && counter.state.needsReset && blockingBoundaryStatus !== 'outside') {
      gate = {
        ...gate,
        ok: false,
        hint: 'Return to the starting position',
        hintTh: 'กลับท่าปกติก่อนเริ่มใหม่',
      };
    }
    gate.repNeedsReset = !!counter.state.needsReset;
    if (score != null) { stats.scoreSum += score; stats.scoreN++; }
    if (poseScore != null && qualityBucket(poseScore)) addIssue('pose');
    for (const j of cmp.joints) if (j.delta != null) {
      stats.deltaSum[j.joint] = (stats.deltaSum[j.joint] || 0) + j.delta;
      stats.deltaN[j.joint] = (stats.deltaN[j.joint] || 0) + 1;
    }

    snapshot = {
      landmarks, score, comparison: cmp, cue, formClass, gate, recognized: lastRecog,
      poseScore,
      motionScore: motion?.motionScore ?? null,
      motionBreakdown: motion ? {
        tempoScore: motion.tempoScore,
        smoothnessScore: motion.smoothnessScore,
        pathScore: motion.pathScore,
        trajectoryScore: motion.trajectoryScore ?? null,
        straightPathScore: motion.straightPathScore ?? null,
        syncScore: motion.syncScore,
      } : null,
      motionProgress: motion?.progress ?? null,
      movementPattern: motionConfig.movementPattern,
      expectedSide: counter.state.alternatingExpectedSide,
      activeSide: motion?.activeSide ?? null,
      repJoints: motionConfig.repJoints,
      primaryAngle, targetAngle, primaryJoint: motionConfig.dominantJoint || exercise.primaryJoint,
      reps: counter.state.repsInSet, repsTarget: counter.repsTarget,
      setsDone: counter.state.setsDone, totalSets: counter.totalSets,
      holdProgress: counter.holdProgress(), hasPose: true,
      finished: counter.state.done, elapsed,
    };
    return snapshot;
  }

  function avgDeltas() {
    const out = {};
    for (const j in stats.deltaSum) out[j] = stats.deltaSum[j] / stats.deltaN[j];
    return out;
  }

  function finishSummary() {
    const avgPoseScore = avg(stats.poseScoreSum, stats.poseScoreN, avg(stats.scoreSum, stats.scoreN, 0));
    const avgMotionScore = avg(stats.motionScoreSum, stats.motionScoreN, 100);
    const overallScore = Math.round(avgPoseScore * 0.6 + avgMotionScore * 0.4);
    const validReps = counter.state.setsDone * counter.repsTarget + counter.state.repsInSet;
    return {
      patientId, exerciseId: exercise.id, exerciseKey: exercise.key,
      endedAt: Date.now(), durationSec: Math.round(elapsed),
      reps: validReps,
      sets: counter.state.setsDone + (counter.state.repsInSet > 0 ? 1 : 0),
      avgScore: overallScore,
      overallScore,
      avgPoseScore,
      avgMotionScore,
      avgTempoScore: avg(stats.tempoScoreSum, stats.motionScoreN, null),
      avgSmoothnessScore: avg(stats.smoothnessScoreSum, stats.motionScoreN, null),
      avgPathScore: avg(stats.pathScoreSum, stats.motionScoreN, null),
      avgSyncScore: avg(stats.syncScoreSum, stats.motionScoreN, null),
      validReps,
      invalidRepCount: stats.invalidRepCount,
      // Tempo: mean seconds between counted reps (null until ≥2 reps). Cheap quality signal.
      avgSecPerRep: stats.repTimes.length >= 2
        ? Math.round(((stats.repTimes[stats.repTimes.length - 1] - stats.repTimes[0]) / (stats.repTimes.length - 1)) * 10) / 10
        : null,
      avgDeltas: avgDeltas(), source, kind,
      movementPattern: motionConfig.movementPattern,
      countMode: motionConfig.countMode,
      motionIssueCounts: { ...stats.motionIssueCounts },
      repQualityLog: stats.repQualityLog.slice(-60),
      repLog: stats.repTimes.slice(), formBreakdown: { ...stats.formCounts },
    };
  }

  return {
    pushFrame, finishSummary, reset: init,
    setLang: (l) => { lang = l; },
    get snapshot() { return snapshot; },
    get exercise() { return exercise; },
  };
}
