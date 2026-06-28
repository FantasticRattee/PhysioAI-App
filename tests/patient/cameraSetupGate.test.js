// Unit tests for the Patient Camera Setup Gate — an explainable heuristic that
// decides whether the subject is framed well enough for the exercise's joints.
//
// Target: Patient/src/ai/CameraSetupGate.js  export evaluateGate(landmarks, exercise)
// Returns { ok, score, hint, hintTh, missing }.
//
// We build inputs with makePose() (the real synthetic-pose generator) so the
// landmark coordinates and ordering match production exactly.

import { evaluateGate } from '../../Patient/src/ai/CameraSetupGate.js';
import { makePose } from '../../Patient/src/ai/SyntheticPose.js';
import { idx } from '../../Patient/src/ai/landmarks.js';

// Constants mirrored from the source for boundary assertions.
const VIS_OK = 0.6;
const BOUNDARY_MARGIN = 0.025;

// Clone helper so we never mutate a shared pose between tests.
const clone = (lm) => lm.map((k) => ({ ...k }));

describe('CameraSetupGate · evaluateGate', () => {
  describe('empty / missing input', () => {
    it('returns a "step into frame" result when landmarks is null', () => {
      const out = evaluateGate(null, { primaryJoint: 'right_elbow' });
      expect(out).toEqual({
        ok: false,
        score: 0,
        hint: 'Step into frame',
        hintTh: 'ขยับเข้าในกรอบ',
        missing: [],
      });
    });

    it('returns a "step into frame" result when landmarks is an empty array', () => {
      const out = evaluateGate([], { primaryJoint: 'right_elbow' });
      expect(out.ok).toBe(false);
      expect(out.score).toBe(0);
      expect(out.hint).toBe('Step into frame');
      expect(out.hintTh).toBe('ขยับเข้าในกรอบ');
      expect(out.missing).toEqual([]);
    });
  });

  describe('well-framed, fully-visible pose', () => {
    it('passes the gate with score 1 and no missing joints (right_elbow)', () => {
      const exercise = { primaryJoint: 'right_elbow' };
      const landmarks = makePose('right_elbow', 90); // all visibility = 1, fully inside frame
      const out = evaluateGate(landmarks, exercise);

      expect(out.ok).toBe(true);
      expect(out.score).toBeCloseTo(1, 5);
      expect(out.score).toBeGreaterThan(0.9);
      expect(out.missing).toEqual([]);
      // When ok, hints are cleared to empty strings.
      expect(out.hint).toBe('');
      expect(out.hintTh).toBe('');
    });

    it('passes the gate for a lower-body exercise (right_knee)', () => {
      const exercise = { primaryJoint: 'right_knee' };
      const landmarks = makePose('right_knee', 90);
      const out = evaluateGate(landmarks, exercise);

      expect(out.ok).toBe(true);
      expect(out.score).toBeCloseTo(1, 5);
      expect(out.missing).toEqual([]);
      expect(out.hint).toBe('');
    });

    it('returns a result object with exactly the documented keys', () => {
      const out = evaluateGate(makePose('right_elbow', 90), { primaryJoint: 'right_elbow' });
      expect(Object.keys(out).sort()).toEqual(['hint', 'hintTh', 'missing', 'ok', 'score'].sort());
    });
  });

  describe('low-visibility required landmark', () => {
    it('fails the gate, reports the joint as missing, and emits hint strings', () => {
      const exercise = { primaryJoint: 'right_elbow' };
      const landmarks = clone(makePose('right_elbow', 90));
      // Drop the primary joint below the visibility threshold. right_elbow is a
      // BLOCKING required joint (not an expected frame exit like a raised wrist).
      landmarks[idx('right_elbow')].visibility = VIS_OK - 0.1; // 0.5 < 0.6

      const out = evaluateGate(landmarks, exercise);

      expect(out.ok).toBe(false);
      expect(out.missing).toContain('right_elbow');
      expect(out.missing.length).toBeGreaterThan(0);
      // Hint references the friendly bilingual joint name.
      expect(typeof out.hint).toBe('string');
      expect(out.hint.length).toBeGreaterThan(0);
      expect(out.hint).toContain('right elbow');
      expect(typeof out.hintTh).toBe('string');
      expect(out.hintTh).toContain('ศอกขวา');
      // Two of three required joints visible → visFrac = 2/3.
      expect(out.score).toBeCloseTo(2 / 3, 5);
    });

    it('blocks on a hidden shoulder with the exact missing-joints hint phrasing', () => {
      const exercise = { primaryJoint: 'right_elbow' };
      const landmarks = clone(makePose('right_elbow', 90));
      landmarks[idx('right_shoulder')].visibility = 0; // fully invisible

      const out = evaluateGate(landmarks, exercise);

      expect(out.ok).toBe(false);
      expect(out.missing).toContain('right_shoulder');
      expect(out.hint).toBe('Make sure your right shoulder are visible');
      expect(out.hintTh).toBe('ให้เห็นไหล่ขวาในกล้อง');
    });

    it('treats visibility exactly at VIS_OK (0.6) as visible (>= threshold)', () => {
      const exercise = { primaryJoint: 'right_elbow' };
      const landmarks = clone(makePose('right_elbow', 90));
      landmarks[idx('right_elbow')].visibility = VIS_OK; // exactly 0.6 counts as visible
      const out = evaluateGate(landmarks, exercise);

      expect(out.ok).toBe(true);
      expect(out.missing).toEqual([]);
      expect(out.score).toBeCloseTo(1, 5);
    });

    it('treats visibility just below VIS_OK as missing', () => {
      const exercise = { primaryJoint: 'right_elbow' };
      const landmarks = clone(makePose('right_elbow', 90));
      landmarks[idx('right_elbow')].visibility = VIS_OK - 0.001; // 0.599 < 0.6
      const out = evaluateGate(landmarks, exercise);

      expect(out.ok).toBe(false);
      expect(out.missing).toContain('right_elbow');
    });
  });

  describe('edge clipping at the frame boundary', () => {
    it('penalizes the score by 0.25 and fails the gate when a visible joint clips the right edge', () => {
      const exercise = { primaryJoint: 'right_elbow' };
      const landmarks = clone(makePose('right_elbow', 90));
      // All key joints stay visible, so there is no missing/blocking joint —
      // but push the wrist outside the 2.5% boundary box on the x axis.
      landmarks[idx('right_wrist')].x = 1 - BOUNDARY_MARGIN + 0.02; // 0.995 > 0.975

      const out = evaluateGate(landmarks, exercise);

      expect(out.ok).toBe(false);
      expect(out.missing).toEqual([]); // nothing hidden — purely a clipping failure
      // visFrac is 1 (all visible) minus the 0.25 clipping penalty.
      expect(out.score).toBeCloseTo(0.75, 5);
      expect(out.hint).toBe('Move inside the boundary box');
      expect(out.hintTh).toBe('ขยับให้อยู่ในกรอบ');
    });

    it('fails when a visible joint clips the bottom edge (y axis)', () => {
      const exercise = { primaryJoint: 'right_knee' };
      const landmarks = clone(makePose('right_knee', 90));
      landmarks[idx('right_ankle')].y = 1 - BOUNDARY_MARGIN + 0.01; // 0.985 > 0.975

      const out = evaluateGate(landmarks, exercise);

      expect(out.ok).toBe(false);
      expect(out.score).toBeCloseTo(0.75, 5);
      expect(out.hint).toBe('Move inside the boundary box');
    });

    it('does NOT penalize a low-visibility joint that sits outside the boundary', () => {
      // Clipping only counts for joints that are actually visible.
      const exercise = { primaryJoint: 'right_elbow' };
      const landmarks = clone(makePose('right_elbow', 90));
      const w = idx('right_wrist');
      landmarks[w].x = 1.2;            // outside frame
      landmarks[w].visibility = 0.1;   // but not visible → not a clip, it's "missing"

      const out = evaluateGate(landmarks, exercise);

      // right_wrist is an expected frame-exit for elbow exercises, so it is NOT
      // a blocking miss; with nothing blocking and no *visible* clip, gate passes.
      // On a passing gate the source clears `missing` to [] in its early return.
      expect(out.ok).toBe(true);
      expect(out.missing).toEqual([]);
      // Denominator excludes the expected-missing wrist → visFrac = 2/2 = 1.
      expect(out.score).toBeCloseTo(1, 5);
      expect(out.hint).toBe('');
    });

    it('combines a missing joint and clipping with missing-joint hint taking priority', () => {
      const exercise = { primaryJoint: 'right_elbow' };
      const landmarks = clone(makePose('right_elbow', 90));
      landmarks[idx('right_shoulder')].visibility = 0;       // blocking missing
      landmarks[idx('right_elbow')].x = 1 - BOUNDARY_MARGIN + 0.02; // visible + clipped

      const out = evaluateGate(landmarks, exercise);

      expect(out.ok).toBe(false);
      // Missing-joint hint wins over the boundary hint.
      expect(out.hint).toContain('right shoulder');
      expect(out.hint).not.toBe('Move inside the boundary box');
      // score = visFrac(2/3) - 0.25 clip penalty, clamped to [0,1].
      expect(out.score).toBeCloseTo(2 / 3 - 0.25, 5);
    });
  });

  describe('score bounds', () => {
    it('never returns a score below 0 or above 1', () => {
      // Hide everything AND clip — score must clamp at 0, not go negative.
      const exercise = { primaryJoint: 'right_elbow' };
      const landmarks = clone(makePose('right_elbow', 90));
      for (const name of ['right_shoulder', 'right_elbow', 'right_wrist']) {
        landmarks[idx(name)].visibility = 0;
      }
      const out = evaluateGate(landmarks, exercise);
      expect(out.score).toBeGreaterThanOrEqual(0);
      expect(out.score).toBeLessThanOrEqual(1);
      expect(out.ok).toBe(false);
    });
  });
});
