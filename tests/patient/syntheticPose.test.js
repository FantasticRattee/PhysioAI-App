import { makePose, makeSyntheticFeed } from '../../Patient/src/ai/SyntheticPose.js';
import { jointAngleCalculator } from '../../Patient/src/ai/JointAngleCalculator.js';
import { LANDMARK_NAMES } from '../../Patient/src/ai/landmarks.js';

// ─── Helpers ──────────────────────────────────────────────────────
function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

describe('SyntheticPose · makePose', () => {
  it('returns exactly 33 landmark objects', () => {
    const pose = makePose('right_elbow', 90, 0);
    expect(Array.isArray(pose)).toBe(true);
    expect(pose).toHaveLength(33);
    expect(pose).toHaveLength(LANDMARK_NAMES.length);
  });

  it('every landmark has numeric x,y,z and visibility with the exact key set', () => {
    const pose = makePose('right_knee', 75, 0);
    for (const kp of pose) {
      expect(Object.keys(kp).sort()).toEqual(['visibility', 'x', 'y', 'z']);
      expect(isFiniteNum(kp.x)).toBe(true);
      expect(isFiniteNum(kp.y)).toBe(true);
      expect(isFiniteNum(kp.z)).toBe(true);
      expect(isFiniteNum(kp.visibility)).toBe(true);
    }
  });

  it('produces z=0 and visibility=1 for the neutral (no-jitter) pose', () => {
    const pose = makePose('right_elbow', 90, 0);
    for (const kp of pose) {
      expect(kp.z).toBe(0);
      expect(kp.visibility).toBe(1);
    }
  });

  it('keeps x and y coordinates roughly within [0,1]', () => {
    const joints = ['right_elbow', 'left_elbow', 'right_knee', 'left_knee', 'right_shoulder', 'right_hip'];
    for (const j of joints) {
      const pose = makePose(j, 90, 0);
      for (const kp of pose) {
        expect(kp.x).toBeGreaterThanOrEqual(-0.05);
        expect(kp.x).toBeLessThanOrEqual(1.05);
        expect(kp.y).toBeGreaterThanOrEqual(-0.05);
        expect(kp.y).toBeLessThanOrEqual(1.05);
      }
    }
  });

  it('is deterministic: same args (jitter 0) deep-equal across calls', () => {
    const a = makePose('right_elbow', 90, 0);
    const b = makePose('right_elbow', 90, 0);
    expect(a).toEqual(b);
    // and a fresh array (not a shared reference)
    expect(a).not.toBe(b);
  });

  it('the first landmark of the neutral pose is the nose near the top-centre', () => {
    const pose = makePose('right_elbow', 90, 0);
    // LANDMARK_NAMES[0] === 'nose' at [0.50, 0.12]
    expect(LANDMARK_NAMES[0]).toBe('nose');
    expect(pose[0].x).toBeCloseTo(0.5, 5);
    expect(pose[0].y).toBeCloseTo(0.12, 5);
  });
});

describe('SyntheticPose · makePose round-trip with jointAngleCalculator', () => {
  const cases = [
    ['right_elbow', 90],
    ['right_elbow', 150],
    ['right_knee', 90],
    ['right_knee', 45],
    ['left_elbow', 120],
    ['right_shoulder', 60],
  ];

  it.each(cases)(
    'sets %s to ~%i deg measurable by the angle calculator',
    (joint, deg) => {
      const pose = makePose(joint, deg, 0);
      const angles = jointAngleCalculator(pose);
      const measured = angles[joint];
      expect(isFiniteNum(measured)).toBe(true);
      expect(Math.abs(measured - deg)).toBeLessThanOrEqual(8);
    },
  );

  it('returns a finite angle for every tracked joint when posing a simple joint', () => {
    const angles = jointAngleCalculator(makePose('right_elbow', 90, 0));
    // The targeted joint must be finite; others should at least be number|null.
    expect(isFiniteNum(angles.right_elbow)).toBe(true);
  });
});

describe('SyntheticPose · makePose jitter', () => {
  it('jitter=0 leaves the neutral coordinates unperturbed', () => {
    const pose = makePose('right_elbow', 90, 0);
    // nose neutral coords are exact integers-of-grid (0.50, 0.12)
    expect(pose[0].x).toBe(0.5);
    expect(pose[0].y).toBe(0.12);
  });

  it('a non-zero jitter perturbs coordinates away from the un-jittered pose', () => {
    const base = makePose('right_elbow', 90, 0);
    const jittered = makePose('right_elbow', 90, 5);
    expect(jittered).not.toEqual(base);
  });

  it('the same jitter value is deterministic (deep-equal)', () => {
    const a = makePose('right_elbow', 90, 5);
    const b = makePose('right_elbow', 90, 5);
    expect(a).toEqual(b);
  });

  it('different jitter values yield different poses', () => {
    const a = makePose('right_elbow', 90, 5);
    const b = makePose('right_elbow', 90, 7);
    expect(a).not.toEqual(b);
  });

  it('jitter stays small (sub-0.01 displacement per coordinate)', () => {
    const base = makePose('right_elbow', 90, 0);
    const jittered = makePose('right_elbow', 90, 13);
    for (let i = 0; i < base.length; i++) {
      expect(Math.abs(jittered[i].x - base[i].x)).toBeLessThan(0.01);
      expect(Math.abs(jittered[i].y - base[i].y)).toBeLessThan(0.01);
    }
  });
});

describe('SyntheticPose · makeSyntheticFeed', () => {
  const repExercise = { primaryJoint: 'right_elbow', rest: 30, target: 150, type: 'rep' };

  it('returns a function', () => {
    const feed = makeSyntheticFeed(repExercise, 4);
    expect(typeof feed).toBe('function');
  });

  it('each frame returns 33 landmarks plus numeric phase and deg', () => {
    const feed = makeSyntheticFeed(repExercise, 4);
    const frame = feed(1.3);
    expect(frame.landmarks).toHaveLength(33);
    for (const kp of frame.landmarks) {
      expect(isFiniteNum(kp.x)).toBe(true);
      expect(isFiniteNum(kp.y)).toBe(true);
    }
    expect(isFiniteNum(frame.phase)).toBe(true);
    expect(isFiniteNum(frame.deg)).toBe(true);
  });

  it('a "rep" exercise sweeps from rest at t=0 to target at half-period', () => {
    const period = 4;
    const feed = makeSyntheticFeed(repExercise, period);
    const start = feed(0);
    const mid = feed(period / 2);
    // phase: 0 at t=0, 1 at half-period (cosine sweep)
    expect(start.phase).toBeCloseTo(0, 6);
    expect(mid.phase).toBeCloseTo(1, 6);
    // deg = rest + (target - rest) * phase
    expect(start.deg).toBeCloseTo(repExercise.rest, 6);
    expect(mid.deg).toBeCloseTo(repExercise.target, 6);
    // deg varies over time for a rep
    expect(mid.deg).not.toBeCloseTo(start.deg, 2);
  });

  it('the swept deg actually drives the pose angle (round-trip at half-period)', () => {
    const period = 4;
    const feed = makeSyntheticFeed(repExercise, period);
    const mid = feed(period / 2);
    const angles = jointAngleCalculator(mid.landmarks);
    expect(isFiniteNum(angles.right_elbow)).toBe(true);
    expect(Math.abs(angles.right_elbow - mid.deg)).toBeLessThanOrEqual(8);
  });

  it('uses the default period of 4s when none is given', () => {
    const feed = makeSyntheticFeed(repExercise); // period defaults to 4
    expect(feed(0).phase).toBeCloseTo(0, 6);
    expect(feed(2).phase).toBeCloseTo(1, 6); // half of default period
  });

  it('a "hold" exercise hovers near the target (phase ~0.82 at t=0)', () => {
    const holdExercise = { primaryJoint: 'right_knee', rest: 0, target: 90, type: 'hold' };
    const feed = makeSyntheticFeed(holdExercise, 4);
    const frame = feed(0);
    // hold phase = 0.82 + 0.12*sin(0) = 0.82
    expect(frame.phase).toBeCloseTo(0.82, 6);
    // deg = rest + (target-rest)*0.82
    expect(frame.deg).toBeCloseTo(0 + 90 * 0.82, 6);
    expect(frame.landmarks).toHaveLength(33);
  });

  it('hold phase stays bounded within roughly [0.70, 0.94]', () => {
    const holdExercise = { primaryJoint: 'right_knee', rest: 0, target: 90, type: 'hold' };
    const feed = makeSyntheticFeed(holdExercise, 4);
    for (let t = 0; t <= 10; t += 0.37) {
      const p = feed(t).phase;
      expect(p).toBeGreaterThanOrEqual(0.82 - 0.12 - 1e-9);
      expect(p).toBeLessThanOrEqual(0.82 + 0.12 + 1e-9);
    }
  });

  it('is deterministic: same elapsed time yields identical frames', () => {
    const feed = makeSyntheticFeed(repExercise, 4);
    const a = feed(1.5);
    const b = feed(1.5);
    expect(a.phase).toBe(b.phase);
    expect(a.deg).toBe(b.deg);
    expect(a.landmarks).toEqual(b.landmarks);
  });

  it('the rep sweep is periodic over the period', () => {
    const period = 4;
    const feed = makeSyntheticFeed(repExercise, period);
    // elapsedSec % period makes t and t+period produce the same phase
    expect(feed(1).phase).toBeCloseTo(feed(1 + period).phase, 6);
    expect(feed(1).deg).toBeCloseTo(feed(1 + period).deg, 6);
  });
});
