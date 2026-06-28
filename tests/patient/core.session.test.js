// PhysioAI · Patient core — Practice session controller (core/session.js).
//
// createSession() is the framework-agnostic "brain" of a practice run. It wires
// the FULL real AI pipeline together (joint angles → comparator → form scorer →
// feedback → multi-joint motion → rep state-machine) and exposes a tiny imperative
// API: pushFrame / finishSummary / reset / setLang plus `snapshot` & `exercise`
// getters. These tests drive the pipeline with synthetic poses (from the real
// SyntheticPose generator) and assert against the REAL snapshot/summary shapes.
//
// All imports are node-safe; FeedbackGenerator pulls core/i18n which touches
// AsyncStorage, which the patient project auto-mocks in-memory.

import { createSession } from '../../Patient/src/core/session.js';
import { getExercise, EXERCISES } from '../../Patient/src/core/exercises.js';
import { makePose } from '../../Patient/src/ai/SyntheticPose.js';

// ── Pose helpers ────────────────────────────────────────────────────────────
// Build a pose that sets the exercise's primary joint somewhere on the rest→target
// line. Driving reps via gradual interpolation keeps per-frame angular SPEED low
// so the multi-joint motion model doesn't flag the frame as `severe` (a sudden
// rest→target jump trips the speed/jerk guards and invalidates the rep).
function poseAt(ex, frac) {
  const deg = ex.rest + (ex.target - ex.rest) * frac;
  return makePose(ex.primaryJoint, deg);
}

// Push `n` frames holding a fixed fraction; returns the last snapshot.
function hold(sess, ex, frac, n, dt = 0.1) {
  let snap;
  for (let i = 0; i < n; i++) snap = sess.pushFrame(poseAt(ex, frac), dt, true, null);
  return snap;
}

// Drive ONE full rep: ramp rest→target, dwell at peak, ramp back, dwell at rest.
function driveRep(sess, ex, { dt = 0.1, steps = 12 } = {}) {
  for (let i = 1; i <= steps; i++) sess.pushFrame(poseAt(ex, i / steps), dt, true, null);
  hold(sess, ex, 1, 6, dt);                                   // dwell at peak
  for (let i = steps - 1; i >= 0; i--) sess.pushFrame(poseAt(ex, i / steps), dt, true, null);
  return hold(sess, ex, 0, 6, dt);                            // dwell back at rest
}

// ── createSession: construction & getters ───────────────────────────────────
describe('createSession — construction and getters', () => {
  it('returns the documented API surface', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, lang: 'en', patientId: 'p1', source: 'demo' });
    expect(typeof sess.pushFrame).toBe('function');
    expect(typeof sess.finishSummary).toBe('function');
    expect(typeof sess.reset).toBe('function');
    expect(typeof sess.setLang).toBe('function');
    // snapshot starts null before any frame is pushed.
    expect(sess.snapshot).toBe(null);
  });

  it('exposes the resolved exercise (withPlan) via the exercise getter', () => {
    const ex = getExercise('knee'); // right_knee, dir 'up', target 172, rest 92
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    const resolved = sess.exercise;
    expect(resolved.id).toBe('knee');
    expect(resolved.primaryJoint).toBe('right_knee');
    expect(resolved.target).toBe(172);
    expect(resolved.rest).toBe(92);
    // Dosage falls back to the library defaults when no plan/dose is supplied.
    expect(resolved.reps).toBe(ex.reps);
    expect(resolved.sets).toBe(ex.sets);
  });

  it('applies a dose override for reps/sets/holdSec', () => {
    const ex = getExercise('knee');
    const sess = createSession({
      exercise: ex, patientId: 'p1', source: 'demo',
      dose: { reps: 4, sets: 1, holdSec: 0.5 },
    });
    expect(sess.exercise.reps).toBe(4);
    expect(sess.exercise.sets).toBe(1);
    expect(sess.exercise.holdSec).toBe(0.5);
  });

  it('works for every builtin exercise without throwing', () => {
    for (const ex of EXERCISES) {
      const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
      const snap = sess.pushFrame(poseAt(ex, 0), 0.1, true, null);
      expect(snap).not.toBe(null);
      expect(snap.primaryJoint).toBe(ex.dominantJoint || ex.primaryJoint);
    }
  });
});

// ── pushFrame: snapshot shape ───────────────────────────────────────────────
describe('pushFrame — snapshot shape and gate fields', () => {
  it('returns null and does not advance when landmarks is falsy', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    expect(sess.pushFrame(null, 0.1, true, null)).toBe(null);
    expect(sess.pushFrame(undefined, 0.1, true, null)).toBe(null);
    expect(sess.snapshot).toBe(null);
  });

  it('produces a snapshot with all documented keys', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    const snap = sess.pushFrame(poseAt(ex, 0), 0.1, true, null);
    // Every key the React layer (usePractice) reads off the snapshot.
    expect(snap).toEqual(expect.objectContaining({
      landmarks: expect.any(Array),
      comparison: expect.any(Object),
      cue: expect.any(Object),
      formClass: expect.any(Object),
      gate: expect.any(Object),
      poseScore: expect.anything(),
      movementPattern: expect.any(String),
      repJoints: expect.any(Array),
      primaryJoint: ex.primaryJoint,
    }));
    // score may be null only when no joints validate; here it is a number.
    expect(typeof snap.score).toBe('number');
    // Counter mirror fields.
    expect(snap.reps).toBe(0);
    expect(snap.repsTarget).toBe(ex.reps);
    expect(snap.setsDone).toBe(0);
    expect(snap.totalSets).toBe(ex.sets);
    expect(snap.finished).toBe(false);
    expect(snap.hasPose).toBe(true);
    expect(typeof snap.elapsed).toBe('number');
    expect(snap.elapsed).toBeCloseTo(0.1, 5);
  });

  it('snapshot.comparison has the poseComparator shape (joints + score)', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    const { comparison } = sess.pushFrame(poseAt(ex, 0.5), 0.1, true, null);
    expect(Array.isArray(comparison.joints)).toBe(true);
    expect(comparison).toHaveProperty('validCount');
    expect(comparison).toHaveProperty('primary');
    // session overwrites comparison.score with the blended pose×motion score.
    expect(comparison).toHaveProperty('score');
    const row = comparison.joints.find((j) => j.joint === ex.primaryJoint);
    expect(row).toBeDefined();
    expect(['ok', 'warn', 'bad', 'none']).toContain(row.status);
  });

  it('snapshot.formClass has the formScorer shape (cls + conf)', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    const { formClass } = sess.pushFrame(poseAt(ex, 0), 0.1, true, null);
    expect(['correct', 'undershoot', 'lean', 'multi']).toContain(formClass.cls);
    expect(typeof formClass.conf).toBe('number');
    expect(typeof formClass.label).toBe('string');
  });

  it('snapshot.gate carries framing + boundary fields', () => {
    const ex = getExercise('knee');
    // source !== 'live' so boundary blocking does not force the gate closed.
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    const { gate } = sess.pushFrame(poseAt(ex, 0), 0.1, true, null);
    expect(typeof gate.ok).toBe('boolean');
    expect(typeof gate.score).toBe('number');
    expect(gate).toHaveProperty('hint');
    expect(gate).toHaveProperty('boundaryStatus');
    expect(gate).toHaveProperty('blockingBoundaryStatus');
    expect(typeof gate.repNeedsReset).toBe('boolean');
  });

  it('passes an external frameGate boundary through to the snapshot gate', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    const frameGate = {
      boundary: { status: 'inside', box: { x: 0, y: 0, w: 1, h: 1 }, bodyBox: null, willExit: false },
    };
    const { gate } = sess.pushFrame(poseAt(ex, 0), 0.1, true, frameGate);
    expect(gate.boundaryStatus).toBe('inside');
    expect(gate.boundary).toEqual(expect.objectContaining({ status: 'inside', willExit: false }));
  });

  it('count=false runs the pipeline but does not advance reps', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    // settle at rest then attempt a full rep with counting OFF
    for (let i = 0; i < 6; i++) sess.pushFrame(poseAt(ex, 0), 0.1, false, null);
    for (let i = 1; i <= 12; i++) sess.pushFrame(poseAt(ex, i / 12), 0.1, false, null);
    for (let i = 0; i < 6; i++) sess.pushFrame(poseAt(ex, 1), 0.1, false, null);
    const snap = sess.pushFrame(poseAt(ex, 0), 0.1, false, null);
    expect(snap.reps).toBe(0);
    expect(snap.setsDone).toBe(0);
    // a summary at this point has counted nothing
    expect(sess.finishSummary().reps).toBe(0);
  });
});

// ── Rep counting through the full pipeline ──────────────────────────────────
describe('pushFrame — drives reps through the real pipeline', () => {
  it('counts at least one rep for a builtin rep exercise', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    hold(sess, ex, 0, 6);            // establish a clean rest baseline
    const snap = driveRep(sess, ex); // one rest→target→rest cycle
    expect(snap.reps).toBeGreaterThanOrEqual(1);
  });

  it('accumulates multiple reps across repeated cycles', () => {
    const ex = getExercise('knee'); // 15 reps × 2 sets
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    hold(sess, ex, 0, 6);
    for (let c = 0; c < 4; c++) driveRep(sess, ex);
    expect(sess.snapshot.reps).toBeGreaterThanOrEqual(3);
    // still in set 1 (15-rep target not reached)
    expect(sess.snapshot.setsDone).toBe(0);
    expect(sess.snapshot.finished).toBe(false);
  });

  it('emits onEvent rep callbacks as reps complete', () => {
    const ex = getExercise('knee');
    const events = [];
    const sess = createSession({
      exercise: ex, patientId: 'p1', source: 'demo',
      onEvent: (e) => events.push(e.type),
    });
    hold(sess, ex, 0, 6);
    driveRep(sess, ex);
    driveRep(sess, ex);
    expect(events.filter((t) => t === 'rep').length).toBeGreaterThanOrEqual(1);
  });
});

// ── finishSummary ───────────────────────────────────────────────────────────
describe('finishSummary — summary shape and values', () => {
  it('returns a summary with all documented keys and a stable mocked endedAt', () => {
    const FIXED = 1700000000000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(FIXED);
    try {
      const ex = getExercise('knee');
      const sess = createSession({ exercise: ex, patientId: 'patient-42', source: 'demo', kind: 'plan' });
      hold(sess, ex, 0, 6);
      driveRep(sess, ex);
      driveRep(sess, ex);
      const sum = sess.finishSummary();

      expect(sum.patientId).toBe('patient-42');
      expect(sum.exerciseId).toBe('knee');
      expect(sum.endedAt).toBe(FIXED);
      expect(typeof sum.endedAt).toBe('number');
      expect(typeof sum.durationSec).toBe('number');
      expect(sum.durationSec).toBeGreaterThan(0);

      // rep accounting
      expect(typeof sum.reps).toBe('number');
      expect(sum.reps).toBe(sum.validReps);
      expect(sum.reps).toBeGreaterThanOrEqual(1);
      expect(typeof sum.sets).toBe('number');

      // scoring block
      expect(typeof sum.avgScore).toBe('number');
      expect(sum.avgScore).toBe(sum.overallScore);
      expect(typeof sum.avgPoseScore).toBe('number');
      expect(typeof sum.avgMotionScore).toBe('number');
      expect(sum.avgScore).toBeGreaterThanOrEqual(0);
      expect(sum.avgScore).toBeLessThanOrEqual(100);

      // metadata + logs
      expect(sum.source).toBe('demo');
      expect(sum.kind).toBe('plan');
      expect(sum.movementPattern).toBe('unilateral');
      expect(typeof sum.invalidRepCount).toBe('number');
      expect(Array.isArray(sum.repQualityLog)).toBe(true);
      expect(Array.isArray(sum.repLog)).toBe(true);
      expect(typeof sum.avgDeltas).toBe('object');
      expect(typeof sum.formBreakdown).toBe('object');
      expect(typeof sum.motionIssueCounts).toBe('object');
    } finally {
      spy.mockRestore();
    }
  });

  it('avgSecPerRep is null with <2 reps and a number once ≥2 reps are logged', () => {
    const ex = getExercise('knee');
    // No frames at all → 0 reps → avgSecPerRep null.
    const empty = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    expect(empty.finishSummary().avgSecPerRep).toBe(null);

    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    hold(sess, ex, 0, 6);
    driveRep(sess, ex);
    driveRep(sess, ex);
    driveRep(sess, ex);
    const sum = sess.finishSummary();
    if (sum.reps >= 2) {
      expect(typeof sum.avgSecPerRep).toBe('number');
      expect(sum.avgSecPerRep).toBeGreaterThan(0);
    } else {
      expect(sum.avgSecPerRep).toBe(null);
    }
  });

  it('carries source and kind from options into the summary', () => {
    const ex = getExercise('shoulder');
    const sess = createSession({ exercise: ex, patientId: 'p9', source: 'live', kind: 'extra' });
    const sum = sess.finishSummary();
    expect(sum.source).toBe('live');
    expect(sum.kind).toBe('extra');
    expect(sum.patientId).toBe('p9');
  });
});

// ── reset & setLang ─────────────────────────────────────────────────────────
describe('reset and setLang', () => {
  it('reset() clears all progress and the snapshot', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, patientId: 'p1', source: 'demo' });
    hold(sess, ex, 0, 6);
    driveRep(sess, ex);
    driveRep(sess, ex);
    expect(sess.snapshot.reps).toBeGreaterThanOrEqual(1);

    sess.reset();
    expect(sess.snapshot).toBe(null);

    const sum = sess.finishSummary();
    expect(sum.reps).toBe(0);
    expect(sum.durationSec).toBe(0);
    expect(sum.invalidRepCount).toBe(0);
  });

  it('setLang(th) switches the cue language; cue text differs from en', () => {
    const ex = getExercise('knee');
    const sess = createSession({ exercise: ex, lang: 'en', patientId: 'p1', source: 'demo' });
    // Push a clearly-off pose so a directional cue (not the generic "good") is produced.
    const offPose = poseAt(ex, 0); // far below target → undershoot cue with non-empty text
    const enCue = sess.pushFrame(offPose, 0.1, true, null).cue;
    expect(typeof enCue.text).toBe('string');

    sess.setLang('th');
    const thCue = sess.pushFrame(offPose, 0.1, true, null).cue;
    expect(typeof thCue.text).toBe('string');
    // Same cue id (same joint+direction) but localized text should change language.
    if (enCue.id === thCue.id && enCue.tone !== 'none') {
      expect(thCue.text).not.toBe(enCue.text);
    }
  });
});
