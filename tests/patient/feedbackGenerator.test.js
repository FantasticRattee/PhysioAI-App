// Tests for Patient AI · FeedbackGenerator (delta -> single bilingual cue).
//
// i18n is mocked so cue text is deterministic and AsyncStorage is never touched.
// The mock mirrors the real call signature t(key, vars, lang): it echoes the key,
// and when vars is provided appends ':' + JSON.stringify(vars). The lang arg is
// ignored by the mock (the real cue id/tone logic does not depend on it).
jest.mock('../../Patient/src/core/i18n.js', () => ({
  t: (key, vars) => (vars ? key + ':' + JSON.stringify(vars) : key),
}));

import { makeCue } from '../../Patient/src/ai/FeedbackGenerator.js';

// Build a `primary` (worst-joint) row matching PoseComparator's shape.
function primaryRow({ joint, status, delta, live, ref }) {
  return { joint, label: joint, labelTh: joint, ref, live, tol: 15, delta, status, score: 50 };
}

// Build a full comparison object accepted by makeCue.
function comparison({ score = 80, validCount = 8, primary = null } = {}) {
  return { score, validCount, primary, joints: [] };
}

describe('FeedbackGenerator · makeCue · no-pose / invalid inputs', () => {
  it('returns the no-pose cue when comparison is null', () => {
    const cue = makeCue(null, 'en');
    expect(cue).toEqual({ id: 'nopose', text: 'cueNoPose', tone: 'none' });
  });

  it('returns the no-pose cue when comparison is undefined', () => {
    const cue = makeCue(undefined, 'en');
    expect(cue.id).toBe('nopose');
    expect(cue.tone).toBe('none');
  });

  it('returns the no-pose cue when score is null', () => {
    const cue = makeCue(comparison({ score: null, validCount: 5 }), 'en');
    expect(cue).toEqual({ id: 'nopose', text: 'cueNoPose', tone: 'none' });
  });

  it('returns the no-pose cue when score is undefined (== null)', () => {
    // Build the object literally so the helper default does not backfill score.
    const cue = makeCue({ score: undefined, validCount: 5, primary: null, joints: [] }, 'en');
    expect(cue.id).toBe('nopose');
    expect(cue.tone).toBe('none');
  });

  it('returns the no-pose cue when validCount is 0 even with a numeric score', () => {
    const cue = makeCue(comparison({ score: 100, validCount: 0 }), 'en');
    expect(cue).toEqual({ id: 'nopose', text: 'cueNoPose', tone: 'none' });
  });

  it('treats score 0 as a valid pose (0 != null), not no-pose', () => {
    const cue = makeCue(comparison({ score: 0, validCount: 4, primary: null }), 'en');
    // No primary needing correction -> falls through to good-form branch.
    expect(cue.id).not.toBe('nopose');
    expect(cue.tone).toBe('good');
  });
});

describe('FeedbackGenerator · makeCue · all-joints-within-tolerance (praise) branch', () => {
  it('near-perfect score >= 92 yields the perfect praise cue with good tone', () => {
    const cue = makeCue(comparison({ score: 92, validCount: 8, primary: null }), 'en');
    expect(cue).toEqual({ id: 'good', text: 'cuePerfect', tone: 'good' });
  });

  it('score above 92 also yields the perfect cue', () => {
    const cue = makeCue(comparison({ score: 99, validCount: 8, primary: null }), 'en');
    expect(cue.id).toBe('good');
    expect(cue.text).toBe('cuePerfect');
    expect(cue.tone).toBe('good');
  });

  it('score just below the 92 boundary (91) yields the good-form (not perfect) cue', () => {
    const cue = makeCue(comparison({ score: 91, validCount: 8, primary: null }), 'en');
    expect(cue).toEqual({ id: 'good', text: 'cueGoodForm', tone: 'good' });
  });

  it('mid-range score with no actionable primary still yields good-form praise', () => {
    const cue = makeCue(comparison({ score: 70, validCount: 6, primary: null }), 'en');
    expect(cue.id).toBe('good');
    expect(cue.text).toBe('cueGoodForm');
    expect(cue.tone).toBe('good');
  });

  it('an "ok" primary (within tolerance) is ignored and praise is returned', () => {
    const p = primaryRow({ joint: 'right_elbow', status: 'ok', delta: 5, live: 100, ref: 105 });
    const cue = makeCue(comparison({ score: 95, validCount: 8, primary: p }), 'en');
    // status === 'ok' -> not actionable -> praise branch (score >= 92 -> perfect).
    expect(cue.id).toBe('good');
    expect(cue.text).toBe('cuePerfect');
    expect(cue.tone).toBe('good');
  });

  it('a primary with null delta is ignored and praise is returned', () => {
    const p = primaryRow({ joint: 'right_elbow', status: 'warn', delta: null, live: 100, ref: 105 });
    const cue = makeCue(comparison({ score: 80, validCount: 8, primary: p }), 'en');
    expect(cue.id).toBe('good');
    expect(cue.text).toBe('cueGoodForm');
    expect(cue.tone).toBe('good');
  });
});

describe('FeedbackGenerator · makeCue · directional correction (inc / dec)', () => {
  it('live < ref -> "inc" direction; tone mirrors the joint status', () => {
    // right_shoulder needs to raise (increase angle): live 60 < ref 100.
    const p = primaryRow({ joint: 'right_shoulder', status: 'warn', delta: 40, live: 60, ref: 100 });
    const cue = makeCue(comparison({ score: 55, validCount: 8, primary: p }), 'en');
    expect(cue.id).toBe('right_shoulder:inc');
    expect(cue.tone).toBe('warn');
    // verb for shoulder inc = 'jc_raise', limb = 'limb_r_arm', vars carry the resolved limb.
    expect(cue.text).toBe('jc_raise:' + JSON.stringify({ limb: 'limb_r_arm' }));
  });

  it('live > ref -> "dec" direction', () => {
    // right_shoulder needs to lower (decrease angle): live 120 > ref 80.
    const p = primaryRow({ joint: 'right_shoulder', status: 'bad', delta: 40, live: 120, ref: 80 });
    const cue = makeCue(comparison({ score: 30, validCount: 8, primary: p }), 'en');
    expect(cue.id).toBe('right_shoulder:dec');
    expect(cue.tone).toBe('bad');
    expect(cue.text).toBe('jc_lower:' + JSON.stringify({ limb: 'limb_r_arm' }));
  });

  it('live === ref -> "dec" (boundary: not strictly less-than)', () => {
    const p = primaryRow({ joint: 'left_knee', status: 'warn', delta: 0, live: 90, ref: 90 });
    const cue = makeCue(comparison({ score: 60, validCount: 8, primary: p }), 'en');
    expect(cue.id).toBe('left_knee:dec');
    expect(cue.tone).toBe('warn');
    // knee dec verb = 'jc_bend', limb = 'limb_l_knee'.
    expect(cue.text).toBe('jc_bend:' + JSON.stringify({ limb: 'limb_l_knee' }));
  });

  it('elbow inc uses jc_straighten with the correct limb key', () => {
    const p = primaryRow({ joint: 'left_elbow', status: 'warn', delta: 20, live: 70, ref: 150 });
    const cue = makeCue(comparison({ score: 50, validCount: 8, primary: p }), 'en');
    expect(cue.id).toBe('left_elbow:inc');
    expect(cue.tone).toBe('warn');
    expect(cue.text).toBe('jc_straighten:' + JSON.stringify({ limb: 'limb_l_elbow' }));
  });

  it('hip inc uses jc_open, hip dec uses jc_close', () => {
    const inc = makeCue(
      comparison({ score: 40, validCount: 8, primary: primaryRow({ joint: 'right_hip', status: 'bad', delta: 50, live: 30, ref: 110 }) }),
      'en',
    );
    expect(inc.id).toBe('right_hip:inc');
    expect(inc.text).toBe('jc_open:' + JSON.stringify({ limb: 'limb_r_hip' }));

    const dec = makeCue(
      comparison({ score: 40, validCount: 8, primary: primaryRow({ joint: 'right_hip', status: 'bad', delta: 50, live: 160, ref: 110 }) }),
      'en',
    );
    expect(dec.id).toBe('right_hip:dec');
    expect(dec.text).toBe('jc_close:' + JSON.stringify({ limb: 'limb_r_hip' }));
  });

  it('ankle/back/neck use jc_adjust for both directions but keep distinct id directions', () => {
    const inc = makeCue(
      comparison({ score: 45, validCount: 8, primary: primaryRow({ joint: 'left_ankle', status: 'warn', delta: 20, live: 70, ref: 95 }) }),
      'en',
    );
    expect(inc.id).toBe('left_ankle:inc');
    expect(inc.text).toBe('jc_adjust:' + JSON.stringify({ limb: 'limb_l_ankle' }));

    const dec = makeCue(
      comparison({ score: 45, validCount: 8, primary: primaryRow({ joint: 'back', status: 'bad', delta: 30, live: 120, ref: 90 }) }),
      'en',
    );
    expect(dec.id).toBe('back:dec');
    expect(dec.text).toBe('jc_adjust:' + JSON.stringify({ limb: 'limb_back' }));
  });

  it('neck joint resolves to limb_neck with jc_adjust', () => {
    const p = primaryRow({ joint: 'neck', status: 'warn', delta: 18, live: 10, ref: 40 });
    const cue = makeCue(comparison({ score: 55, validCount: 8, primary: p }), 'en');
    expect(cue.id).toBe('neck:inc');
    expect(cue.text).toBe('jc_adjust:' + JSON.stringify({ limb: 'limb_neck' }));
  });

  it('an unknown joint falls back to the default cue config (limb_r_arm / jc_adjust)', () => {
    const p = primaryRow({ joint: 'mystery_joint', status: 'bad', delta: 99, live: 200, ref: 10 });
    const cue = makeCue(comparison({ score: 10, validCount: 8, primary: p }), 'en');
    // delta direction: live(200) > ref(10) -> dec; default dec verb = 'jc_adjust'.
    expect(cue.id).toBe('mystery_joint:dec');
    expect(cue.tone).toBe('bad');
    expect(cue.text).toBe('jc_adjust:' + JSON.stringify({ limb: 'limb_r_arm' }));
  });

  it('actionable correction wins even when overall score is high (>= 92)', () => {
    // A high overall score but a non-ok primary still produces the directional cue,
    // never the praise branch.
    const p = primaryRow({ joint: 'left_shoulder', status: 'warn', delta: 35, live: 40, ref: 90 });
    const cue = makeCue(comparison({ score: 95, validCount: 8, primary: p }), 'en');
    expect(cue.id).toBe('left_shoulder:inc');
    expect(cue.tone).toBe('warn');
  });
});

describe('FeedbackGenerator · makeCue · output contract', () => {
  it('always returns an object with exactly id/text/tone keys', () => {
    const cases = [
      makeCue(null, 'en'),
      makeCue(comparison({ score: 100, validCount: 8, primary: null }), 'en'),
      makeCue(comparison({ score: 30, validCount: 8, primary: primaryRow({ joint: 'right_knee', status: 'bad', delta: 50, live: 30, ref: 120 }) }), 'en'),
    ];
    for (const cue of cases) {
      expect(Object.keys(cue).sort()).toEqual(['id', 'text', 'tone']);
      expect(typeof cue.id).toBe('string');
      expect(typeof cue.text).toBe('string');
      expect(['good', 'warn', 'bad', 'none']).toContain(cue.tone);
    }
  });

  it('id is stable across repeated calls with the same joint+direction', () => {
    const p = primaryRow({ joint: 'right_knee', status: 'bad', delta: 60, live: 40, ref: 130 });
    const a = makeCue(comparison({ score: 25, validCount: 8, primary: p }), 'en');
    const b = makeCue(comparison({ score: 25, validCount: 8, primary: p }), 'th');
    expect(a.id).toBe(b.id);
    expect(a.id).toBe('right_knee:inc');
  });
});
