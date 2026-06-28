// Tests for Patient/src/core/exercises.js — the pure seed exercise library and
// its normalization / lookup helpers. No React-Native imports, no fetch, no clock.
import {
  EXERCISES,
  isBuiltin,
  BODY_REGIONS,
  normalizeBodyRegionId,
  defaultPrimaryJoint,
  inferBodyRegion,
  getBodyRegion,
  normalizeExerciseSnapshot,
  findExercise,
  getExercise,
  exerciseExists,
  romRange,
} from '../../Patient/src/core/exercises.js';

describe('EXERCISES seed library', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(EXERCISES)).toBe(true);
    expect(EXERCISES.length).toBeGreaterThan(0);
  });

  it('every entry has the required canonical fields and source defaulted to builtin', () => {
    for (const ex of EXERCISES) {
      expect(typeof ex.id).toBe('string');
      expect(ex.id.length).toBeGreaterThan(0);
      expect(typeof ex.key).toBe('string');
      expect(typeof ex.primaryJoint).toBe('string');
      expect(typeof ex.bodyRegion).toBe('string');
      expect(Number.isFinite(ex.target)).toBe(true);
      expect(Number.isFinite(ex.rest)).toBe(true);
      expect(Number.isFinite(ex.tol)).toBe(true);
      expect(['rep', 'hold']).toContain(ex.type);
      expect(ex.source).toBe('builtin');
    }
  });

  it('has unique ids', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes the known "shoulder" exercise with its exact seed values', () => {
    const shoulder = EXERCISES.find((e) => e.id === 'shoulder');
    expect(shoulder).toBeDefined();
    expect(shoulder).toMatchObject({
      id: 'shoulder',
      key: 'shoulder',
      primaryJoint: 'right_shoulder',
      bodyRegion: 'right_arm',
      dir: 'up',
      target: 158,
      rest: 22,
      tol: 15,
      type: 'rep',
      source: 'builtin',
    });
  });
});

describe('isBuiltin', () => {
  it('treats every seed exercise as builtin', () => {
    for (const ex of EXERCISES) expect(isBuiltin(ex)).toBe(true);
  });

  it('defaults missing source to builtin', () => {
    expect(isBuiltin({ id: 'x' })).toBe(true);
    expect(isBuiltin(undefined)).toBe(true);
    expect(isBuiltin(null)).toBe(true);
  });

  it('returns false for an explicit custom source', () => {
    expect(isBuiltin({ id: 'x', source: 'custom' })).toBe(false);
  });
});

describe('BODY_REGIONS', () => {
  it('contains the expected canonical region ids', () => {
    const ids = BODY_REGIONS.map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'full', 'upper', 'lower', 'shoulder',
        'left_arm', 'right_arm', 'left_leg', 'right_leg',
      ]),
    );
  });

  it('each region carries a label and a Thai label', () => {
    for (const r of BODY_REGIONS) {
      expect(typeof r.label).toBe('string');
      expect(typeof r.labelTh).toBe('string');
    }
  });
});

describe('normalizeBodyRegionId', () => {
  it('passes through a known canonical id unchanged', () => {
    expect(normalizeBodyRegionId('left_arm')).toBe('left_arm');
    expect(normalizeBodyRegionId('right_leg')).toBe('right_leg');
  });

  it('maps known aliases to canonical "full"', () => {
    expect(normalizeBodyRegionId('whole')).toBe('full');
    expect(normalizeBodyRegionId('whole_body')).toBe('full');
    expect(normalizeBodyRegionId('full_body')).toBe('full');
  });

  it('falls back to "full" for unknown ids', () => {
    expect(normalizeBodyRegionId('nonsense')).toBe('full');
    expect(normalizeBodyRegionId('')).toBe('full');
  });

  it('defaults to "full" when called with no argument', () => {
    expect(normalizeBodyRegionId()).toBe('full');
  });
});

describe('defaultPrimaryJoint', () => {
  it('maps upper / shoulder / right_arm to right_shoulder', () => {
    expect(defaultPrimaryJoint('upper')).toBe('right_shoulder');
    expect(defaultPrimaryJoint('shoulder')).toBe('right_shoulder');
    expect(defaultPrimaryJoint('right_arm')).toBe('right_shoulder');
  });

  it('maps left_arm to left_shoulder', () => {
    expect(defaultPrimaryJoint('left_arm')).toBe('left_shoulder');
  });

  it('maps lower / right_leg to right_knee', () => {
    expect(defaultPrimaryJoint('lower')).toBe('right_knee');
    expect(defaultPrimaryJoint('right_leg')).toBe('right_knee');
  });

  it('maps left_leg to left_knee', () => {
    expect(defaultPrimaryJoint('left_leg')).toBe('left_knee');
  });

  it('defaults to right_knee for full / unknown / no argument', () => {
    expect(defaultPrimaryJoint('full')).toBe('right_knee');
    expect(defaultPrimaryJoint('???')).toBe('right_knee');
    expect(defaultPrimaryJoint()).toBe('right_knee');
  });

  it('normalizes aliases before mapping (whole -> full -> right_knee)', () => {
    expect(defaultPrimaryJoint('whole')).toBe('right_knee');
  });
});

describe('inferBodyRegion', () => {
  it('returns "full" for falsy joints', () => {
    expect(inferBodyRegion()).toBe('full');
    expect(inferBodyRegion('')).toBe('full');
    expect(inferBodyRegion(null)).toBe('full');
  });

  it('maps neck to shoulder', () => {
    expect(inferBodyRegion('neck')).toBe('shoulder');
  });

  it('maps left shoulder / elbow to left_arm', () => {
    expect(inferBodyRegion('left_shoulder')).toBe('left_arm');
    expect(inferBodyRegion('left_elbow')).toBe('left_arm');
  });

  it('maps right shoulder / elbow to right_arm', () => {
    expect(inferBodyRegion('right_shoulder')).toBe('right_arm');
    expect(inferBodyRegion('right_elbow')).toBe('right_arm');
  });

  it('maps a generic shoulder containing joint to shoulder', () => {
    // not left_/right_ shoulder, but contains "shoulder"
    expect(inferBodyRegion('mid_shoulder')).toBe('shoulder');
  });

  it('maps left hip / knee / ankle to left_leg', () => {
    expect(inferBodyRegion('left_hip')).toBe('left_leg');
    expect(inferBodyRegion('left_knee')).toBe('left_leg');
    expect(inferBodyRegion('left_ankle')).toBe('left_leg');
  });

  it('maps right hip / knee / ankle to right_leg', () => {
    expect(inferBodyRegion('right_hip')).toBe('right_leg');
    expect(inferBodyRegion('right_knee')).toBe('right_leg');
    expect(inferBodyRegion('right_ankle')).toBe('right_leg');
  });

  it('falls back to "full" for unrecognized joints', () => {
    expect(inferBodyRegion('back')).toBe('full');
    expect(inferBodyRegion('wrist')).toBe('full');
  });

  it('round-trips with defaultPrimaryJoint for left_arm', () => {
    const joint = defaultPrimaryJoint('left_arm'); // left_shoulder
    expect(inferBodyRegion(joint)).toBe('left_arm');
  });

  it('round-trips with defaultPrimaryJoint for left_leg', () => {
    const joint = defaultPrimaryJoint('left_leg'); // left_knee
    expect(inferBodyRegion(joint)).toBe('left_leg');
  });

  it('round-trips with defaultPrimaryJoint for right_arm', () => {
    const joint = defaultPrimaryJoint('right_arm'); // right_shoulder
    expect(inferBodyRegion(joint)).toBe('right_arm');
  });
});

describe('getBodyRegion', () => {
  it('uses the explicit bodyRegion (normalized) when present', () => {
    expect(getBodyRegion({ bodyRegion: 'left_arm', primaryJoint: 'right_knee' })).toBe('left_arm');
  });

  it('normalizes an aliased bodyRegion', () => {
    expect(getBodyRegion({ bodyRegion: 'whole_body' })).toBe('full');
  });

  it('infers from primaryJoint when bodyRegion is absent', () => {
    expect(getBodyRegion({ primaryJoint: 'left_knee' })).toBe('left_leg');
  });

  it('returns "full" for an empty / nullish exercise', () => {
    expect(getBodyRegion({})).toBe('full');
    expect(getBodyRegion(null)).toBe('full');
    expect(getBodyRegion(undefined)).toBe('full');
  });

  it('matches the stored bodyRegion for a seed exercise', () => {
    const knee = EXERCISES.find((e) => e.id === 'knee');
    expect(getBodyRegion(knee)).toBe('right_leg');
  });
});

describe('findExercise', () => {
  it('returns the builtin entry for a known id', () => {
    const ex = findExercise('shoulder');
    expect(ex).toBe(EXERCISES.find((e) => e.id === 'shoulder'));
    expect(ex.id).toBe('shoulder');
  });

  it('returns null for an unknown id with no custom list', () => {
    expect(findExercise('nope')).toBeNull();
  });

  it('resolves a custom exercise from the custom list', () => {
    const custom = [{ id: 'my_custom', source: 'custom', primaryJoint: 'left_elbow', type: 'rep' }];
    const ex = findExercise('my_custom', custom);
    expect(ex).not.toBeNull();
    expect(ex.id).toBe('my_custom');
    expect(ex.source).toBe('custom');
  });

  it('returns null when the id is absent from both builtin and custom', () => {
    const custom = [{ id: 'other', source: 'custom' }];
    expect(findExercise('missing', custom)).toBeNull();
  });

  it('prefers the builtin entry over a same-id custom entry', () => {
    const custom = [{ id: 'shoulder', source: 'custom', target: 999 }];
    const ex = findExercise('shoulder', custom);
    expect(ex).toBe(EXERCISES.find((e) => e.id === 'shoulder'));
    expect(ex.target).toBe(158);
  });
});

describe('getExercise', () => {
  it('returns the matching exercise when found', () => {
    expect(getExercise('knee').id).toBe('knee');
  });

  it('falls back to EXERCISES[0] for an unknown id', () => {
    expect(getExercise('nope')).toBe(EXERCISES[0]);
  });

  it('falls back to EXERCISES[0] when custom list also lacks the id', () => {
    expect(getExercise('nope', [{ id: 'x', source: 'custom' }])).toBe(EXERCISES[0]);
  });
});

describe('exerciseExists', () => {
  it('is true for a builtin id', () => {
    expect(exerciseExists('hip')).toBe(true);
  });

  it('is false for an unknown id', () => {
    expect(exerciseExists('nope')).toBe(false);
  });

  it('is true for a custom id present in the custom list', () => {
    expect(exerciseExists('cx', [{ id: 'cx', source: 'custom' }])).toBe(true);
  });

  it('is false for an id absent from the custom list', () => {
    expect(exerciseExists('cx', [{ id: 'other', source: 'custom' }])).toBe(false);
  });
});

describe('romRange', () => {
  it('computes the absolute difference for a large-range exercise', () => {
    // shoulder: target 158, rest 22 -> |158-22| = 136
    const shoulder = EXERCISES.find((e) => e.id === 'shoulder');
    expect(romRange(shoulder)).toBe(136);
  });

  it('clamps a small-range exercise to the floor of 20', () => {
    expect(romRange({ target: 100, rest: 95 })).toBe(20); // |5| -> floor 20
    expect(romRange({ target: 70, rest: 70 })).toBe(20);  // hold-style, |0| -> 20
  });

  it('returns exactly 20 at the boundary (diff == 20)', () => {
    expect(romRange({ target: 120, rest: 100 })).toBe(20);
  });

  it('returns the diff when it just exceeds the floor (diff == 21)', () => {
    expect(romRange({ target: 121, rest: 100 })).toBe(21);
  });

  it('is sign-independent (uses absolute value)', () => {
    expect(romRange({ target: 30, rest: 170 })).toBe(140);
  });
});

describe('normalizeExerciseSnapshot', () => {
  it('returns null for non-object / junk input', () => {
    expect(normalizeExerciseSnapshot(null)).toBeNull();
    expect(normalizeExerciseSnapshot(undefined)).toBeNull();
    expect(normalizeExerciseSnapshot('string')).toBeNull();
    expect(normalizeExerciseSnapshot(42)).toBeNull();
    expect(normalizeExerciseSnapshot({})).toBeNull(); // no id
  });

  it('returns the canonical builtin object for a known id (non-custom)', () => {
    const known = EXERCISES.find((e) => e.id === 'shoulder');
    expect(normalizeExerciseSnapshot({ id: 'shoulder' })).toBe(known);
  });

  it('does NOT short-circuit to builtin when source is custom, even for a known id', () => {
    const out = normalizeExerciseSnapshot({ id: 'shoulder', source: 'custom', target: 100, rest: 30 });
    expect(out).not.toBe(EXERCISES.find((e) => e.id === 'shoulder'));
    expect(out.source).toBe('custom');
    expect(out.target).toBe(100);
  });

  it('coerces a minimal raw custom object into canonical shape with defaults', () => {
    const out = normalizeExerciseSnapshot({ id: 'cust1', primaryJoint: 'right_knee', type: 'rep' });
    expect(out).toMatchObject({
      id: 'cust1',
      key: 'cust1',
      source: 'custom',
      icon: 'body',
      accent: '#7BA88F',
      primaryJoint: 'right_knee',
      dominantJoint: 'right_knee',
      bodyRegion: 'right_leg', // inferred from right_knee
      type: 'rep',
      dir: 'up',
      target: 120, // rep default
      rest: 30,    // rep default
      tol: 15,     // non-elbow/back/neck default
      reps: 10,
      sets: 3,
      holdSec: 1.5,
    });
    // labels default to id when absent
    expect(out.label).toBe('cust1');
    expect(out.labelTh).toBe('cust1');
  });

  it('applies hold-type defaults when type is "hold"', () => {
    const out = normalizeExerciseSnapshot({ id: 'h1', primaryJoint: 'right_knee', type: 'hold' });
    expect(out.type).toBe('hold');
    expect(out.dir).toBe('hold');
    expect(out.target).toBe(90);
    expect(out.rest).toBe(90);
    expect(out.holdSec).toBe(10);
  });

  it('uses tol default of 12 for elbow / back / neck joints', () => {
    expect(normalizeExerciseSnapshot({ id: 'e', primaryJoint: 'left_elbow' }).tol).toBe(12);
    expect(normalizeExerciseSnapshot({ id: 'b', primaryJoint: 'back' }).tol).toBe(12);
    expect(normalizeExerciseSnapshot({ id: 'n', primaryJoint: 'neck' }).tol).toBe(12);
  });

  it('prefers dominantJoint over primaryJoint for the resolved primaryJoint', () => {
    const out = normalizeExerciseSnapshot({ id: 'd', dominantJoint: 'left_shoulder', primaryJoint: 'right_knee' });
    expect(out.primaryJoint).toBe('left_shoulder');
    expect(out.dominantJoint).toBe('left_shoulder');
  });

  it('derives primaryJoint from bodyRegion default when no joint is given', () => {
    const out = normalizeExerciseSnapshot({ id: 'r', bodyRegion: 'left_arm' });
    expect(out.bodyRegion).toBe('left_arm');
    expect(out.primaryJoint).toBe('left_shoulder'); // defaultPrimaryJoint('left_arm')
  });

  it('preserves explicit finite numeric overrides', () => {
    const out = normalizeExerciseSnapshot({
      id: 'ov', primaryJoint: 'right_knee', type: 'rep',
      target: 150, rest: 40, tol: 9, reps: 7, sets: 4, holdSec: 2.5,
    });
    expect(out.target).toBe(150);
    expect(out.rest).toBe(40);
    expect(out.tol).toBe(9);
    expect(out.reps).toBe(7);
    expect(out.sets).toBe(4);
    expect(out.holdSec).toBe(2.5);
  });

  it('honors a provided source other than custom', () => {
    const out = normalizeExerciseSnapshot({ id: 'cu', source: 'builtin', primaryJoint: 'right_knee' });
    expect(out.source).toBe('builtin');
  });

  it('passes through label/labelTh when provided', () => {
    const out = normalizeExerciseSnapshot({ id: 'L', primaryJoint: 'right_knee', label: 'My Ex', labelTh: 'ของฉัน' });
    expect(out.label).toBe('My Ex');
    expect(out.labelTh).toBe('ของฉัน');
  });

  it('produces an object whose getBodyRegion matches its bodyRegion (self-consistent)', () => {
    const out = normalizeExerciseSnapshot({ id: 'sc', primaryJoint: 'left_hip' });
    expect(getBodyRegion(out)).toBe(out.bodyRegion);
    expect(out.bodyRegion).toBe('left_leg');
  });
});
