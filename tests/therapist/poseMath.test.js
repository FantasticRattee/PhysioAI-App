// PhysioAI · Therapist pose-math unit tests.
//
// Targets the two pure-math AI modules that turn BlazePose landmarks into joint
// angles and compare a live pose to a reference:
//   - JointAngleCalculator.js  (angleAt, jointAngleCalculator, JOINT_SPECS)
//   - PoseComparator.js        (poseComparator, scoreTone, DEFAULT_TOLERANCE, JOINT_TOLERANCE)
//
// Both transitively import ./PoseDetection.js (MediaPipe / browser-only), so we
// mock it with just the landmark schema the math actually needs (LANDMARK_NAMES + idx).

jest.mock('../../Therapist/shared/ai/PoseDetection.js', () => {
  const LANDMARK_NAMES = [
    'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
    'right_eye_inner', 'right_eye', 'right_eye_outer',
    'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
    'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
    'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
    'left_index', 'right_index', 'left_thumb', 'right_thumb',
    'left_hip', 'right_hip', 'left_knee', 'right_knee',
    'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
    'left_foot_index', 'right_foot_index',
  ];
  return { LANDMARK_NAMES, idx: (n) => LANDMARK_NAMES.indexOf(n) };
});

import {
  angleAt,
  jointAngleCalculator,
  JOINT_SPECS,
} from '../../Therapist/shared/ai/JointAngleCalculator.js';
import {
  poseComparator,
  scoreTone,
  DEFAULT_TOLERANCE,
  JOINT_TOLERANCE,
} from '../../Therapist/shared/ai/PoseComparator.js';

// ─── Landmark schema (mirrors the mock above) ───────────────
const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];
const idx = (name) => LANDMARK_NAMES.indexOf(name);

/** Build a 33-length landmark array; entries default to a fully-visible point at origin. */
function makeLandmarks(overrides = {}) {
  const lm = LANDMARK_NAMES.map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  for (const [name, kp] of Object.entries(overrides)) {
    lm[idx(name)] = { x: 0, y: 0, z: 0, visibility: 1, ...kp };
  }
  return lm;
}

describe('angleAt', () => {
  it('returns ~90° for a right angle', () => {
    // rays b→a along +x, b→c along +y
    const deg = angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 });
    expect(deg).toBeCloseTo(90, 5);
  });

  it('returns ~180° for a straight line', () => {
    const deg = angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: -1, y: 0 });
    expect(deg).toBeCloseTo(180, 5);
  });

  it('returns ~0° when both rays point the same direction', () => {
    const deg = angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(deg).toBeCloseTo(0, 5);
  });

  it('returns ~45° for a 45-degree angle', () => {
    const deg = angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(deg).toBeCloseTo(45, 5);
  });

  it('is unsigned — mirror image gives the same magnitude', () => {
    const up = angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 });
    const down = angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: -1 });
    expect(down).toBeCloseTo(up, 5);
  });

  it('returns null when the b→a ray is a zero vector (a === b)', () => {
    expect(angleAt({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeNull();
  });

  it('returns null when the b→c ray is a zero vector (c === b)', () => {
    expect(angleAt({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });
});

describe('JOINT_SPECS', () => {
  const expectedJoints = [
    'left_elbow', 'right_elbow', 'left_shoulder', 'right_shoulder',
    'left_hip', 'right_hip', 'left_knee', 'right_knee',
    'left_ankle', 'right_ankle', 'back', 'neck',
  ];

  it('lists exactly the 12 expected tracked joints in order', () => {
    expect(JOINT_SPECS.map((s) => s.joint)).toEqual(expectedJoints);
  });

  it('every spec exposes vertex b plus rays a/c and bilingual labels', () => {
    for (const s of JOINT_SPECS) {
      expect(s).toEqual(expect.objectContaining({
        joint: expect.any(String),
        a: expect.any(String),
        b: expect.any(String),
        c: expect.any(String),
        label: expect.any(String),
        labelTh: expect.any(String),
      }));
    }
  });

  it('encodes the elbow spec with shoulder→elbow→wrist', () => {
    const lElbow = JOINT_SPECS.find((s) => s.joint === 'left_elbow');
    expect(lElbow).toMatchObject({ a: 'left_shoulder', b: 'left_elbow', c: 'left_wrist' });
  });
});

describe('jointAngleCalculator', () => {
  it('computes a ~90° straight-up-then-out left elbow over 33 landmarks', () => {
    // shoulder above elbow (ray up), wrist right of elbow (ray right) → 90°
    const lm = makeLandmarks({
      left_shoulder: { x: 0, y: 0 },
      left_elbow: { x: 0, y: 1 },
      left_wrist: { x: 1, y: 1 },
    });
    const angles = jointAngleCalculator(lm);
    expect(angles.left_elbow).toBeCloseTo(90, 5);
  });

  it('computes a ~180° fully-extended right knee', () => {
    const lm = makeLandmarks({
      right_hip: { x: 0, y: 0 },
      right_knee: { x: 0, y: 1 },
      right_ankle: { x: 0, y: 2 },
    });
    const angles = jointAngleCalculator(lm);
    expect(angles.right_knee).toBeCloseTo(180, 5);
  });

  it('returns an entry for every tracked joint', () => {
    const lm = makeLandmarks();
    const angles = jointAngleCalculator(lm);
    expect(Object.keys(angles).sort()).toEqual(JOINT_SPECS.map((s) => s.joint).sort());
  });

  it('yields null for a joint when one of its keypoints is below MIN_VIS (0.5)', () => {
    const lm = makeLandmarks({
      left_shoulder: { x: 0, y: 0 },
      left_elbow: { x: 0, y: 1, visibility: 0.4 }, // vertex hidden
      left_wrist: { x: 1, y: 1 },
    });
    const angles = jointAngleCalculator(lm);
    expect(angles.left_elbow).toBeNull();
  });

  it('treats visibility exactly at the 0.5 threshold as visible', () => {
    // MIN_VIS check is `< 0.5`, so 0.5 stays visible.
    const lm = makeLandmarks({
      left_shoulder: { x: 0, y: 0, visibility: 0.5 },
      left_elbow: { x: 0, y: 1, visibility: 0.5 },
      left_wrist: { x: 1, y: 1, visibility: 0.5 },
    });
    const angles = jointAngleCalculator(lm);
    expect(angles.left_elbow).toBeCloseTo(90, 5);
  });

  it('computes derived midpoint joints (back) from mid_shoulder/mid_hip/mid_knee', () => {
    // mid_shoulder = (0,0), mid_hip = (0,1), mid_knee = (0,2) → straight back 180°
    const lm = makeLandmarks({
      left_shoulder: { x: -1, y: 0 }, right_shoulder: { x: 1, y: 0 },
      left_hip: { x: -1, y: 1 }, right_hip: { x: 1, y: 1 },
      left_knee: { x: -1, y: 2 }, right_knee: { x: 1, y: 2 },
    });
    const angles = jointAngleCalculator(lm);
    expect(angles.back).toBeCloseTo(180, 5);
  });

  it('returns null for back when a contributing hip is hidden', () => {
    const lm = makeLandmarks({
      left_shoulder: { x: -1, y: 0 }, right_shoulder: { x: 1, y: 0 },
      left_hip: { x: -1, y: 1, visibility: 0.2 }, right_hip: { x: 1, y: 1 },
      left_knee: { x: -1, y: 2 }, right_knee: { x: 1, y: 2 },
    });
    const angles = jointAngleCalculator(lm);
    expect(angles.back).toBeNull();
  });
});

describe('PoseComparator constants', () => {
  it('DEFAULT_TOLERANCE is 15', () => {
    expect(DEFAULT_TOLERANCE).toBe(15);
  });

  it('elbow tolerance is 12 (tighter, clinical)', () => {
    expect(JOINT_TOLERANCE.left_elbow).toBe(12);
    expect(JOINT_TOLERANCE.right_elbow).toBe(12);
  });

  it('most joints default to 15° tolerance', () => {
    expect(JOINT_TOLERANCE.left_shoulder).toBe(15);
    expect(JOINT_TOLERANCE.left_knee).toBe(15);
    expect(JOINT_TOLERANCE.left_hip).toBe(15);
    expect(JOINT_TOLERANCE.left_ankle).toBe(15);
  });

  it('back and neck are tightened to 12', () => {
    expect(JOINT_TOLERANCE.back).toBe(12);
    expect(JOINT_TOLERANCE.neck).toBe(12);
  });
});

describe('poseComparator', () => {
  // Build a full per-joint angle map from a single fill value.
  function anglesOf(fill) {
    const out = {};
    for (const s of JOINT_SPECS) out[s.joint] = fill;
    return out;
  }

  it('scores ~100 with every joint "ok" when ref === live', () => {
    const ref = anglesOf(90);
    const result = poseComparator(ref, anglesOf(90));
    expect(result.score).toBe(100);
    expect(result.validCount).toBe(JOINT_SPECS.length);
    for (const row of result.joints) {
      expect(row.status).toBe('ok');
      expect(row.delta).toBe(0);
      expect(row.score).toBe(100);
    }
  });

  it('returns the documented shape (score, joints, primary, validCount)', () => {
    const result = poseComparator(anglesOf(90), anglesOf(90));
    expect(result).toEqual(expect.objectContaining({
      score: expect.any(Number),
      joints: expect.any(Array),
      validCount: expect.any(Number),
    }));
    expect(result.primary).not.toBeNull();
    expect(result.joints).toHaveLength(JOINT_SPECS.length);
  });

  it('marks a joint "ok" when delta is at the tolerance boundary', () => {
    // left_shoulder tol = 15; delta exactly 15 → ok (delta <= tol)
    const ref = anglesOf(90);
    const live = { ...anglesOf(90), left_shoulder: 105 };
    const row = poseComparator(ref, live).joints.find((j) => j.joint === 'left_shoulder');
    expect(row.delta).toBe(15);
    expect(row.status).toBe('ok');
  });

  it('marks a joint "warn" just past tolerance', () => {
    // tol 15; delta 16 → warn (tol < delta <= 2*tol)
    const ref = anglesOf(90);
    const live = { ...anglesOf(90), left_shoulder: 106 };
    const row = poseComparator(ref, live).joints.find((j) => j.joint === 'left_shoulder');
    expect(row.delta).toBe(16);
    expect(row.status).toBe('warn');
  });

  it('marks a joint "warn" exactly at 2× tolerance', () => {
    // tol 15; delta 30 → still warn (delta <= 2*tol)
    const ref = anglesOf(90);
    const live = { ...anglesOf(90), left_shoulder: 120 };
    const row = poseComparator(ref, live).joints.find((j) => j.joint === 'left_shoulder');
    expect(row.delta).toBe(30);
    expect(row.status).toBe('warn');
  });

  it('marks a joint "bad" beyond 2× tolerance', () => {
    // tol 15; delta 31 → bad
    const ref = anglesOf(90);
    const live = { ...anglesOf(90), left_shoulder: 121 };
    const row = poseComparator(ref, live).joints.find((j) => j.joint === 'left_shoulder');
    expect(row.delta).toBe(31);
    expect(row.status).toBe('bad');
  });

  it('computes per-joint score = max(0, 1 - delta/(tol*3)) * 100', () => {
    // left_shoulder tol 15 → tol*3 = 45; delta 45 → score 0; delta 9 → 80
    const ref = anglesOf(90);
    const live1 = { ...anglesOf(90), left_shoulder: 135 }; // delta 45
    const r1 = poseComparator(ref, live1).joints.find((j) => j.joint === 'left_shoulder');
    expect(r1.score).toBeCloseTo(0, 5);

    const live2 = { ...anglesOf(90), left_shoulder: 99 }; // delta 9
    const r2 = poseComparator(ref, live2).joints.find((j) => j.joint === 'left_shoulder');
    expect(r2.score).toBeCloseTo(80, 5);
  });

  it('clamps per-joint score at 0 for very large deltas (never negative)', () => {
    const ref = anglesOf(90);
    const live = { ...anglesOf(90), left_shoulder: 300 }; // huge delta
    const row = poseComparator(ref, live).joints.find((j) => j.joint === 'left_shoulder');
    expect(row.score).toBe(0);
  });

  it('uses the elbow-specific tolerance of 12 from JOINT_TOLERANCE', () => {
    // delta 13 on an elbow (tol 12) → warn; same delta on shoulder (tol 15) → ok
    const ref = anglesOf(90);
    const live = { ...anglesOf(90), left_elbow: 103, left_shoulder: 103 };
    const joints = poseComparator(ref, live).joints;
    const elbow = joints.find((j) => j.joint === 'left_elbow');
    const shoulder = joints.find((j) => j.joint === 'left_shoulder');
    expect(elbow.tol).toBe(12);
    expect(elbow.status).toBe('warn');
    expect(shoulder.tol).toBe(15);
    expect(shoulder.status).toBe('ok');
  });

  it('honours a tolOverride for a specific joint', () => {
    // override left_knee to 5 → delta 10 becomes "warn" instead of "ok"
    const ref = anglesOf(90);
    const live = { ...anglesOf(90), left_knee: 100 }; // delta 10
    const row = poseComparator(ref, live, { left_knee: 5 })
      .joints.find((j) => j.joint === 'left_knee');
    expect(row.tol).toBe(5);
    expect(row.status).toBe('warn'); // 5 < 10 <= 10
  });

  it('selects primary as the joint with the worst delta/tol ratio', () => {
    const ref = anglesOf(90);
    // shoulder delta 30 / tol 15 = 2.0 ; elbow delta 30 / tol 12 = 2.5 (worse)
    const live = { ...anglesOf(90), left_shoulder: 120, left_elbow: 120 };
    const result = poseComparator(ref, live);
    expect(result.primary.joint).toBe('left_elbow');
  });

  it('omits a joint from scoring when ref is missing (status none)', () => {
    const ref = { ...anglesOf(90) };
    delete ref.left_elbow; // undefined → treated as null
    const result = poseComparator(ref, anglesOf(90));
    const row = result.joints.find((j) => j.joint === 'left_elbow');
    expect(row.status).toBe('none');
    expect(row.delta).toBeNull();
    expect(row.score).toBeNull();
    expect(result.validCount).toBe(JOINT_SPECS.length - 1);
  });

  it('omits a joint when live angle is null', () => {
    const live = { ...anglesOf(90), left_knee: null };
    const result = poseComparator(anglesOf(90), live);
    const row = result.joints.find((j) => j.joint === 'left_knee');
    expect(row.status).toBe('none');
    expect(result.validCount).toBe(JOINT_SPECS.length - 1);
  });

  it('returns score null and primary null when there are no valid joints', () => {
    const result = poseComparator(null, null);
    expect(result.score).toBeNull();
    expect(result.primary).toBeNull();
    expect(result.validCount).toBe(0);
    expect(result.joints).toHaveLength(JOINT_SPECS.length);
    for (const row of result.joints) expect(row.status).toBe('none');
  });

  it('rounds the overall score to an integer mean over valid joints', () => {
    // one joint off by 9 (shoulder tol15 → score 80), rest perfect (100)
    const ref = anglesOf(90);
    const live = { ...anglesOf(90), left_shoulder: 99 };
    const result = poseComparator(ref, live);
    const n = JOINT_SPECS.length;
    const expected = Math.round(((n - 1) * 100 + 80) / n);
    expect(result.score).toBe(expected);
  });
});

describe('scoreTone', () => {
  it("returns 'none' for null", () => {
    expect(scoreTone(null)).toBe('none');
  });

  it("returns 'none' for undefined", () => {
    expect(scoreTone(undefined)).toBe('none');
  });

  it("returns 'good' at and above 75", () => {
    expect(scoreTone(75)).toBe('good');
    expect(scoreTone(100)).toBe('good');
  });

  it("returns 'warn' from 50 up to (but not including) 75", () => {
    expect(scoreTone(50)).toBe('warn');
    expect(scoreTone(74)).toBe('warn');
  });

  it("returns 'bad' below 50", () => {
    expect(scoreTone(49)).toBe('bad');
    expect(scoreTone(0)).toBe('bad');
  });
});
