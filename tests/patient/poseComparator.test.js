// Tests for Patient AI · PoseComparator (rule-based per-joint angle comparison).
import {
  DEFAULT_TOLERANCE,
  JOINT_TOLERANCE,
  poseComparator,
  scoreTone,
} from '../../Patient/src/ai/PoseComparator.js';
import { JOINT_SPECS } from '../../Patient/src/ai/JointAngleCalculator.js';

// All tracked joint names, in canonical order.
const ALL_JOINTS = JOINT_SPECS.map((s) => s.joint);

// Build a {joint: value} map covering every joint with the same value.
function uniformAngles(value) {
  const out = {};
  for (const j of ALL_JOINTS) out[j] = value;
  return out;
}

describe('PoseComparator · constants', () => {
  it('DEFAULT_TOLERANCE is 15', () => {
    expect(DEFAULT_TOLERANCE).toBe(15);
  });

  it('JOINT_TOLERANCE has elbows at 12 (tighter, clinical)', () => {
    expect(JOINT_TOLERANCE.left_elbow).toBe(12);
    expect(JOINT_TOLERANCE.right_elbow).toBe(12);
  });

  it('JOINT_TOLERANCE has back and neck at 12', () => {
    expect(JOINT_TOLERANCE.back).toBe(12);
    expect(JOINT_TOLERANCE.neck).toBe(12);
  });

  it('JOINT_TOLERANCE has shoulders/hips/knees/ankles at 15', () => {
    for (const j of [
      'left_shoulder', 'right_shoulder',
      'left_hip', 'right_hip',
      'left_knee', 'right_knee',
      'left_ankle', 'right_ankle',
    ]) {
      expect(JOINT_TOLERANCE[j]).toBe(15);
    }
  });
});

describe('poseComparator · identical poses', () => {
  it('identical ref & live angles → score 100, all joints status ok', () => {
    const angles = uniformAngles(90);
    const res = poseComparator(angles, angles);

    expect(res.score).toBe(100);
    expect(res.validCount).toBe(ALL_JOINTS.length);
    // joints array always contains one row per spec, in order.
    expect(res.joints).toHaveLength(JOINT_SPECS.length);
    for (const row of res.joints) {
      expect(row.status).toBe('ok');
      expect(row.delta).toBe(0);
      expect(row.score).toBe(100);
    }
  });

  it('each joint row carries joint/label/labelTh/ref/live/tol metadata', () => {
    const angles = uniformAngles(45);
    const res = poseComparator(angles, angles);
    const first = res.joints[0];
    expect(first.joint).toBe(JOINT_SPECS[0].joint);
    expect(first.label).toBe(JOINT_SPECS[0].label);
    expect(first.labelTh).toBe(JOINT_SPECS[0].labelTh);
    expect(first.ref).toBe(45);
    expect(first.live).toBe(45);
    // left_elbow tolerance is 12.
    expect(first.joint).toBe('left_elbow');
    expect(first.tol).toBe(12);
  });
});

describe('poseComparator · per-joint status thresholds', () => {
  // Use only the left_knee joint (tol = 15) so the overall result reflects it.
  function singleJoint(joint, refVal, liveVal) {
    return poseComparator({ [joint]: refVal }, { [joint]: liveVal });
  }

  it('delta exactly == tol → boundary "ok"', () => {
    const tol = JOINT_TOLERANCE.left_knee; // 15
    const res = singleJoint('left_knee', 90, 90 + tol); // delta = 15
    const row = res.joints.find((r) => r.joint === 'left_knee');
    expect(row.delta).toBe(tol);
    expect(row.status).toBe('ok');
  });

  it('delta just over tol but <= 2*tol → "warn"', () => {
    const tol = JOINT_TOLERANCE.left_knee; // 15
    const res = singleJoint('left_knee', 90, 90 + tol + 1); // delta = 16
    const row = res.joints.find((r) => r.joint === 'left_knee');
    expect(row.delta).toBe(tol + 1);
    expect(row.status).toBe('warn');
  });

  it('delta exactly == 2*tol → still "warn" (boundary)', () => {
    const tol = JOINT_TOLERANCE.left_knee; // 15
    const res = singleJoint('left_knee', 90, 90 + tol * 2); // delta = 30
    const row = res.joints.find((r) => r.joint === 'left_knee');
    expect(row.delta).toBe(tol * 2);
    expect(row.status).toBe('warn');
  });

  it('delta > 2*tol → "bad"', () => {
    const tol = JOINT_TOLERANCE.left_knee; // 15
    const res = singleJoint('left_knee', 90, 90 + tol * 2 + 1); // delta = 31
    const row = res.joints.find((r) => r.joint === 'left_knee');
    expect(row.delta).toBe(tol * 2 + 1);
    expect(row.status).toBe('bad');
  });
});

describe('poseComparator · per-joint score formula clamp(1 - delta/(tol*3))*100', () => {
  it('delta == tol → score 1 - 1/3 = 66.66...', () => {
    const tol = JOINT_TOLERANCE.left_knee; // 15
    const res = poseComparator({ left_knee: 90 }, { left_knee: 90 + tol });
    const row = res.joints.find((r) => r.joint === 'left_knee');
    const expected = Math.max(0, 1 - tol / (tol * 3)) * 100; // 66.666...
    expect(row.score).toBeCloseTo(expected, 6);
    expect(row.score).toBeCloseTo(66.6666667, 5);
  });

  it('delta == tol*3 → score clamps to 0 (not negative)', () => {
    const tol = JOINT_TOLERANCE.left_knee; // 15
    const res = poseComparator({ left_knee: 0 }, { left_knee: tol * 3 });
    const row = res.joints.find((r) => r.joint === 'left_knee');
    expect(row.score).toBe(0);
  });

  it('delta > tol*3 → score still clamps to 0', () => {
    const tol = JOINT_TOLERANCE.left_knee; // 15
    const res = poseComparator({ left_knee: 0 }, { left_knee: tol * 5 });
    const row = res.joints.find((r) => r.joint === 'left_knee');
    expect(row.score).toBe(0);
    expect(row.status).toBe('bad');
  });

  it('delta is computed as absolute difference (live below ref)', () => {
    const res = poseComparator({ left_knee: 100 }, { left_knee: 80 });
    const row = res.joints.find((r) => r.joint === 'left_knee');
    expect(row.delta).toBe(20);
  });

  it('overall score is the rounded mean over valid joints', () => {
    // Two joints: left_knee delta 0 (score 100), right_knee delta 15 (tol 15 → 66.66)
    const ref = { left_knee: 90, right_knee: 90 };
    const live = { left_knee: 90, right_knee: 105 };
    const res = poseComparator(ref, live);
    const expectedMean = (100 + (1 - 15 / 45) * 100) / 2; // (100 + 66.66)/2 = 83.33
    expect(res.score).toBe(Math.round(expectedMean)); // 83
    expect(res.validCount).toBe(2);
  });
});

describe('poseComparator · primary (worst joint by delta/tol ratio)', () => {
  it('primary is the joint with the largest delta/tol ratio', () => {
    // left_elbow tol 12: delta 24 → ratio 2.0
    // left_knee tol 15: delta 24 → ratio 1.6
    const ref = { left_elbow: 90, left_knee: 90 };
    const live = { left_elbow: 114, left_knee: 114 };
    const res = poseComparator(ref, live);
    expect(res.primary).not.toBeNull();
    expect(res.primary.joint).toBe('left_elbow');
  });

  it('primary equals the single valid joint when only one is comparable', () => {
    const res = poseComparator({ right_hip: 90 }, { right_hip: 120 });
    expect(res.primary).not.toBeNull();
    expect(res.primary.joint).toBe('right_hip');
    expect(res.primary.delta).toBe(30);
  });

  it('primary is a row object present in the joints array', () => {
    const ref = { left_knee: 90, right_knee: 90 };
    const live = { left_knee: 90, right_knee: 130 };
    const res = poseComparator(ref, live);
    expect(res.primary.joint).toBe('right_knee');
    expect(res.joints).toContain(res.primary);
  });
});

describe('poseComparator · missing / null joints are skipped', () => {
  it('joint null in ref is skipped (not counted)', () => {
    const ref = { left_knee: null, right_knee: 90 };
    const live = { left_knee: 90, right_knee: 90 };
    const res = poseComparator(ref, live);
    expect(res.validCount).toBe(1);
    const skipped = res.joints.find((r) => r.joint === 'left_knee');
    expect(skipped.status).toBe('none');
    expect(skipped.delta).toBeNull();
    expect(skipped.score).toBeNull();
  });

  it('joint null in live is skipped', () => {
    const ref = { left_knee: 90 };
    const live = { left_knee: null };
    const res = poseComparator(ref, live);
    expect(res.validCount).toBe(0);
    const skipped = res.joints.find((r) => r.joint === 'left_knee');
    expect(skipped.status).toBe('none');
  });

  it('joints absent from the maps are treated as null and skipped', () => {
    // Only one joint provided; the other 11 are undefined → skipped.
    const res = poseComparator({ back: 170 }, { back: 170 });
    expect(res.validCount).toBe(1);
    expect(res.joints).toHaveLength(JOINT_SPECS.length);
    const back = res.joints.find((r) => r.joint === 'back');
    expect(back.status).toBe('ok');
    // A non-provided joint row: absent keys read back as undefined.
    const other = res.joints.find((r) => r.joint === 'left_elbow');
    expect(other.ref).toBeUndefined();
    expect(other.live).toBeUndefined();
    expect(other.status).toBe('none');
    expect(other.delta).toBeNull();
    expect(other.score).toBeNull();
  });

  it('no comparable joints → score null, validCount 0, primary null', () => {
    const res = poseComparator({}, {});
    expect(res.score).toBeNull();
    expect(res.validCount).toBe(0);
    expect(res.primary).toBeNull();
    expect(res.joints).toHaveLength(JOINT_SPECS.length);
  });

  it('null refAngles / liveAngles arguments → all joints skipped', () => {
    const res = poseComparator(null, null);
    expect(res.score).toBeNull();
    expect(res.validCount).toBe(0);
    expect(res.primary).toBeNull();
    for (const row of res.joints) {
      expect(row.ref).toBeNull();
      expect(row.live).toBeNull();
      expect(row.status).toBe('none');
    }
  });
});

describe('poseComparator · tolOverride', () => {
  it('tolOverride widens tolerance so a previously-warn joint becomes ok', () => {
    // delta 20, default knee tol 15 → warn. Override tol to 25 → ok.
    const ref = { left_knee: 90 };
    const live = { left_knee: 110 };
    const base = poseComparator(ref, live);
    expect(base.joints.find((r) => r.joint === 'left_knee').status).toBe('warn');

    const overridden = poseComparator(ref, live, { left_knee: 25 });
    const row = overridden.joints.find((r) => r.joint === 'left_knee');
    expect(row.tol).toBe(25);
    expect(row.status).toBe('ok'); // delta 20 <= 25
  });

  it('tolOverride tightens tolerance so an ok joint becomes worse', () => {
    // delta 12, default knee tol 15 → ok. Override tol to 5 → delta 12 > 2*5 (10) → bad.
    const ref = { left_knee: 90 };
    const live = { left_knee: 102 };
    const base = poseComparator(ref, live);
    expect(base.joints.find((r) => r.joint === 'left_knee').status).toBe('ok');

    const overridden = poseComparator(ref, live, { left_knee: 5 });
    const row = overridden.joints.find((r) => r.joint === 'left_knee');
    expect(row.tol).toBe(5);
    expect(row.status).toBe('bad'); // delta 12 > 2*5
  });

  it('tolOverride only affects the specified joint', () => {
    const ref = { left_knee: 90, right_knee: 90 };
    const live = { left_knee: 110, right_knee: 110 };
    const res = poseComparator(ref, live, { left_knee: 25 });
    expect(res.joints.find((r) => r.joint === 'left_knee').tol).toBe(25);
    // right_knee falls back to JOINT_TOLERANCE.
    expect(res.joints.find((r) => r.joint === 'right_knee').tol).toBe(15);
  });

  it('tolOverride affects the per-joint score via the formula', () => {
    const ref = { left_knee: 90 };
    const live = { left_knee: 120 }; // delta 30
    const tol = 30;
    const res = poseComparator(ref, live, { left_knee: tol });
    const row = res.joints.find((r) => r.joint === 'left_knee');
    const expected = Math.max(0, 1 - 30 / (tol * 3)) * 100; // 1 - 30/90 = 66.66
    expect(row.score).toBeCloseTo(expected, 6);
  });
});

describe('scoreTone', () => {
  it('null → "none"', () => {
    expect(scoreTone(null)).toBe('none');
  });

  it('undefined → "none"', () => {
    expect(scoreTone(undefined)).toBe('none');
  });

  it('score 100 → "good"', () => {
    expect(scoreTone(100)).toBe('good');
  });

  it('score exactly 75 → "good" (boundary)', () => {
    expect(scoreTone(75)).toBe('good');
  });

  it('score 74.999 → "warn" (just below good)', () => {
    expect(scoreTone(74.999)).toBe('warn');
  });

  it('score exactly 50 → "warn" (boundary)', () => {
    expect(scoreTone(50)).toBe('warn');
  });

  it('score 49.999 → "bad" (just below warn)', () => {
    expect(scoreTone(49.999)).toBe('bad');
  });

  it('score 0 → "bad"', () => {
    expect(scoreTone(0)).toBe('bad');
  });

  it('integrates with poseComparator output (identical poses → "good")', () => {
    const angles = uniformAngles(90);
    const res = poseComparator(angles, angles);
    expect(scoreTone(res.score)).toBe('good');
  });

  it('integrates with poseComparator null score → "none"', () => {
    const res = poseComparator({}, {});
    expect(scoreTone(res.score)).toBe('none');
  });
});
