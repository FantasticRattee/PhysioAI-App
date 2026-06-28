import {
  candidateJoints,
  selectRepJoints,
  buildMotionConfig,
  evaluateMultiJointMotionFrame,
} from '../../Patient/src/ai/MultiJointMotion.js';

// ---------------------------------------------------------------------------
// candidateJoints
// ---------------------------------------------------------------------------
describe('candidateJoints', () => {
  it("returns a non-empty list for 'full' (default)", () => {
    const full = candidateJoints('full');
    expect(Array.isArray(full)).toBe(true);
    expect(full.length).toBeGreaterThan(0);
    // full includes torso + bilateral limb joints
    expect(full).toEqual(expect.arrayContaining(['back', 'neck', 'left_shoulder', 'right_knee']));
  });

  it('defaults to the full region when called with no argument', () => {
    expect(candidateJoints()).toEqual(candidateJoints('full'));
  });

  it('returns a proper subset for a specific region', () => {
    const full = candidateJoints('full');
    const leftArm = candidateJoints('left_arm');
    expect(leftArm).toEqual(['left_shoulder', 'left_elbow']);
    expect(leftArm.length).toBeLessThan(full.length);
    // every region joint is one of the recognised joint names
    for (const j of leftArm) {
      expect(typeof j).toBe('string');
    }
  });

  it('maps body-region aliases to full', () => {
    expect(candidateJoints('whole')).toEqual(candidateJoints('full'));
    expect(candidateJoints('whole_body')).toEqual(candidateJoints('full'));
    expect(candidateJoints('full_body')).toEqual(candidateJoints('full'));
  });

  it('falls back to full for an unknown region', () => {
    expect(candidateJoints('not_a_region')).toEqual(candidateJoints('full'));
  });

  it('returns expected joints for the lower region', () => {
    expect(candidateJoints('lower')).toEqual([
      'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
    ]);
  });
});

// ---------------------------------------------------------------------------
// selectRepJoints
// ---------------------------------------------------------------------------
describe('selectRepJoints', () => {
  it('selects only the joint that moves >= MIN_RANGE_DEG and ignores ~0 movers', () => {
    const rest = { left_elbow: 170, right_elbow: 90, left_knee: 90 };
    // left_elbow moves 80deg; the others move 0
    const target = { left_elbow: 90, right_elbow: 90, left_knee: 90 };
    const { repJoints, dominantJoint, motions } = selectRepJoints(rest, target, 'full');
    expect(repJoints).toEqual(['left_elbow']);
    expect(dominantJoint).toBe('left_elbow');
    // motions only contains joints that passed the finite + >=15deg filter
    expect(motions).toHaveLength(1);
    expect(motions[0]).toMatchObject({ joint: 'left_elbow', rest: 170, target: 90, range: 80 });
  });

  it('excludes joints whose range is below MIN_RANGE_DEG (15)', () => {
    const rest = { left_elbow: 100, right_elbow: 100 };
    // left_elbow moves 40 (kept); right_elbow moves 10 (below threshold)
    const target = { left_elbow: 60, right_elbow: 90 };
    const { repJoints, motions } = selectRepJoints(rest, target, 'full');
    expect(repJoints).toContain('left_elbow');
    expect(repJoints).not.toContain('right_elbow');
    expect(motions.map((m) => m.joint)).not.toContain('right_elbow');
  });

  it('treats exactly 15deg of motion as the inclusive boundary (kept)', () => {
    const rest = { left_knee: 100 };
    const target = { left_knee: 85 }; // exactly 15 deg
    const { repJoints, dominantJoint } = selectRepJoints(rest, target, 'full');
    expect(repJoints).toContain('left_knee');
    expect(dominantJoint).toBe('left_knee');
  });

  it('drops joints below the KEEP_RATIO (0.45) of the dominant range', () => {
    // dominant moves 100deg -> KEEP threshold = max(15, 45) = 45
    // left_knee moves 100 (kept), left_hip moves 30 (>=15 but < 45 -> dropped from repJoints)
    const rest = { left_knee: 180, left_hip: 180 };
    const target = { left_knee: 80, left_hip: 150 };
    const { repJoints, motions, dominantJoint } = selectRepJoints(rest, target, 'full');
    expect(dominantJoint).toBe('left_knee');
    expect(repJoints).toEqual(['left_knee']);
    // motions still records both joints (both passed the >=15 filter), sorted desc by range
    expect(motions.map((m) => m.joint)).toEqual(['left_knee', 'left_hip']);
  });

  it('keeps a joint that is exactly at the KEEP_RATIO boundary', () => {
    // dominant range 100 -> threshold 45. Second joint moves exactly 45.
    const rest = { left_knee: 180, left_hip: 180 };
    const target = { left_knee: 80, left_hip: 135 }; // 100 and 45
    const { repJoints } = selectRepJoints(rest, target, 'full');
    expect(repJoints).toEqual(expect.arrayContaining(['left_knee', 'left_hip']));
    expect(repJoints).toHaveLength(2);
  });

  it('returns at most MAX_REP_JOINTS (4) joints', () => {
    // six joints each moving the same large amount -> all pass ratio, capped at 4
    const rest = {
      left_hip: 180, right_hip: 180, left_knee: 180,
      right_knee: 180, left_ankle: 180, right_ankle: 180,
    };
    const target = {
      left_hip: 80, right_hip: 80, left_knee: 80,
      right_knee: 80, left_ankle: 80, right_ankle: 80,
    };
    const { repJoints, motions } = selectRepJoints(rest, target, 'lower');
    expect(repJoints).toHaveLength(4);
    // motions holds all six candidates that passed the threshold
    expect(motions).toHaveLength(6);
  });

  it('returns empty repJoints and null dominantJoint when nothing moves enough', () => {
    const rest = { left_elbow: 90, right_elbow: 90 };
    const target = { left_elbow: 95, right_elbow: 92 }; // tiny moves
    const { repJoints, motions, dominantJoint } = selectRepJoints(rest, target, 'full');
    expect(repJoints).toEqual([]);
    expect(motions).toEqual([]);
    expect(dominantJoint).toBeNull();
  });

  it('ignores joints with missing rest or target angles', () => {
    const rest = { left_elbow: 170 };
    const target = { left_elbow: 90, right_elbow: 90 }; // right_elbow has no rest
    const { repJoints, motions } = selectRepJoints(rest, target, 'full');
    expect(repJoints).toEqual(['left_elbow']);
    expect(motions.map((m) => m.joint)).toEqual(['left_elbow']);
  });

  it('handles null/undefined angle maps without throwing', () => {
    const res = selectRepJoints(undefined, undefined, 'full');
    expect(res.repJoints).toEqual([]);
    expect(res.motions).toEqual([]);
    expect(res.dominantJoint).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildMotionConfig
// ---------------------------------------------------------------------------
describe('buildMotionConfig', () => {
  it('builds a multi-joint config from reference jointMotion + repJoints', () => {
    const reference = {
      bodyRegion: 'upper',
      repJoints: ['left_elbow', 'right_elbow'],
      jointMotion: {
        left_elbow: { rest: 170, target: 90, range: 80, weight: 2 },
        right_elbow: { rest: 170, target: 90, range: 80, weight: 2 },
      },
      dominantJoint: 'left_elbow',
    };
    const config = buildMotionConfig({ exercise: {}, reference });
    expect(config).toBeInstanceOf(Object);
    expect(config.repJoints).toEqual(['left_elbow', 'right_elbow']);
    expect(config.bodyRegion).toBe('upper');
    expect(config.dominantJoint).toBe('left_elbow');
    expect(config.jointMotion).toBe(reference.jointMotion);
    // two rep joints -> multi mode
    expect(config.repMode).toBe('multi');
    // left+right elbow pair -> bilateralSync pattern inferred
    expect(config.movementPattern).toBe('bilateralSync');
    // weights are normalised to sum ~1
    expect(Array.isArray(config.weights)).toBe(true);
    expect(config.weights).toHaveLength(2);
    const weightSum = config.weights.reduce((a, b) => a + b, 0);
    expect(weightSum).toBeCloseTo(1, 5);
    expect(config.weights[0]).toBeCloseTo(0.5, 5);
    // defaults
    expect(config.countMode).toBe('per_side');
    expect(config.alternatingSides).toEqual(['left', 'right']);
    expect(config.primaryJoints).toEqual(['left_elbow', 'right_elbow']);
  });

  it('infers unilateral movement when there is no bilateral pair', () => {
    const reference = {
      repJoints: ['right_elbow'],
      jointMotion: { right_elbow: { rest: 170, target: 90, range: 80, weight: 1 } },
    };
    const config = buildMotionConfig({ exercise: {}, reference });
    expect(config.repMode).toBe('single');
    expect(config.movementPattern).toBe('unilateral');
    expect(config.weights).toEqual([1]);
  });

  it('derives repJoints from jointMotion keys when repJoints absent', () => {
    const reference = {
      jointMotion: {
        left_knee: { rest: 180, target: 80, range: 100, weight: 1 },
      },
    };
    const config = buildMotionConfig({ exercise: {}, reference });
    expect(config.repJoints).toEqual(['left_knee']);
  });

  it('falls back to a single-joint config when no jointMotion is provided', () => {
    const exercise = { rest: 30, target: 150, tol: 12 };
    const config = buildMotionConfig({ exercise, reference: {} });
    expect(config.repMode).toBe('single');
    expect(config.movementPattern).toBe('unilateral');
    // default joint when no dominant given
    expect(config.repJoints).toEqual(['right_shoulder']);
    expect(config.dominantJoint).toBe('right_shoulder');
    expect(config.bodyRegion).toBe('full');
    const motion = config.jointMotion.right_shoulder;
    expect(motion.rest).toBe(30);
    expect(motion.target).toBe(150);
    expect(motion.range).toBe(120);
    expect(motion.dir).toBe('up');
    expect(motion.tol).toBe(12);
    expect(motion.weight).toBe(1);
    expect(config.weights).toEqual([1]);
  });

  it('uses the dominant joint and downward dir in the single-joint fallback', () => {
    const config = buildMotionConfig({
      exercise: { rest: 150, target: 40 },
      reference: { dominantJoint: 'left_knee' },
    });
    expect(config.repJoints).toEqual(['left_knee']);
    expect(config.dominantJoint).toBe('left_knee');
    const motion = config.jointMotion.left_knee;
    expect(motion.range).toBe(110);
    expect(motion.dir).toBe('down');
  });

  it('reads rest/target from reference.plan in the single-joint fallback', () => {
    const config = buildMotionConfig({
      exercise: {},
      reference: { plan: { restAngle: 20, targetAngle: 120 }, dominantJoint: 'right_knee' },
    });
    const motion = config.jointMotion.right_knee;
    expect(motion.rest).toBe(20);
    expect(motion.target).toBe(120);
    expect(motion.range).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// evaluateMultiJointMotionFrame
// ---------------------------------------------------------------------------
describe('evaluateMultiJointMotionFrame', () => {
  // A simple single rep-joint config built from the source's own builder.
  const baseConfig = buildMotionConfig({
    exercise: {},
    reference: {
      repJoints: ['right_elbow'],
      jointMotion: { right_elbow: { rest: 170, target: 90, range: 80, weight: 1 } },
      dominantJoint: 'right_elbow',
    },
  });

  it('returns null when dt is zero (cannot compute speeds)', () => {
    const out = evaluateMultiJointMotionFrame({ right_elbow: 130 }, null, baseConfig, 0, null);
    expect(out).toBeNull();
  });

  it('returns null when dt is negative', () => {
    const out = evaluateMultiJointMotionFrame({ right_elbow: 130 }, null, baseConfig, -1, null);
    expect(out).toBeNull();
  });

  it('returns null when there are no rep joints', () => {
    const emptyConfig = { ...baseConfig, repJoints: [] };
    const out = evaluateMultiJointMotionFrame({ right_elbow: 130 }, null, emptyConfig, 0.033, null);
    expect(out).toBeNull();
  });

  it('returns null when the live angle for the rep joint is missing', () => {
    const out = evaluateMultiJointMotionFrame({ left_elbow: 130 }, null, baseConfig, 0.033, null);
    expect(out).toBeNull();
  });

  it('returns a metrics object on the first valid frame (previous = null)', () => {
    const out = evaluateMultiJointMotionFrame({ right_elbow: 130 }, null, baseConfig, 0.033, null);
    expect(out).not.toBeNull();
    expect(out).toEqual(
      expect.objectContaining({
        motionScore: expect.any(Number),
        tempoScore: expect.any(Number),
        smoothnessScore: expect.any(Number),
        pathScore: expect.any(Number),
        syncScore: expect.any(Number),
        trackingScore: expect.any(Number),
        progress: expect.any(Number),
        minProgress: expect.any(Number),
        maxProgress: expect.any(Number),
        atPeak: expect.any(Boolean),
        atRest: expect.any(Boolean),
        severe: expect.any(Boolean),
        next: expect.any(Object),
      }),
    );
    // 'issue' is null when no metric is below the warning threshold, or a string otherwise
    expect(out.issue === null || typeof out.issue === 'string').toBe(true);
  });

  it('computes progress = (angle - rest)/(target - rest) for the dominant joint', () => {
    // rest 170, target 90 -> denom -80; angle 130 -> (130-170)/-80 = 0.5
    const out = evaluateMultiJointMotionFrame({ right_elbow: 130 }, null, baseConfig, 0.033, null);
    expect(out.progress).toBeCloseTo(0.5, 5);
    expect(out.minProgress).toBeCloseTo(0.5, 5);
    expect(out.maxProgress).toBeCloseTo(0.5, 5);
  });

  it('reports progress ~0 at rest and ~1 at target', () => {
    const atRestFrame = evaluateMultiJointMotionFrame({ right_elbow: 170 }, null, baseConfig, 0.033, null);
    expect(atRestFrame.progress).toBeCloseTo(0, 5);
    const atTargetFrame = evaluateMultiJointMotionFrame({ right_elbow: 90 }, null, baseConfig, 0.033, null);
    expect(atTargetFrame.progress).toBeCloseTo(1, 5);
  });

  it('flags atPeak when progress is high and tracking is good', () => {
    // previous angle close to target so speed is small -> good tracking; angle at target
    const previous = { angles: { right_elbow: 92 }, speeds: { right_elbow: 0 } };
    const out = evaluateMultiJointMotionFrame({ right_elbow: 90 }, null, baseConfig, 0.2, previous);
    expect(out).not.toBeNull();
    expect(out.atPeak).toBe(true);
    expect(out.atRest).toBe(false);
  });

  it('flags atRest when progress is low and tracking is good', () => {
    const previous = { angles: { right_elbow: 168 }, speeds: { right_elbow: 0 } };
    const out = evaluateMultiJointMotionFrame({ right_elbow: 170 }, null, baseConfig, 0.2, previous);
    expect(out).not.toBeNull();
    expect(out.atRest).toBe(true);
    expect(out.atPeak).toBe(false);
  });

  it('carries forward angle/speed state in next for the following frame', () => {
    const out = evaluateMultiJointMotionFrame({ right_elbow: 130 }, null, baseConfig, 0.1, null);
    expect(out.next.angles.right_elbow).toBe(130);
    // first frame -> no prevAngle -> speed 0
    expect(out.next.speeds.right_elbow).toBe(0);
    expect(['outbound', 'return']).toContain(out.next.motionPhase);

    // second frame uses the prior state -> non-zero speed
    const out2 = evaluateMultiJointMotionFrame({ right_elbow: 120 }, null, baseConfig, 0.1, out.next);
    expect(out2.next.angles.right_elbow).toBe(120);
    expect(out2.next.speeds.right_elbow).toBeCloseTo(Math.abs(120 - 130) / 0.1, 5);
  });

  it('produces all integer 0..100 sub-scores', () => {
    const out = evaluateMultiJointMotionFrame({ right_elbow: 130 }, null, baseConfig, 0.033, null);
    for (const key of ['motionScore', 'tempoScore', 'smoothnessScore', 'pathScore', 'syncScore', 'trackingScore']) {
      expect(Number.isInteger(out[key])).toBe(true);
      expect(out[key]).toBeGreaterThanOrEqual(0);
      expect(out[key]).toBeLessThanOrEqual(100);
    }
  });

  it('routes to the alternating evaluator and returns side-aware metrics', () => {
    const altConfig = buildMotionConfig({
      exercise: {},
      reference: {
        movementPattern: 'alternating',
        repJoints: ['left_elbow', 'right_elbow'],
        alternatingSides: ['left', 'right'],
        jointMotion: {
          left_elbow: { rest: 170, target: 90, range: 80, weight: 1 },
          right_elbow: { rest: 170, target: 90, range: 80, weight: 1 },
        },
      },
    });
    expect(altConfig.movementPattern).toBe('alternating');

    // expectedSide defaults to first side ('left'); drive left elbow only
    const out = evaluateMultiJointMotionFrame(
      { left_elbow: 130, right_elbow: 170 },
      null,
      altConfig,
      0.1,
      null,
    );
    expect(out).not.toBeNull();
    expect(out).toEqual(
      expect.objectContaining({
        motionScore: expect.any(Number),
        sequenceScore: expect.any(Number),
        inactiveSideScore: expect.any(Number),
        expectedSide: 'left',
        activeSide: expect.any(String),
        next: expect.any(Object),
      }),
    );
    expect(out.next.expectedSide).toBe('left');
  });

  it('alternating path returns null when the expected side has no valid progress', () => {
    const altConfig = buildMotionConfig({
      exercise: {},
      reference: {
        movementPattern: 'alternating',
        repJoints: ['left_elbow', 'right_elbow'],
        alternatingSides: ['left', 'right'],
        jointMotion: {
          left_elbow: { rest: 170, target: 90, range: 80, weight: 1 },
          right_elbow: { rest: 170, target: 90, range: 80, weight: 1 },
        },
      },
    });
    // expected side = left, but only the right angle is present -> left has no progress
    const out = evaluateMultiJointMotionFrame(
      { right_elbow: 130 },
      null,
      altConfig,
      0.1,
      null,
    );
    expect(out).toBeNull();
  });
});
