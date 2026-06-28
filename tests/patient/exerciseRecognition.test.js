import { recognizeExercise } from '../../Patient/src/ai/ExerciseRecognition.js';
import {
  jointAngleCalculator,
  JOINT_SPECS,
} from '../../Patient/src/ai/JointAngleCalculator.js';
import { makePose } from '../../Patient/src/ai/SyntheticPose.js';

// ─── Helpers ──────────────────────────────────────────────────────
const JOINT_KEYS = JOINT_SPECS.map((s) => s.joint);

// Build the angle map a captured reference would store, for a given
// exercise definition (primary joint rotated to `target` degrees).
function anglesFor(primaryJoint, targetDeg) {
  return jointAngleCalculator(makePose(primaryJoint, targetDeg));
}

// A reference entry, as the recogniser reads it: ref.jointAngles.
function refFor(primaryJoint, targetDeg) {
  return { jointAngles: anglesFor(primaryJoint, targetDeg) };
}

// Two distinct exercises that move different primary joints to clearly
// different targets, so their reference poses are well separated.
const EX_KNEE = { id: 'ex-knee', primaryJoint: 'left_knee', target: 90 };
const EX_ELBOW = { id: 'ex-elbow', primaryJoint: 'left_elbow', target: 45 };

// ─── Empty / null / guard cases ──────────────────────────────────
describe('recognizeExercise · guard cases', () => {
  it('returns null when referencesMap is empty and no exercises given', () => {
    const live = anglesFor('left_knee', 90);
    expect(recognizeExercise(live, {})).toBeNull();
  });

  it('returns null when exercises array is empty even with a live pose', () => {
    const live = anglesFor('left_knee', 90);
    expect(recognizeExercise(live, { 'ex-knee': refFor('left_knee', 90) }, [])).toBeNull();
  });

  it('returns null when liveAngles is null', () => {
    expect(recognizeExercise(null, {}, [EX_KNEE])).toBeNull();
  });

  it('returns null when liveAngles is undefined', () => {
    expect(recognizeExercise(undefined, {}, [EX_KNEE])).toBeNull();
  });

  it('returns null when liveAngles has no usable (non-null) joints', () => {
    const empty = {};
    for (const j of JOINT_KEYS) empty[j] = null;
    expect(recognizeExercise(empty, { 'ex-knee': refFor('left_knee', 90) }, [EX_KNEE])).toBeNull();
  });

  it('returns null when exercises is not an array', () => {
    const live = anglesFor('left_knee', 90);
    expect(recognizeExercise(live, {}, 'not-an-array')).toBeNull();
  });

  it('skips candidates without an id and returns null if none remain', () => {
    const live = anglesFor('left_knee', 90);
    // exercise with no id is skipped; no other candidate -> null
    expect(recognizeExercise(live, {}, [{ primaryJoint: 'left_knee', target: 90 }])).toBeNull();
  });
});

// ─── Recognition from a references map ───────────────────────────
describe('recognizeExercise · matches against references map', () => {
  let referencesMap;
  let exercises;

  beforeEach(() => {
    exercises = [EX_KNEE, EX_ELBOW];
    referencesMap = {
      [EX_KNEE.id]: refFor(EX_KNEE.primaryJoint, EX_KNEE.target),
      [EX_ELBOW.id]: refFor(EX_ELBOW.primaryJoint, EX_ELBOW.target),
    };
  });

  it('recognises the knee exercise when live == its reference angles', () => {
    const live = anglesFor(EX_KNEE.primaryJoint, EX_KNEE.target);
    const result = recognizeExercise(live, referencesMap, exercises);

    expect(result).not.toBeNull();
    expect(result.exerciseId).toBe(EX_KNEE.id);
  });

  it('recognises the elbow exercise when live == its reference angles', () => {
    const live = anglesFor(EX_ELBOW.primaryJoint, EX_ELBOW.target);
    const result = recognizeExercise(live, referencesMap, exercises);

    expect(result).not.toBeNull();
    expect(result.exerciseId).toBe(EX_ELBOW.id);
  });

  it('returns a well-formed shape {exerciseId, conf, distance}', () => {
    const live = anglesFor(EX_KNEE.primaryJoint, EX_KNEE.target);
    const result = recognizeExercise(live, referencesMap, exercises);

    expect(result).toEqual({
      exerciseId: expect.any(String),
      conf: expect.any(Number),
      distance: expect.any(Number),
    });
  });

  it('exact match yields distance ~0 and conf near 1', () => {
    const live = anglesFor(EX_KNEE.primaryJoint, EX_KNEE.target);
    const result = recognizeExercise(live, referencesMap, exercises);

    expect(result.distance).toBeCloseTo(0, 6);
    // conf = clamp01(1 - distance/90), distance ~0 -> ~1; margin boost keeps it clamped to 1.
    expect(result.conf).toBeGreaterThan(0.99);
    expect(result.conf).toBeLessThanOrEqual(1);
  });

  it('conf is always within [0,1]', () => {
    const live = anglesFor(EX_KNEE.primaryJoint, EX_KNEE.target);
    const result = recognizeExercise(live, referencesMap, exercises);

    expect(result.conf).toBeGreaterThanOrEqual(0);
    expect(result.conf).toBeLessThanOrEqual(1);
  });

  it('distance is non-negative', () => {
    const live = anglesFor(EX_ELBOW.primaryJoint, EX_ELBOW.target);
    const result = recognizeExercise(live, referencesMap, exercises);

    expect(result.distance).toBeGreaterThanOrEqual(0);
  });
});

// ─── Confidence behaviour: margin boost ──────────────────────────
describe('recognizeExercise · confidence and margin', () => {
  it('an unambiguous winner (large margin) is more confident than a near-tie at the same distance', () => {
    // Live pose exactly matches the knee reference (distance 0 for the winner
    // in both scenarios). What differs is the runner-up's distance.
    const live = anglesFor('left_knee', 90);

    // Scenario A: runner-up is a totally different pose -> large margin.
    const exA = [
      { id: 'win', primaryJoint: 'left_knee', target: 90 },
      { id: 'far', primaryJoint: 'left_elbow', target: 10 },
    ];
    const refA = {
      win: refFor('left_knee', 90),
      far: refFor('left_elbow', 10),
    };
    const resA = recognizeExercise(live, refA, exA);

    // Scenario B: runner-up is nearly identical to the winner -> small margin.
    const exB = [
      { id: 'win', primaryJoint: 'left_knee', target: 90 },
      { id: 'near', primaryJoint: 'left_knee', target: 92 },
    ];
    const refB = {
      win: refFor('left_knee', 90),
      near: refFor('left_knee', 92),
    };
    const resB = recognizeExercise(live, refB, exB);

    expect(resA.exerciseId).toBe('win');
    expect(resB.exerciseId).toBe('win');
    // Both winners sit at distance ~0, so base conf is identical; the
    // larger margin in A must push its conf >= B's (and both clamped <=1).
    expect(resA.conf).toBeGreaterThanOrEqual(resB.conf);
    expect(resA.conf).toBeLessThanOrEqual(1);
    expect(resB.conf).toBeLessThanOrEqual(1);
  });

  it('confidence drops as the live pose drifts away from the only reference', () => {
    const exercises = [{ id: 'solo', primaryJoint: 'left_knee', target: 90 }];
    const referencesMap = { solo: refFor('left_knee', 90) };

    const close = recognizeExercise(anglesFor('left_knee', 90), referencesMap, exercises);
    const farther = recognizeExercise(anglesFor('left_knee', 130), referencesMap, exercises);

    expect(close.exerciseId).toBe('solo');
    expect(farther.exerciseId).toBe('solo');
    expect(farther.distance).toBeGreaterThan(close.distance);
    expect(farther.conf).toBeLessThan(close.conf);
  });

  it('a wildly mismatched live pose against a single reference still returns that id with lower conf', () => {
    const exercises = [{ id: 'solo', primaryJoint: 'left_knee', target: 90 }];
    const referencesMap = { solo: refFor('left_knee', 90) };

    const result = recognizeExercise(anglesFor('left_elbow', 30), referencesMap, exercises);
    expect(result).not.toBeNull();
    expect(result.exerciseId).toBe('solo');
    expect(result.conf).toBeLessThan(1);
  });
});

// ─── Fallback: synthesise target when no reference is stored ──────
describe('recognizeExercise · synthesised target fallback', () => {
  it('falls back to targetFromExercise when referencesMap has no entry', () => {
    const exercises = [EX_KNEE, EX_ELBOW];
    const live = anglesFor(EX_KNEE.primaryJoint, EX_KNEE.target);

    // Empty references map -> each target synthesised from the exercise def.
    const result = recognizeExercise(live, {}, exercises);

    expect(result).not.toBeNull();
    expect(result.exerciseId).toBe(EX_KNEE.id);
    expect(result.distance).toBeCloseTo(0, 6);
    expect(result.conf).toBeGreaterThan(0.99);
  });

  it('falls back when a reference entry exists but lacks jointAngles', () => {
    const exercises = [EX_KNEE];
    const live = anglesFor(EX_KNEE.primaryJoint, EX_KNEE.target);

    // ref present but with no jointAngles -> synthesised target used.
    const referencesMap = { [EX_KNEE.id]: { jointAngles: null, note: 'incomplete' } };
    const result = recognizeExercise(live, referencesMap, exercises);

    expect(result).not.toBeNull();
    expect(result.exerciseId).toBe(EX_KNEE.id);
    expect(result.distance).toBeCloseTo(0, 6);
  });

  it('mixes a stored reference and a synthesised fallback in one call', () => {
    const exercises = [EX_KNEE, EX_ELBOW];
    // Only the elbow has a stored reference; the knee is synthesised.
    const referencesMap = { [EX_ELBOW.id]: refFor(EX_ELBOW.primaryJoint, EX_ELBOW.target) };

    const liveKnee = recognizeExercise(anglesFor('left_knee', 90), referencesMap, exercises);
    const liveElbow = recognizeExercise(anglesFor('left_elbow', 45), referencesMap, exercises);

    expect(liveKnee.exerciseId).toBe(EX_KNEE.id);
    expect(liveElbow.exerciseId).toBe(EX_ELBOW.id);
  });
});

// ─── Determinism ─────────────────────────────────────────────────
describe('recognizeExercise · determinism', () => {
  it('returns identical results for identical inputs across calls', () => {
    const exercises = [EX_KNEE, EX_ELBOW];
    const referencesMap = {
      [EX_KNEE.id]: refFor(EX_KNEE.primaryJoint, EX_KNEE.target),
      [EX_ELBOW.id]: refFor(EX_ELBOW.primaryJoint, EX_ELBOW.target),
    };
    const live = anglesFor(EX_KNEE.primaryJoint, EX_KNEE.target);

    const a = recognizeExercise(live, referencesMap, exercises);
    const b = recognizeExercise(live, referencesMap, exercises);
    expect(a).toEqual(b);
  });
});
