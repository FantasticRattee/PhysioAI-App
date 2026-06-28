// Patient AI · BoundaryBoxGate.js unit tests.
// Verifies the on-screen boundary-box geometry, the per-exercise key-joint
// selection, and the full evaluateBoundaryBox() gate against the REAL synthetic
// pose generator (normalized 0..1 coords) with a fixed `now` for determinism.

import {
  BOUNDARY_BOX_RATIO,
  getBoundaryBox,
  boundaryKeyJoints,
  evaluateBoundaryBox,
} from '../../Patient/src/ai/BoundaryBoxGate.js';
import { makePose } from '../../Patient/src/ai/SyntheticPose.js';

const FIXED_NOW = 1_700_000_000_000;

describe('BoundaryBoxGate · constants', () => {
  it('exports BOUNDARY_BOX_RATIO === 0.95', () => {
    expect(BOUNDARY_BOX_RATIO).toBe(0.95);
  });
});

describe('BoundaryBoxGate · getBoundaryBox', () => {
  it('returns a centered 95% box for a 1000x1000 frame', () => {
    const box = getBoundaryBox(1000, 1000);
    // margin = w * ((1 - 0.95) / 2) = 1000 * 0.025 = 25
    expect(box.left).toBeCloseTo(25, 6);
    expect(box.top).toBeCloseTo(25, 6);
    expect(box.right).toBeCloseTo(975, 6);
    expect(box.bottom).toBeCloseTo(975, 6);
    expect(box.width).toBeCloseTo(950, 6);
    expect(box.height).toBeCloseTo(950, 6);
  });

  it('exposes exactly the documented keys', () => {
    const box = getBoundaryBox(640, 480);
    expect(Object.keys(box).sort()).toEqual(
      ['bottom', 'height', 'left', 'right', 'top', 'width'].sort(),
    );
  });

  it('honors a custom ratio', () => {
    const box = getBoundaryBox(1000, 1000, 0.8);
    // margin = 1000 * ((1 - 0.8) / 2) = 1000 * 0.1 = 100
    expect(box.left).toBeCloseTo(100, 6);
    expect(box.top).toBeCloseTo(100, 6);
    expect(box.right).toBeCloseTo(900, 6);
    expect(box.bottom).toBeCloseTo(900, 6);
    expect(box.width).toBeCloseTo(800, 6);
    expect(box.height).toBeCloseTo(800, 6);
  });

  it('defaults the ratio to BOUNDARY_BOX_RATIO when omitted', () => {
    expect(getBoundaryBox(500, 500)).toEqual(getBoundaryBox(500, 500, BOUNDARY_BOX_RATIO));
  });

  it('handles a non-square frame (margins scale per axis)', () => {
    const box = getBoundaryBox(800, 600);
    expect(box.left).toBeCloseTo(800 * 0.025, 6); // 20
    expect(box.top).toBeCloseTo(600 * 0.025, 6); // 15
    expect(box.right).toBeCloseTo(800 - 800 * 0.025, 6); // 780
    expect(box.bottom).toBeCloseTo(600 - 600 * 0.025, 6); // 585
    expect(box.width).toBeCloseTo(800 * 0.95, 6);
    expect(box.height).toBeCloseTo(600 * 0.95, 6);
  });

  it('clamps negative / undefined dimensions to a zero box', () => {
    const box = getBoundaryBox(-100, undefined);
    expect(box.left).toBe(0);
    expect(box.top).toBe(0);
    expect(box.right).toBe(0);
    expect(box.bottom).toBe(0);
    expect(box.width).toBe(0);
    expect(box.height).toBe(0);
  });
});

describe('BoundaryBoxGate · boundaryKeyJoints', () => {
  it('selects the left-arm chain for a left_elbow exercise', () => {
    expect(boundaryKeyJoints({ primaryJoint: 'left_elbow' })).toEqual([
      'left_shoulder',
      'left_elbow',
      'left_wrist',
    ]);
  });

  it('selects the right-arm chain for a right_shoulder exercise', () => {
    expect(boundaryKeyJoints({ primaryJoint: 'right_shoulder' })).toEqual([
      'right_shoulder',
      'right_elbow',
      'right_wrist',
    ]);
  });

  it('selects a left-leg chain for a left_knee exercise', () => {
    expect(boundaryKeyJoints({ primaryJoint: 'left_knee' })).toEqual([
      'left_hip',
      'left_knee',
      'left_ankle',
    ]);
  });

  it('returns the full 12-joint set for a full-body exercise', () => {
    expect(boundaryKeyJoints({ bodyRegion: 'full' })).toEqual([
      'left_shoulder', 'right_shoulder',
      'left_elbow', 'right_elbow',
      'left_wrist', 'right_wrist',
      'left_hip', 'right_hip',
      'left_knee', 'right_knee',
      'left_ankle', 'right_ankle',
    ]);
  });

  it('uses the back virtual-joint neighbors (no region keys) for primaryJoint=back', () => {
    expect(boundaryKeyJoints({ primaryJoint: 'back' })).toEqual([
      'left_shoulder', 'right_shoulder',
      'left_hip', 'right_hip',
      'left_knee', 'right_knee',
    ]);
  });

  it('uses the neck virtual-joint neighbors for primaryJoint=neck', () => {
    // NEIGHBORS.neck = nose, left_shoulder, right_shoulder, left_hip, right_hip
    expect(boundaryKeyJoints({ primaryJoint: 'neck' })).toEqual([
      'nose',
      'left_shoulder', 'right_shoulder',
      'left_hip', 'right_hip',
    ]);
  });

  it('falls back to the full region when no exercise / region is given', () => {
    const expected = [
      'left_shoulder', 'right_shoulder',
      'left_elbow', 'right_elbow',
      'left_wrist', 'right_wrist',
      'left_hip', 'right_hip',
      'left_knee', 'right_knee',
      'left_ankle', 'right_ankle',
    ];
    expect(boundaryKeyJoints(undefined)).toEqual(expected);
    expect(boundaryKeyJoints({})).toEqual(expected);
  });

  it('resolves body-region aliases (whole_body -> full)', () => {
    expect(boundaryKeyJoints({ bodyRegion: 'whole_body' })).toEqual(
      boundaryKeyJoints({ bodyRegion: 'full' }),
    );
  });

  it('returns a de-duplicated list', () => {
    const names = boundaryKeyJoints({ primaryJoint: 'left_elbow' });
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('BoundaryBoxGate · evaluateBoundaryBox · result shape', () => {
  it('returns the documented keys for a normal evaluation', () => {
    const pose = makePose('left_elbow', 90);
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);
    expect(Object.keys(res).sort()).toEqual(
      [
        'status', 'ok', 'box', 'bodyBox', 'missing', 'willExit',
        'softOutside', 'outsideStreak', 'keyIndices', 'hint', 'hintTh', 'nextFrame',
      ].sort(),
    );
  });
});

describe('BoundaryBoxGate · evaluateBoundaryBox · inside (happy path)', () => {
  it('reports ok/inside when the whole body is well within a normalized frame', () => {
    const pose = makePose('left_elbow', 90);
    const exercise = { primaryJoint: 'left_elbow' };
    const res = evaluateBoundaryBox(pose, 1, 1, null, exercise, FIXED_NOW);

    expect(res.status).toBe('inside');
    expect(res.ok).toBe(true);
    expect(res.missing).toEqual([]); // no missing key joints
    expect(res.willExit).toBe(false);
    expect(res.outsideStreak).toBe(0);
    // key-joint indices are the BlazePose indices of the left-arm chain.
    expect(res.keyIndices).toEqual([11, 13, 15]);
  });

  it('includes the boundary box (95% of the frame) in the result', () => {
    const pose = makePose('left_elbow', 90);
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);
    expect(res.box).toEqual(getBoundaryBox(1, 1));
  });

  it('computes a bodyBox bounding the visible key joints', () => {
    const pose = makePose('left_elbow', 90);
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);
    expect(res.bodyBox).not.toBeNull();
    expect(res.bodyBox.right).toBeGreaterThanOrEqual(res.bodyBox.left);
    expect(res.bodyBox.bottom).toBeGreaterThanOrEqual(res.bodyBox.top);
    expect(res.bodyBox.width).toBeCloseTo(res.bodyBox.right - res.bodyBox.left, 9);
    expect(res.bodyBox.height).toBeCloseTo(res.bodyBox.bottom - res.bodyBox.top, 9);
  });

  it('emits empty hints when inside', () => {
    const pose = makePose('left_elbow', 90);
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);
    expect(res.hint).toBe('');
    expect(res.hintTh).toBe('');
  });

  it('records the fixed `now` and inside status in nextFrame', () => {
    const pose = makePose('left_elbow', 90);
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);
    expect(res.nextFrame.at).toBe(FIXED_NOW);
    expect(res.nextFrame.status).toBe('inside');
    expect(res.nextFrame.points).toBe(pose);
  });

  it('also passes for a full-body exercise that fits in the frame', () => {
    const pose = makePose('left_knee', 80);
    const res = evaluateBoundaryBox(pose, 1, 1, null, { bodyRegion: 'full' }, FIXED_NOW);
    expect(res.status).toBe('inside');
    expect(res.ok).toBe(true);
    expect(res.missing).toEqual([]);
  });
});

describe('BoundaryBoxGate · evaluateBoundaryBox · missing / low visibility', () => {
  it('marks key joints missing (by index) and reports outside when visibility is below VIS_OK', () => {
    // VIS_OK = 0.35 — set every landmark below the threshold.
    const pose = makePose('left_elbow', 90).map((p) => ({ ...p, visibility: 0.1 }));
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);

    expect(res.status).toBe('outside');
    expect(res.ok).toBe(false);
    // missing holds the indices of the key joints (left_shoulder/elbow/wrist).
    expect(res.missing).toEqual([11, 13, 15]);
    expect(res.nextFrame.status).toBe('outside');
    expect(res.hint).toBe('Move inside the frame');
    expect(res.hintTh).toBe('ขยับตัวให้อยู่ในกรอบ');
  });

  it('treats visibility exactly at the VIS_OK boundary (0.35) as visible -> inside', () => {
    const pose = makePose('left_elbow', 90).map((p) => ({ ...p, visibility: 0.35 }));
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);
    expect(res.status).toBe('inside');
    expect(res.ok).toBe(true);
    expect(res.missing).toEqual([]);
  });

  it('treats visibility just below the boundary (0.34) as missing -> outside', () => {
    const pose = makePose('left_elbow', 90).map((p) => ({ ...p, visibility: 0.34 }));
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);
    expect(res.status).toBe('outside');
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual([11, 13, 15]);
  });

  it('treats a non-finite coordinate as a missing key joint', () => {
    const pose = makePose('left_elbow', 90);
    pose[13] = { ...pose[13], x: NaN }; // left_elbow
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);
    expect(res.missing).toContain(13);
    expect(res.status).toBe('outside');
    expect(res.ok).toBe(false);
  });
});

describe('BoundaryBoxGate · evaluateBoundaryBox · outside the frame', () => {
  it('reports outside when a visible key joint sits past the box edge', () => {
    const pose = makePose('left_elbow', 90);
    // Drag the wrist far to the right, outside the 95% box (x > 0.975).
    pose[15] = { ...pose[15], x: 2.0 };
    const res = evaluateBoundaryBox(pose, 1, 1, null, { primaryJoint: 'left_elbow' }, FIXED_NOW);
    expect(res.status).toBe('outside');
    expect(res.ok).toBe(false);
    expect(res.outsideStreak).toBe(1);
    expect(res.hint).toBe('Move inside the frame');
  });
});

describe('BoundaryBoxGate · evaluateBoundaryBox · empty / null inputs', () => {
  it('returns the early-out outside result when points are null', () => {
    const res = evaluateBoundaryBox(null, 1, 1, null, { primaryJoint: 'left_elbow' }, 999);
    expect(res.status).toBe('outside');
    expect(res.ok).toBe(false);
    // In the early-out branch, `missing` is the list of key joint NAMES.
    expect(res.missing).toEqual(['left_shoulder', 'left_elbow', 'left_wrist']);
    expect(res.willExit).toBe(false);
    expect(res.bodyBox).toBeNull();
    expect(res.nextFrame).toEqual({ points: null, at: 999, status: 'outside' });
  });

  it('returns the early-out outside result when points is an empty array', () => {
    const res = evaluateBoundaryBox([], 1, 1, null, { primaryJoint: 'left_elbow' }, 42);
    expect(res.status).toBe('outside');
    expect(res.ok).toBe(false);
    expect(res.bodyBox).toBeNull();
    expect(res.nextFrame.at).toBe(42);
    expect(res.nextFrame.status).toBe('outside');
  });

  it('returns the early-out outside result when width/height are zero', () => {
    const pose = makePose('left_elbow', 90);
    const res = evaluateBoundaryBox(pose, 0, 0, null, { primaryJoint: 'left_elbow' }, 7);
    expect(res.status).toBe('outside');
    expect(res.ok).toBe(false);
    expect(res.bodyBox).toBeNull();
    // nextFrame keeps the original points reference in this branch.
    expect(res.nextFrame.points).toBe(pose);
    expect(res.nextFrame.at).toBe(7);
  });
});

describe('BoundaryBoxGate · evaluateBoundaryBox · determinism', () => {
  it('produces identical results for the same inputs and fixed now', () => {
    const a = makePose('left_elbow', 90);
    const b = makePose('left_elbow', 90);
    const exercise = { primaryJoint: 'left_elbow' };
    const r1 = evaluateBoundaryBox(a, 1, 1, null, exercise, FIXED_NOW);
    const r2 = evaluateBoundaryBox(b, 1, 1, null, exercise, FIXED_NOW);
    expect(r1.status).toBe(r2.status);
    expect(r1.ok).toBe(r2.ok);
    expect(r1.missing).toEqual(r2.missing);
    expect(r1.keyIndices).toEqual(r2.keyIndices);
    expect(r1.nextFrame.at).toBe(r2.nextFrame.at);
  });
});
