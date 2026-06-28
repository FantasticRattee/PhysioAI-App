// Tests for Patient AI · FormScorer (rule-based form classifier).
// Source: Patient/src/ai/FormScorer.js
//
// formScorer(comparison, primaryJoint) -> { cls, label, labelTh, conf, detail, detailTh }
// where comparison is shaped like poseComparator() output:
//   { score:number|null, joints:Array<row>, primary:row|null, validCount:number }
// and a joint row is:
//   { joint, label, labelTh, ref, live, tol, delta, status, score }
// status is one of 'ok' | 'warn' | 'bad' | 'none'.
//
// Class rules (from source):
//   correct    — no joint outside tolerance (no 'bad' and no 'warn').
//   multi      — two or more joints with status 'bad'.
//   undershoot — single dominant error AND worst.joint === primaryJoint.
//   lean       — single dominant error AND worst.joint !== primaryJoint.
//   (null/empty pose -> cls 'undershoot' with conf 0 and the 'none' labels.)

import { FORM_CLASSES, formScorer } from '../../Patient/src/ai/FormScorer.js';

// ---- helpers --------------------------------------------------------------

// Build a single joint row matching poseComparator's row shape.
function joint(name, { delta = 0, tol = 15, status = 'ok' } = {}) {
  return {
    joint: name,
    label: name.replace(/_/g, ' '),
    labelTh: `ข้อ-${name}`,
    ref: 90,
    live: 90 - delta,
    tol,
    delta,
    status,
    score: Math.max(0, 1 - delta / (tol * 3)) * 100,
  };
}

// Pick the "worst" row the way poseComparator does: max delta/tol ratio.
function pickWorst(rows) {
  let worst = null;
  for (const r of rows) {
    if (r.delta == null) continue;
    if (!worst || r.delta / r.tol > worst.delta / worst.tol) worst = r;
  }
  return worst;
}

// Assemble a comparison object from joint rows.
function comparison(rows, { score = 90, validCount = null } = {}) {
  const valid = rows.filter((r) => r.delta != null).length;
  return {
    score,
    joints: rows,
    primary: pickWorst(rows),
    validCount: validCount == null ? valid : validCount,
  };
}

// ---- FORM_CLASSES ---------------------------------------------------------

describe('FORM_CLASSES', () => {
  it('is the exact four-class list in order', () => {
    expect(FORM_CLASSES).toEqual(['correct', 'undershoot', 'lean', 'multi']);
  });
});

// ---- null / empty pose ----------------------------------------------------

describe('formScorer · no usable pose', () => {
  it('returns undershoot with conf 0 and "no pose" labels when comparison is null', () => {
    const r = formScorer(null, 'right_shoulder');
    expect(r.cls).toBe('undershoot');
    expect(r.conf).toBe(0);
    expect(r.label).toBe('no pose');
    expect(r.labelTh).toBe('ไม่พบท่า');
    expect(r.detail).toMatch(/No pose detected/);
    expect(r.detailTh).toMatch(/ไม่พบท่าทาง/);
  });

  it('returns undershoot/conf 0 when score is null', () => {
    const c = comparison([joint('right_shoulder', { delta: 0, status: 'ok' })], { score: null });
    const r = formScorer(c, 'right_shoulder');
    expect(r.cls).toBe('undershoot');
    expect(r.conf).toBe(0);
    expect(r.label).toBe('no pose');
  });

  it('returns undershoot/conf 0 when validCount is 0', () => {
    const c = comparison([joint('right_shoulder', { delta: 0, status: 'ok' })], { validCount: 0 });
    const r = formScorer(c, 'right_shoulder');
    expect(r.cls).toBe('undershoot');
    expect(r.conf).toBe(0);
    expect(r.label).toBe('no pose');
  });
});

// ---- correct --------------------------------------------------------------

describe('formScorer · correct', () => {
  it('classifies all-ok joints as correct with conf in [0.85, 0.97]', () => {
    const rows = [
      joint('right_shoulder', { delta: 2, status: 'ok' }),
      joint('left_shoulder', { delta: 3, status: 'ok' }),
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const c = comparison(rows, { score: 95 });
    const r = formScorer(c, 'right_shoulder');

    expect(r.cls).toBe('correct');
    expect(r.label).toBe('good form');
    expect(r.labelTh).toBe('ฟอร์มดี');
    expect(r.conf).toBeGreaterThanOrEqual(0.85);
    expect(r.conf).toBeLessThanOrEqual(0.97);
    expect(r.detail).toMatch(/All 3 tracked joints within tolerance/);
    expect(r.detailTh).toMatch(/ข้อต่อที่ติดตามทั้ง 3 จุด/);
  });

  it('computes conf from score: 0.85 + (score/100)*0.12, capped at 0.97', () => {
    // score 100 -> 0.85 + 0.12 = 0.97 (cap)
    const rows = [
      joint('a', { delta: 0, status: 'ok' }),
      joint('b', { delta: 0, status: 'ok' }),
      joint('c', { delta: 0, status: 'ok' }),
    ];
    const r = formScorer(comparison(rows, { score: 100 }), 'a');
    expect(r.cls).toBe('correct');
    expect(r.conf).toBeCloseTo(0.97, 5);
  });

  it('floor of conf is 0.85 when score is 0 but all joints ok', () => {
    const rows = [
      joint('a', { delta: 0, status: 'ok' }),
      joint('b', { delta: 0, status: 'ok' }),
      joint('c', { delta: 0, status: 'ok' }),
    ];
    const r = formScorer(comparison(rows, { score: 0 }), 'a');
    expect(r.cls).toBe('correct');
    expect(r.conf).toBeCloseTo(0.85, 5);
  });

  it('low sample (validCount < 3) applies the -0.15 confidence penalty', () => {
    const rows = [
      joint('right_shoulder', { delta: 1, status: 'ok' }),
      joint('left_shoulder', { delta: 1, status: 'ok' }),
    ];
    // Only 2 valid joints -> lowSample true.
    const c = comparison(rows, { score: 100, validCount: 2 });
    const full = formScorer(comparison(rows, { score: 100, validCount: 3 }), 'right_shoulder');
    const penalized = formScorer(c, 'right_shoulder');

    expect(penalized.cls).toBe('correct');
    // full conf is the 0.97 cap; penalized is 0.97 - 0.15 = 0.82.
    expect(full.conf).toBeCloseTo(0.97, 5);
    expect(penalized.conf).toBeCloseTo(0.82, 5);
    expect(penalized.conf).toBeCloseTo(full.conf - 0.15, 5);
  });
});

// ---- undershoot (single error on the primary joint) -----------------------

describe('formScorer · undershoot', () => {
  it('classifies a single bad PRIMARY joint as undershoot', () => {
    const rows = [
      joint('right_shoulder', { delta: 40, tol: 15, status: 'bad' }), // worst, primary
      joint('left_shoulder', { delta: 2, status: 'ok' }),
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const c = comparison(rows, { score: 50 });
    const r = formScorer(c, 'right_shoulder');

    expect(r.cls).toBe('undershoot');
    expect(r.label).toBe('undershoot target');
    expect(r.labelTh).toBe('ทำไม่ถึงเป้า');
    expect(r.detail).toMatch(/Target joint .* is 40° from its goal/);
    expect(r.conf).toBeGreaterThanOrEqual(0.5);
    expect(r.conf).toBeLessThanOrEqual(0.95);
  });

  it('classifies a single WARN primary joint as undershoot (warn counts as off)', () => {
    const rows = [
      joint('right_shoulder', { delta: 22, tol: 15, status: 'warn' }), // off, primary
      joint('left_shoulder', { delta: 2, status: 'ok' }),
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const r = formScorer(comparison(rows, { score: 70 }), 'right_shoulder');
    expect(r.cls).toBe('undershoot');
    expect(r.label).toBe('undershoot target');
  });

  it('confidence rises with overshoot: 0.55 + (delta/tol - 1)*0.18, capped 0.95', () => {
    // delta == tol -> overshoot 0 -> conf 0.55.
    const rowsAtTol = [
      joint('right_shoulder', { delta: 15, tol: 15, status: 'warn' }),
      joint('left_shoulder', { delta: 1, status: 'ok' }),
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const atTol = formScorer(comparison(rowsAtTol, { score: 70 }), 'right_shoulder');
    expect(atTol.cls).toBe('undershoot');
    expect(atTol.conf).toBeCloseTo(0.55, 5);

    // delta = 2*tol -> overshoot 1 -> 0.55 + 0.18 = 0.73.
    const rowsDeep = [
      joint('right_shoulder', { delta: 30, tol: 15, status: 'bad' }),
      joint('left_shoulder', { delta: 1, status: 'ok' }),
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const deep = formScorer(comparison(rowsDeep, { score: 40 }), 'right_shoulder');
    expect(deep.conf).toBeCloseTo(0.73, 5);
  });

  it('caps error-class confidence at 0.95 for a very large overshoot', () => {
    const rows = [
      joint('right_shoulder', { delta: 200, tol: 15, status: 'bad' }),
      joint('left_shoulder', { delta: 1, status: 'ok' }),
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const r = formScorer(comparison(rows, { score: 10 }), 'right_shoulder');
    expect(r.cls).toBe('undershoot');
    expect(r.conf).toBeCloseTo(0.95, 5);
  });
});

// ---- lean (single error on a NON-primary joint) ---------------------------

describe('formScorer · lean', () => {
  it('classifies a single bad NON-primary joint as lean', () => {
    const rows = [
      joint('right_shoulder', { delta: 3, status: 'ok' }),       // primary, fine
      joint('left_hip', { delta: 38, tol: 15, status: 'bad' }),  // worst, NOT primary
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const c = comparison(rows, { score: 55 });
    const r = formScorer(c, 'right_shoulder');

    expect(r.cls).toBe('lean');
    expect(r.label).toBe('compensating / leaning');
    expect(r.labelTh).toBe('เอนชดเชย');
    expect(r.detail).toMatch(/is compensating \(38° off\)/);
    expect(r.conf).toBeGreaterThanOrEqual(0.5);
    expect(r.conf).toBeLessThanOrEqual(0.95);
  });

  it('treats a single warn non-primary joint as lean too', () => {
    const rows = [
      joint('right_shoulder', { delta: 2, status: 'ok' }),
      joint('left_hip', { delta: 20, tol: 15, status: 'warn' }), // off, non-primary
    ];
    const r = formScorer(comparison(rows, { score: 75, validCount: 3 }), 'right_shoulder');
    expect(r.cls).toBe('lean');
  });

  it('a single off non-primary joint with no primaryJoint match is lean', () => {
    const rows = [
      joint('left_knee', { delta: 25, tol: 15, status: 'bad' }),
      joint('right_knee', { delta: 2, status: 'ok' }),
      joint('right_shoulder', { delta: 2, status: 'ok' }),
    ];
    // primaryJoint is something not in the off set.
    const r = formScorer(comparison(rows, { score: 60 }), 'right_shoulder');
    expect(r.cls).toBe('lean');
  });
});

// ---- multi (two or more 'bad' joints) -------------------------------------

describe('formScorer · multi', () => {
  it('classifies two bad joints as multi regardless of which is primary', () => {
    const rows = [
      joint('right_shoulder', { delta: 45, tol: 15, status: 'bad' }), // worst + primary
      joint('left_hip', { delta: 35, tol: 15, status: 'bad' }),
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const c = comparison(rows, { score: 30 });
    const r = formScorer(c, 'right_shoulder');

    expect(r.cls).toBe('multi');
    expect(r.label).toBe('multiple errors');
    expect(r.labelTh).toBe('ผิดหลายจุด');
    expect(r.detail).toMatch(/2 joints clearly off/);
    expect(r.detailTh).toMatch(/ข้อต่อ 2 จุดผิดชัดเจน/);
  });

  it('multi takes precedence over undershoot even when primary is the worst', () => {
    const rows = [
      joint('right_shoulder', { delta: 60, tol: 15, status: 'bad' }), // primary worst
      joint('right_hip', { delta: 40, tol: 15, status: 'bad' }),
    ];
    const r = formScorer(comparison(rows, { score: 20, validCount: 3 }), 'right_shoulder');
    expect(r.cls).toBe('multi');
  });

  it('one bad + one warn is NOT multi (only one "bad") -> single-error class', () => {
    const rows = [
      joint('right_shoulder', { delta: 40, tol: 15, status: 'bad' }), // worst, primary
      joint('left_hip', { delta: 20, tol: 15, status: 'warn' }),
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const r = formScorer(comparison(rows, { score: 45 }), 'right_shoulder');
    // bad.length === 1 -> not multi. Worst is the primary -> undershoot.
    expect(r.cls).toBe('undershoot');
  });

  it('reports the worst joint and its rounded degrees in multi detail', () => {
    const rows = [
      joint('right_shoulder', { delta: 50.6, tol: 15, status: 'bad' }), // worst
      joint('left_hip', { delta: 31.2, tol: 15, status: 'bad' }),
    ];
    const r = formScorer(comparison(rows, { score: 25, validCount: 3 }), 'left_hip');
    expect(r.cls).toBe('multi');
    expect(r.detail).toMatch(/worst: right shoulder, 51°/); // round(50.6) === 51
  });
});

// ---- low-sample penalty on error classes ----------------------------------

describe('formScorer · low-sample penalty (error classes)', () => {
  it('subtracts ~0.15 from error-class conf when validCount < 3', () => {
    const rows = [
      joint('right_shoulder', { delta: 30, tol: 15, status: 'bad' }), // primary, overshoot=1
      joint('left_shoulder', { delta: 1, status: 'ok' }),
    ];
    // Same rows, just toggling validCount across the threshold of 3.
    const full = formScorer(comparison(rows, { score: 40, validCount: 3 }), 'right_shoulder');
    const low = formScorer(comparison(rows, { score: 40, validCount: 2 }), 'right_shoulder');

    expect(full.cls).toBe('undershoot');
    expect(low.cls).toBe('undershoot');
    // full conf = 0.55 + 1*0.18 = 0.73 ; low = 0.73 - 0.15 = 0.58.
    expect(full.conf).toBeCloseTo(0.73, 5);
    expect(low.conf).toBeCloseTo(0.58, 5);
    expect(low.conf).toBeCloseTo(full.conf - 0.15, 5);
  });
});

// ---- general invariants ---------------------------------------------------

describe('formScorer · invariants', () => {
  it('always returns the full result shape with all six keys', () => {
    const rows = [
      joint('right_shoulder', { delta: 25, tol: 15, status: 'bad' }),
      joint('left_shoulder', { delta: 2, status: 'ok' }),
      joint('right_elbow', { delta: 1, tol: 12, status: 'ok' }),
    ];
    const r = formScorer(comparison(rows, { score: 60 }), 'right_shoulder');
    expect(Object.keys(r).sort()).toEqual(
      ['cls', 'conf', 'detail', 'detailTh', 'label', 'labelTh'].sort(),
    );
  });

  it('conf is always a number within [0, 1] across all class outcomes', () => {
    const cases = [
      // correct
      formScorer(
        comparison(
          [joint('a', { status: 'ok' }), joint('b', { status: 'ok' }), joint('c', { status: 'ok' })],
          { score: 88 },
        ),
        'a',
      ),
      // undershoot
      formScorer(
        comparison(
          [joint('a', { delta: 30, tol: 15, status: 'bad' }), joint('b', { status: 'ok' }), joint('c', { status: 'ok' })],
          { score: 40 },
        ),
        'a',
      ),
      // lean
      formScorer(
        comparison(
          [joint('a', { status: 'ok' }), joint('b', { delta: 30, tol: 15, status: 'bad' }), joint('c', { status: 'ok' })],
          { score: 40 },
        ),
        'a',
      ),
      // multi
      formScorer(
        comparison(
          [joint('a', { delta: 40, tol: 15, status: 'bad' }), joint('b', { delta: 30, tol: 15, status: 'bad' })],
          { score: 20, validCount: 3 },
        ),
        'a',
      ),
      // null
      formScorer(null, 'a'),
    ];
    for (const r of cases) {
      expect(typeof r.conf).toBe('number');
      expect(r.conf).toBeGreaterThanOrEqual(0);
      expect(r.conf).toBeLessThanOrEqual(1);
      expect(FORM_CLASSES).toContain(r.cls);
    }
  });

  it('every returned cls is a member of FORM_CLASSES', () => {
    const rows = [
      joint('right_shoulder', { delta: 18, tol: 15, status: 'warn' }),
      joint('left_shoulder', { delta: 2, status: 'ok' }),
    ];
    const r = formScorer(comparison(rows, { score: 72, validCount: 3 }), 'left_hip');
    expect(FORM_CLASSES).toContain(r.cls);
  });
});
