import {
  JOINT_SPECS,
  angleAt,
  jointAngleCalculator,
} from '../../Patient/src/ai/JointAngleCalculator.js';
import { LANDMARK_NAMES, idx } from '../../Patient/src/ai/landmarks.js';
import { makePose } from '../../Patient/src/ai/SyntheticPose.js';

// ─── Helpers ──────────────────────────────────────────────────────
// Build a full 33-landmark array, all visible at a default coordinate,
// then override specific named landmarks.
function makeLandmarks(overrides = {}, defaultVis = 1) {
  const arr = LANDMARK_NAMES.map((name) => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: defaultVis,
  }));
  for (const [name, val] of Object.entries(overrides)) {
    const i = idx(name);
    if (i >= 0) arr[i] = { x: 0.5, y: 0.5, z: 0, visibility: 1, ...val };
  }
  return arr;
}

describe('JointAngleCalculator · JOINT_SPECS', () => {
  it('defines exactly 12 joint specs', () => {
    expect(Array.isArray(JOINT_SPECS)).toBe(true);
    expect(JOINT_SPECS).toHaveLength(12);
  });

  it('contains the expected joint names', () => {
    const names = JOINT_SPECS.map((s) => s.joint);
    expect(names).toEqual([
      'left_elbow',
      'right_elbow',
      'left_shoulder',
      'right_shoulder',
      'left_hip',
      'right_hip',
      'left_knee',
      'right_knee',
      'left_ankle',
      'right_ankle',
      'back',
      'neck',
    ]);
  });

  it('every spec has joint, a, b, c, label and labelTh fields', () => {
    for (const s of JOINT_SPECS) {
      expect(typeof s.joint).toBe('string');
      expect(typeof s.a).toBe('string');
      expect(typeof s.b).toBe('string');
      expect(typeof s.c).toBe('string');
      expect(typeof s.label).toBe('string');
      expect(typeof s.labelTh).toBe('string');
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.labelTh.length).toBeGreaterThan(0);
    }
  });

  it('the vertex (b) of each named-limb spec equals its joint name', () => {
    // The 10 anatomical joints use their own landmark as the vertex b.
    const namedJoints = JOINT_SPECS.filter(
      (s) => s.joint !== 'back' && s.joint !== 'neck'
    );
    for (const s of namedJoints) {
      expect(s.b).toBe(s.joint);
    }
  });

  it('back and neck use midpoint/virtual landmarks', () => {
    const back = JOINT_SPECS.find((s) => s.joint === 'back');
    const neck = JOINT_SPECS.find((s) => s.joint === 'neck');
    expect(back).toMatchObject({ a: 'mid_shoulder', b: 'mid_hip', c: 'mid_knee' });
    expect(neck).toMatchObject({ a: 'head_center', b: 'mid_shoulder', c: 'mid_hip' });
  });
});

describe('JointAngleCalculator · angleAt', () => {
  it('returns ~90 degrees for a right angle', () => {
    // vertex at origin, ray to +x and ray to +y → 90°
    const b = { x: 0, y: 0 };
    const a = { x: 1, y: 0 };
    const c = { x: 0, y: 1 };
    const deg = angleAt(a, b, c);
    expect(deg).toBeCloseTo(90, 5);
  });

  it('returns ~180 degrees for a straight line', () => {
    // a and c on opposite sides of vertex b → 180°
    const b = { x: 0, y: 0 };
    const a = { x: -1, y: 0 };
    const c = { x: 1, y: 0 };
    const deg = angleAt(a, b, c);
    expect(deg).toBeCloseTo(180, 5);
  });

  it('returns ~0 degrees when both rays point the same way', () => {
    const b = { x: 0, y: 0 };
    const a = { x: 1, y: 0 };
    const c = { x: 2, y: 0 };
    const deg = angleAt(a, b, c);
    expect(deg).toBeCloseTo(0, 5);
  });

  it('returns ~45 degrees for a 45° spread', () => {
    const b = { x: 0, y: 0 };
    const a = { x: 1, y: 0 };
    const c = { x: 1, y: 1 };
    const deg = angleAt(a, b, c);
    expect(deg).toBeCloseTo(45, 5);
  });

  it('always returns a value within [0, 180]', () => {
    const samples = [
      [{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 1 }],
      [{ x: 0.3, y: 0.9 }, { x: 0.1, y: 0.1 }, { x: -0.7, y: -0.4 }],
      [{ x: 5, y: -3 }, { x: 2, y: 2 }, { x: -1, y: 8 }],
    ];
    for (const [a, b, c] of samples) {
      const deg = angleAt(a, b, c);
      expect(deg).toBeGreaterThanOrEqual(0);
      expect(deg).toBeLessThanOrEqual(180);
    }
  });

  it('returns null when the first ray has zero length (a === b)', () => {
    const b = { x: 0.5, y: 0.5 };
    const a = { x: 0.5, y: 0.5 };
    const c = { x: 1, y: 1 };
    expect(angleAt(a, b, c)).toBeNull();
  });

  it('returns null when the second ray has zero length (c === b)', () => {
    const b = { x: 0.5, y: 0.5 };
    const a = { x: 1, y: 1 };
    const c = { x: 0.5, y: 0.5 };
    expect(angleAt(a, b, c)).toBeNull();
  });

  it('is symmetric: swapping a and c yields the same angle', () => {
    const b = { x: 0, y: 0 };
    const a = { x: 1, y: 0 };
    const c = { x: 0, y: 1 };
    expect(angleAt(a, b, c)).toBeCloseTo(angleAt(c, b, a), 10);
  });
});

describe('JointAngleCalculator · jointAngleCalculator', () => {
  it('produces a key for every joint in JOINT_SPECS', () => {
    const landmarks = makePose('right_elbow', 90);
    const out = jointAngleCalculator(landmarks);
    for (const s of JOINT_SPECS) {
      expect(out).toHaveProperty(s.joint);
    }
    expect(Object.keys(out)).toHaveLength(JOINT_SPECS.length);
  });

  it('round-trips a synthetic right_elbow pose (~90°)', () => {
    const out = jointAngleCalculator(makePose('right_elbow', 90));
    expect(out.right_elbow).not.toBeNull();
    expect(Number.isFinite(out.right_elbow)).toBe(true);
    expect(out.right_elbow).toBeCloseTo(90, 0); // within ~0.5°
  });

  it('round-trips synthetic poses for each named limb joint within ~8°', () => {
    const cases = [
      ['left_elbow', 100],
      ['right_elbow', 70],
      ['left_shoulder', 60],
      ['right_shoulder', 45],
      ['left_hip', 120],
      ['right_hip', 110],
      ['left_knee', 95],
      ['right_knee', 80],
      ['left_ankle', 90],
      ['right_ankle', 100],
    ];
    for (const [joint, deg] of cases) {
      const out = jointAngleCalculator(makePose(joint, deg));
      expect(Number.isFinite(out[joint])).toBe(true);
      expect(Math.abs(out[joint] - deg)).toBeLessThanOrEqual(8);
    }
  });

  it('produces finite values for the virtual back and neck joints', () => {
    const out = jointAngleCalculator(makePose('back', 170));
    expect(Number.isFinite(out.back)).toBe(true);
    expect(out.back).toBeGreaterThanOrEqual(0);
    expect(out.back).toBeLessThanOrEqual(180);

    const out2 = jointAngleCalculator(makePose('neck', 160));
    expect(Number.isFinite(out2.neck)).toBe(true);
    expect(out2.neck).toBeGreaterThanOrEqual(0);
    expect(out2.neck).toBeLessThanOrEqual(180);
  });

  it('returns null for a joint whose contributing landmark is below MIN_VIS (0.5)', () => {
    // right_elbow needs right_shoulder, right_elbow, right_wrist visible.
    const landmarks = makeLandmarks(
      {
        right_shoulder: { x: 0.6, y: 0.27 },
        right_elbow: { x: 0.635, y: 0.41 },
        right_wrist: { x: 0.65, y: 0.54, visibility: 0.49 }, // just below MIN_VIS
      },
      1
    );
    const out = jointAngleCalculator(landmarks);
    expect(out.right_elbow).toBeNull();
  });

  it('treats exactly MIN_VIS (0.5) as visible (not below threshold)', () => {
    // Build a clean elbow geometry so the angle is well-defined, vis === 0.5.
    const landmarks = makeLandmarks(
      {
        right_shoulder: { x: 0.0, y: 0.0, visibility: 0.5 },
        right_elbow: { x: 0.0, y: 1.0, visibility: 0.5 },
        right_wrist: { x: 1.0, y: 1.0, visibility: 0.5 },
      },
      1
    );
    const out = jointAngleCalculator(landmarks);
    expect(out.right_elbow).not.toBeNull();
    expect(out.right_elbow).toBeCloseTo(90, 5);
  });

  it('returns null when an entire side is invisible', () => {
    const landmarks = makeLandmarks(
      {
        left_shoulder: { visibility: 0.1 },
        left_elbow: { visibility: 0.1 },
        left_wrist: { visibility: 0.1 },
      },
      1
    );
    const out = jointAngleCalculator(landmarks);
    expect(out.left_elbow).toBeNull();
  });

  it('returns null for all joints when given empty/missing landmarks', () => {
    const out = jointAngleCalculator([]);
    for (const s of JOINT_SPECS) {
      expect(out[s.joint]).toBeNull();
    }
  });

  it('returns null for back when a required midpoint landmark is hidden', () => {
    // back needs mid_shoulder (L+R shoulder), mid_hip (L+R hip), mid_knee (L+R knee).
    const landmarks = makePose('right_knee', 90).map((k) => ({ ...k }));
    landmarks[idx('left_knee')] = { ...landmarks[idx('left_knee')], visibility: 0.2 };
    const out = jointAngleCalculator(landmarks);
    expect(out.back).toBeNull();
  });

  it('uses the shoulder fallback ray so a shoulder angle is computable without a hip', () => {
    // left_shoulder spec: a=left_elbow, b=left_shoulder, c=left_hip.
    // If left_hip is hidden, fallbackKp synthesizes c below the vertex → finite angle.
    const landmarks = makeLandmarks(
      {
        left_elbow: { x: 0.365, y: 0.41 },
        left_shoulder: { x: 0.40, y: 0.27 },
        left_hip: { x: 0.44, y: 0.56, visibility: 0.1 }, // hidden
      },
      1
    );
    const out = jointAngleCalculator(landmarks);
    expect(out.left_shoulder).not.toBeNull();
    expect(Number.isFinite(out.left_shoulder)).toBe(true);
  });

  it('returns numbers or null only (never undefined) for every joint', () => {
    const out = jointAngleCalculator(makePose('right_knee', 90));
    for (const s of JOINT_SPECS) {
      const v = out[s.joint];
      expect(v === null || typeof v === 'number').toBe(true);
    }
  });
});
