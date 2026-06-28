import {
  candidateJoints,
  selectRepJoints,
  buildReferenceTrajectory,
  buildReferenceMotion,
  buildAlternatingReferenceMotion,
} from '../../Therapist/shared/ai/MultiJointMotion.js';

// MultiJointMotion.js is a PURE module (no imports), so no mocking is needed.
// Constants from source: MIN_RANGE_DEG = 15, KEEP_RATIO = 0.45, MAX_REP_JOINTS = 4.

describe('candidateJoints', () => {
  it('defaults to the full body region when called with no argument', () => {
    const joints = candidateJoints();
    expect(Array.isArray(joints)).toBe(true);
    expect(joints).toEqual(
      expect.arrayContaining([
        'back', 'neck',
        'left_shoulder', 'right_shoulder',
        'left_elbow', 'right_elbow',
        'left_hip', 'right_hip',
        'left_knee', 'right_knee',
        'left_ankle', 'right_ankle',
      ]),
    );
    expect(joints).toHaveLength(12);
  });

  it('narrows the joint set for a specific region (upper)', () => {
    const upper = candidateJoints('upper');
    expect(upper).toEqual(['neck', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow']);
    // upper is a strict subset of full and does not contain leg joints
    expect(upper).not.toContain('left_knee');
    expect(upper).not.toContain('right_hip');
  });

  it('narrows the joint set for the lower region', () => {
    const lower = candidateJoints('lower');
    expect(lower).toEqual(['left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle']);
    expect(lower).not.toContain('neck');
  });

  it('returns a single-side set for left_arm / right_leg', () => {
    expect(candidateJoints('left_arm')).toEqual(['left_shoulder', 'left_elbow']);
    expect(candidateJoints('right_leg')).toEqual(['right_hip', 'right_knee', 'right_ankle']);
  });

  it('resolves body-region aliases to full', () => {
    const full = candidateJoints('full');
    expect(candidateJoints('whole')).toEqual(full);
    expect(candidateJoints('whole_body')).toEqual(full);
    expect(candidateJoints('full_body')).toEqual(full);
  });

  it('falls back to the full set for an unknown region', () => {
    expect(candidateJoints('does_not_exist')).toEqual(candidateJoints('full'));
  });
});

describe('selectRepJoints', () => {
  it('selects a joint moving >= 15deg and marks the largest mover as dominant', () => {
    const rest = { left_knee: 170, left_hip: 175, left_ankle: 90 };
    const target = { left_knee: 90, left_hip: 178, left_ankle: 92 }; // knee moves 80, hip 3, ankle 2
    const result = selectRepJoints(rest, target, 'lower', 'left');

    expect(result.repJoints).toContain('left_knee');
    expect(result.dominantJoint).toBe('left_knee');
    // hip (3deg) and ankle (2deg) are below MIN_RANGE_DEG and excluded
    expect(result.repJoints).not.toContain('left_hip');
    expect(result.repJoints).not.toContain('left_ankle');
  });

  it('excludes joints that move less than MIN_RANGE_DEG (15)', () => {
    const rest = { left_elbow: 100, left_shoulder: 30 };
    const target = { left_elbow: 114, left_shoulder: 90 }; // elbow 14 (< 15) excluded, shoulder 60 kept
    const result = selectRepJoints(rest, target, 'left_arm', 'left');

    expect(result.repJoints).toContain('left_shoulder');
    expect(result.repJoints).not.toContain('left_elbow');
  });

  it('includes a joint moving exactly 15deg (boundary, inclusive)', () => {
    const rest = { left_elbow: 100 };
    const target = { left_elbow: 115 }; // exactly 15
    const result = selectRepJoints(rest, target, 'left_arm', 'left');
    expect(result.repJoints).toContain('left_elbow');
    expect(result.dominantJoint).toBe('left_elbow');
  });

  it('returns the full candidate jointPool that was considered', () => {
    const rest = { left_knee: 170 };
    const target = { left_knee: 90 };
    const result = selectRepJoints(rest, target, 'lower');
    expect(result.jointPool).toEqual(candidateJoints('lower'));
  });

  it('never selects more than MAX_REP_JOINTS (4)', () => {
    // Six lower joints all moving a large, similar amount.
    const rest = {
      left_hip: 0, right_hip: 0, left_knee: 0, right_knee: 0, left_ankle: 0, right_ankle: 0,
    };
    const target = {
      left_hip: 80, right_hip: 82, left_knee: 84, right_knee: 86, left_ankle: 88, right_ankle: 90,
    };
    const result = selectRepJoints(rest, target, 'lower');
    expect(result.repJoints.length).toBeLessThanOrEqual(4);
    expect(result.repJoints.length).toBe(4);
  });

  it('drops joints below the KEEP_RATIO cutoff relative to the dominant mover', () => {
    // dominant moves 100deg; cutoff = max(15, 100 * 0.45) = 45.
    const rest = { left_knee: 0, left_hip: 0, left_ankle: 0 };
    const target = { left_knee: 100, left_hip: 40, left_ankle: 20 };
    // knee 100 kept; hip 40 (< 45) dropped; ankle 20 (< 45 but >= 15 so present in motions) dropped from selection.
    const result = selectRepJoints(rest, target, 'left_leg', 'left');
    expect(result.repJoints).toEqual(['left_knee']);
    // motions still records every joint that passed the >= 15 filter
    const motionJoints = result.motions.map((m) => m.joint);
    expect(motionJoints).toContain('left_knee');
    expect(motionJoints).toContain('left_hip');
    expect(motionJoints).toContain('left_ankle');
  });

  it('honors the side filter, ignoring joints on the other side', () => {
    const rest = { left_knee: 0, right_knee: 0 };
    const target = { left_knee: 80, right_knee: 90 };
    const result = selectRepJoints(rest, target, 'lower', 'left');
    expect(result.repJoints).toContain('left_knee');
    expect(result.repJoints).not.toContain('right_knee');
    expect(result.motions.every((m) => m.joint.startsWith('left_'))).toBe(true);
  });

  it('biases selection toward preferredJoints and bypasses the 15deg threshold for them', () => {
    // left_elbow moves only 5deg; without preferred it would be excluded, but as a
    // preferred joint with finite rest/target it is kept.
    const rest = { left_elbow: 100, left_shoulder: 30 };
    const target = { left_elbow: 105, left_shoulder: 90 };
    const result = selectRepJoints(rest, target, 'left_arm', null, ['left_shoulder', 'left_elbow']);

    expect(result.jointPool).toEqual(['left_shoulder', 'left_elbow']);
    expect(result.repJoints).toEqual(expect.arrayContaining(['left_shoulder', 'left_elbow']));
    // preferred order drives the result ordering
    expect(result.repJoints[0]).toBe('left_shoulder');
  });

  it('returns empty repJoints and null dominantJoint when nothing moves enough', () => {
    const rest = { left_knee: 100, left_hip: 100 };
    const target = { left_knee: 105, left_hip: 103 }; // 5 and 3 deg, both < 15
    const result = selectRepJoints(rest, target, 'lower', 'left');
    expect(result.repJoints).toEqual([]);
    expect(result.dominantJoint).toBeNull();
  });

  it('ignores joints with non-finite (missing) rest or target angles', () => {
    const rest = { left_knee: 170 }; // left_hip missing
    const target = { left_knee: 90, left_hip: 30 };
    const result = selectRepJoints(rest, target, 'lower', 'left');
    expect(result.repJoints).toContain('left_knee');
    expect(result.repJoints).not.toContain('left_hip');
  });
});

describe('buildReferenceMotion', () => {
  it('builds a motion object with the expected fields for a clearly moving joint', () => {
    const restAngles = { left_knee: 170, left_hip: 175, right_knee: 170 };
    const targetAngles = { left_knee: 90, left_hip: 176, right_knee: 92 };
    const motion = buildReferenceMotion({
      exercise: { bodyRegion: 'lower' },
      restAngles,
      targetAngles,
      restLandmarks: [{ x: 0 }],
      targetLandmarks: [{ x: 1 }],
    });

    expect(motion.repJoints.length).toBeGreaterThan(0);
    expect(motion.repJoints).toEqual(expect.arrayContaining(['left_knee', 'right_knee']));
    expect(motion.dominantJoint).toBeTruthy();
    expect(motion.primaryJoint).toBe(motion.dominantJoint);
    expect(motion.primaryJoints).toEqual(motion.repJoints);
    expect(motion.repMode).toBe('multi'); // two rep joints
    expect(motion.jointMotion).toBeDefined();
    expect(motion.jointMotion[motion.dominantJoint]).toMatchObject({
      role: expect.any(String),
      weight: expect.any(Number),
    });
    expect(motion.restJointAngles).toBe(restAngles);
    expect(motion.targetJointAngles).toBe(targetAngles);
    expect(motion.restLandmarks).toEqual([{ x: 0 }]);
    expect(motion.targetLandmarks).toEqual([{ x: 1 }]);
    expect(motion.jointRoles).toBeDefined();
    // dominant knee flexes from 170 -> 90, so direction is 'down'
    expect(motion.dir).toBe('down');
    expect(motion.restAngle).toBe(170);
  });

  it('sets repMode to single when only one joint qualifies', () => {
    const motion = buildReferenceMotion({
      exercise: { bodyRegion: 'left_leg', movementPattern: 'unilateral' },
      restAngles: { left_knee: 170, left_hip: 175, left_ankle: 90 },
      targetAngles: { left_knee: 90, left_hip: 176, left_ankle: 91 },
    });
    expect(motion.repJoints).toEqual(['left_knee']);
    expect(motion.repMode).toBe('single');
    expect(motion.movementPattern).toBe('unilateral');
  });

  it('assigns primary_motion role to the dominant joint', () => {
    const motion = buildReferenceMotion({
      exercise: { bodyRegion: 'left_leg' },
      restAngles: { left_knee: 170 },
      targetAngles: { left_knee: 90 },
    });
    const dom = motion.dominantJoint;
    expect(motion.jointRoles[dom].role).toBe('primary_motion');
    expect(motion.jointRoles[dom].contributesToProgress).toBe(true);
  });

  it('throws insufficient-motion when no joint moves >= 15deg (rest == target)', () => {
    const angles = { left_knee: 120, left_hip: 95, right_knee: 120 };
    expect(() => buildReferenceMotion({
      exercise: { bodyRegion: 'lower' },
      restAngles: angles,
      targetAngles: { ...angles },
    })).toThrow('insufficient-motion');
  });

  it('attaches code "insufficient-motion" on the thrown error', () => {
    let caught = null;
    try {
      buildReferenceMotion({
        exercise: { bodyRegion: 'lower' },
        restAngles: { left_knee: 120 },
        targetAngles: { left_knee: 122 }, // 2deg < 15
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('insufficient-motion');
  });
});

describe('buildAlternatingReferenceMotion', () => {
  it('builds an alternating motion across both sides', () => {
    const restAngles = { left_knee: 170, right_knee: 170 };
    const motion = buildAlternatingReferenceMotion({
      exercise: { bodyRegion: 'lower' },
      restAngles,
      leftTargetAngles: { left_knee: 90, right_knee: 170 },
      rightTargetAngles: { left_knee: 170, right_knee: 90 },
      restLandmarks: [{ x: 0 }],
      leftTargetLandmarks: [{ x: 1 }],
      rightTargetLandmarks: [{ x: 2 }],
    });

    expect(motion.movementPattern).toBe('alternating');
    expect(motion.repMode).toBe('alternating');
    expect(motion.alternatingSides).toEqual(['left', 'right']);
    expect(motion.repJoints).toEqual(expect.arrayContaining(['left_knee', 'right_knee']));
    expect(motion.sideMotions.left).toBeDefined();
    expect(motion.sideMotions.right).toBeDefined();
    expect(motion.sideMotions.left.dominantJoint).toBe('left_knee');
    expect(motion.sideMotions.right.dominantJoint).toBe('right_knee');
    expect(motion.targetJointAnglesBySide.left).toEqual({ left_knee: 90, right_knee: 170 });
  });

  it('throws insufficient-motion with a .side when one side has no motion', () => {
    let caught = null;
    try {
      buildAlternatingReferenceMotion({
        exercise: { bodyRegion: 'lower' },
        restAngles: { left_knee: 170, right_knee: 170 },
        leftTargetAngles: { left_knee: 171, right_knee: 170 }, // left moves only 1deg
        rightTargetAngles: { left_knee: 170, right_knee: 90 },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('insufficient-motion');
    expect(caught.side).toBe('left');
  });
});

describe('buildReferenceTrajectory', () => {
  // A simple knee flexion exercise: rest 170 -> target 90.
  const baseMotion = () => buildReferenceMotion({
    exercise: { bodyRegion: 'left_leg' },
    restAngles: { left_knee: 170 },
    targetAngles: { left_knee: 90 },
  });

  const frames = [
    { t: 0, jointAngles: { left_knee: 170 } },
    { t: 500, jointAngles: { left_knee: 130 } },
    { t: 1000, jointAngles: { left_knee: 90 } },
  ];

  it('returns a trajectory object with the documented shape', () => {
    const traj = buildReferenceTrajectory({ frames, motion: baseMotion() });
    expect(traj).not.toBeNull();
    expect(traj.version).toBe(1);
    expect(traj.kind).toBe('angle-trajectory');
    expect(traj.cycle).toBe('rest-target');
    expect(traj.durationMs).toBe(1000);
    expect(traj.sampleCount).toBe(traj.frames.length);
    expect(traj.repJoints).toEqual(['left_knee']);
    expect(traj.dominantJoint).toBe('left_knee');
    expect(Array.isArray(traj.frames)).toBe(true);
  });

  it('normalizes progress so the first frame is 0 and the last is 1', () => {
    const traj = buildReferenceTrajectory({ frames, motion: baseMotion() });
    expect(traj.frames[0].p).toBe(0);
    expect(traj.frames[traj.frames.length - 1].p).toBe(1);
    // each sampled frame carries a time and per-joint angle map
    expect(traj.frames[0].t).toBe(0);
    expect(traj.frames[0].angles.left_knee).toBeCloseTo(170);
  });

  it('emits a version 2 rest-target-rest cycle when a target frame is given', () => {
    const fullCycle = [
      { t: 0, jointAngles: { left_knee: 170 } },
      { t: 500, jointAngles: { left_knee: 90 } },
      { t: 1000, jointAngles: { left_knee: 170 } },
    ];
    const traj = buildReferenceTrajectory({
      frames: fullCycle,
      motion: baseMotion(),
      targetFrameIndex: 1,
    });
    expect(traj.version).toBe(2);
    expect(traj.cycle).toBe('rest-target-rest');
    expect(traj.targetAtMs).toBe(500);
    expect(traj.targetSampleIndex).not.toBeNull();
    expect(traj.frames[traj.targetSampleIndex].p).toBe(1);
    expect(traj.phases).toEqual({ restStartMs: 0, targetMs: 500, restEndMs: 1000 });
  });

  it('respects maxSamples by compacting frames', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      t: i * 100,
      jointAngles: { left_knee: 170 - i * 4 },
    }));
    const traj = buildReferenceTrajectory({ frames: many, motion: baseMotion(), maxSamples: 5 });
    expect(traj.sampleCount).toBeLessThanOrEqual(5);
  });

  it('returns null when there are fewer than 2 frames', () => {
    const traj = buildReferenceTrajectory({
      frames: [{ t: 0, jointAngles: { left_knee: 170 } }],
      motion: baseMotion(),
    });
    expect(traj).toBeNull();
  });

  it('returns null when the motion has no rep joints', () => {
    const traj = buildReferenceTrajectory({ frames, motion: { repJoints: [], jointMotion: {} } });
    expect(traj).toBeNull();
  });
});
