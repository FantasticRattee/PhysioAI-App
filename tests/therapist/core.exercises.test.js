import {
  EXERCISES,
  isBuiltin,
  BODY_REGIONS,
  MOVEMENT_PATTERNS,
  COUNT_MODES,
  normalizeBodyRegionId,
  defaultPrimaryJoint,
  inferBodyRegion,
  getBodyRegion,
  getCustomExercises,
  getExercises,
  exerciseExists,
  getExercise,
  updateCustomExercise,
  exerciseSnapshot,
  exLabel,
  saveCustomExercise,
  deleteCustomExercise,
  romRange,
} from '../../Therapist/shared/core/exercises.js';

const fakeT = (k) => k;

beforeEach(() => {
  localStorage.clear();
});

describe('built-in EXERCISES library', () => {
  it('is a non-empty array with built-in shape', () => {
    expect(Array.isArray(EXERCISES)).toBe(true);
    expect(EXERCISES.length).toBeGreaterThan(0);
    for (const ex of EXERCISES) {
      expect(typeof ex.id).toBe('string');
      expect(typeof ex.key).toBe('string');
      expect(typeof ex.primaryJoint).toBe('string');
      expect(typeof ex.target).toBe('number');
      expect(typeof ex.rest).toBe('number');
      expect(['rep', 'hold']).toContain(ex.type);
      expect(['up', 'down', 'hold']).toContain(ex.dir);
      // every seed exercise is tagged builtin (defaulted at module load)
      expect(ex.source).toBe('builtin');
    }
  });

  it('contains the shoulder seed exercise with expected values', () => {
    const shoulder = EXERCISES.find((e) => e.id === 'shoulder');
    expect(shoulder).toBeDefined();
    expect(shoulder.primaryJoint).toBe('right_shoulder');
    expect(shoulder.bodyRegion).toBe('right_arm');
    expect(shoulder.target).toBe(158);
    expect(shoulder.rest).toBe(22);
  });
});

describe('isBuiltin', () => {
  it('treats built-in / source-less exercises as built-in', () => {
    expect(isBuiltin(EXERCISES[0])).toBe(true);
    expect(isBuiltin({})).toBe(true); // missing source defaults to builtin
    expect(isBuiltin({ source: 'builtin' })).toBe(true);
  });

  it('treats custom exercises as not built-in', () => {
    expect(isBuiltin({ source: 'custom' })).toBe(false);
  });
});

describe('constant tables', () => {
  it('BODY_REGIONS, MOVEMENT_PATTERNS, COUNT_MODES expose id + label entries', () => {
    expect(BODY_REGIONS.some((r) => r.id === 'full')).toBe(true);
    expect(BODY_REGIONS.some((r) => r.id === 'right_arm')).toBe(true);
    expect(MOVEMENT_PATTERNS.some((p) => p.id === 'bilateralSync')).toBe(true);
    expect(MOVEMENT_PATTERNS.some((p) => p.id === 'alternating')).toBe(true);
    expect(COUNT_MODES.some((m) => m.id === 'per_side')).toBe(true);
    expect(COUNT_MODES.some((m) => m.id === 'cycle')).toBe(true);
    for (const r of BODY_REGIONS) {
      expect(typeof r.id).toBe('string');
      expect(typeof r.label).toBe('string');
      expect(typeof r.labelTh).toBe('string');
    }
  });
});

describe('normalizeBodyRegionId', () => {
  it('maps aliases to canonical "full"', () => {
    expect(normalizeBodyRegionId('whole')).toBe('full');
    expect(normalizeBodyRegionId('whole_body')).toBe('full');
    expect(normalizeBodyRegionId('full_body')).toBe('full');
  });

  it('passes through valid region ids unchanged', () => {
    expect(normalizeBodyRegionId('right_arm')).toBe('right_arm');
    expect(normalizeBodyRegionId('left_leg')).toBe('left_leg');
  });

  it('falls back to "full" for unknown / default', () => {
    expect(normalizeBodyRegionId('nonsense')).toBe('full');
    expect(normalizeBodyRegionId()).toBe('full');
  });
});

describe('defaultPrimaryJoint', () => {
  it('returns the expected joint per region', () => {
    expect(defaultPrimaryJoint('upper')).toBe('right_shoulder');
    expect(defaultPrimaryJoint('shoulder')).toBe('right_shoulder');
    expect(defaultPrimaryJoint('right_arm')).toBe('right_shoulder');
    expect(defaultPrimaryJoint('left_arm')).toBe('left_shoulder');
    expect(defaultPrimaryJoint('lower')).toBe('right_knee');
    expect(defaultPrimaryJoint('right_leg')).toBe('right_knee');
    expect(defaultPrimaryJoint('left_leg')).toBe('left_knee');
  });

  it('defaults to right_knee for full / unknown', () => {
    expect(defaultPrimaryJoint('full')).toBe('right_knee');
    expect(defaultPrimaryJoint()).toBe('right_knee');
  });
});

describe('inferBodyRegion', () => {
  it('infers region from joint name', () => {
    expect(inferBodyRegion('left_shoulder')).toBe('left_arm');
    expect(inferBodyRegion('right_shoulder')).toBe('right_arm');
    expect(inferBodyRegion('left_elbow')).toBe('left_arm');
    expect(inferBodyRegion('right_elbow')).toBe('right_arm');
    expect(inferBodyRegion('left_knee')).toBe('left_leg');
    expect(inferBodyRegion('right_hip')).toBe('right_leg');
    expect(inferBodyRegion('neck')).toBe('shoulder');
  });

  it('falls back to full for missing/unknown joints', () => {
    expect(inferBodyRegion(undefined)).toBe('full');
    expect(inferBodyRegion('')).toBe('full');
    expect(inferBodyRegion('back')).toBe('full');
  });

  it('round-trips defaultPrimaryJoint -> inferBodyRegion for arm/leg regions', () => {
    for (const region of ['left_arm', 'right_arm', 'left_leg', 'right_leg']) {
      const joint = defaultPrimaryJoint(region);
      expect(inferBodyRegion(joint)).toBe(region);
    }
  });
});

describe('getBodyRegion', () => {
  it('prefers an explicit (normalized) bodyRegion', () => {
    expect(getBodyRegion({ bodyRegion: 'whole', primaryJoint: 'left_knee' })).toBe('full');
    expect(getBodyRegion({ bodyRegion: 'right_arm' })).toBe('right_arm');
  });

  it('infers from primaryJoint when bodyRegion absent', () => {
    expect(getBodyRegion({ primaryJoint: 'left_knee' })).toBe('left_leg');
  });

  it('returns full for empty input', () => {
    expect(getBodyRegion({})).toBe('full');
    expect(getBodyRegion(undefined)).toBe('full');
  });
});

describe('getExercise / exerciseExists / getExercises (built-ins)', () => {
  it('getExercise returns the matching built-in', () => {
    const ex = getExercise('shoulder');
    expect(ex.id).toBe('shoulder');
  });

  it('getExercise falls back to the first built-in for unknown ids', () => {
    const ex = getExercise('does-not-exist');
    expect(ex.id).toBe(EXERCISES[0].id);
  });

  it('exerciseExists reflects presence', () => {
    expect(exerciseExists('shoulder')).toBe(true);
    expect(exerciseExists('does-not-exist')).toBe(false);
  });

  it('getExercises returns built-ins when no custom exist', () => {
    expect(getCustomExercises()).toEqual([]);
    expect(getExercises().length).toBe(EXERCISES.length);
  });
});

describe('saveCustomExercise', () => {
  it('creates and persists a custom rep exercise', () => {
    const ex = saveCustomExercise({ label: 'My Curl', bodyRegion: 'right_arm', type: 'rep' });
    expect(ex.source).toBe('custom');
    expect(ex.label).toBe('My Curl');
    expect(ex.labelTh).toBe('My Curl');
    expect(ex.bodyRegion).toBe('right_arm');
    expect(ex.type).toBe('rep');
    expect(ex.dir).toBe('up');
    expect(ex.primaryJoint).toBe('right_shoulder'); // defaultPrimaryJoint('right_arm')
    expect(ex.id).toMatch(/^cust_/);
    expect(ex.key).toBe(ex.id);

    // persisted in localStorage and surfaced by getters
    const customs = getCustomExercises();
    expect(customs).toHaveLength(1);
    expect(customs[0].id).toBe(ex.id);
    expect(getExercises().some((e) => e.id === ex.id)).toBe(true);
    expect(getExercises().length).toBe(EXERCISES.length + 1);
    expect(exerciseExists(ex.id)).toBe(true);

    // round-trips through actual localStorage serialization
    const raw = JSON.parse(localStorage.getItem('physioai.v1.exercises.custom'));
    expect(raw[0].id).toBe(ex.id);
  });

  it('creates a hold exercise with hold defaults', () => {
    const ex = saveCustomExercise({ label: 'Plank', bodyRegion: 'full', type: 'hold' });
    expect(ex.type).toBe('hold');
    expect(ex.dir).toBe('hold');
    expect(ex.target).toBe(90);
    expect(ex.rest).toBe(90);
    expect(ex.holdSec).toBe(10);
    expect(ex.movementPattern).toBe('unilateral'); // hold forces unilateral
    expect(ex.repMode).toBe('single');
  });

  it('honors alternating movement pattern + count mode for rep exercises', () => {
    const ex = saveCustomExercise({
      label: 'Alt Raise',
      bodyRegion: 'right_leg',
      type: 'rep',
      movementPattern: 'alternating',
      countMode: 'cycle',
    });
    expect(ex.movementPattern).toBe('alternating');
    expect(ex.repMode).toBe('alternating');
    expect(ex.alternatingSides).toEqual(['left', 'right']);
    expect(ex.countMode).toBe('cycle');
  });

  it('getExercise can retrieve a saved custom exercise by id', () => {
    const ex = saveCustomExercise({ label: 'Find Me', bodyRegion: 'left_leg', type: 'rep' });
    expect(getExercise(ex.id).id).toBe(ex.id);
  });

  it('throws "required" when label is missing/blank', () => {
    expect(() => saveCustomExercise({ label: '', bodyRegion: 'full' })).toThrow('required');
    expect(() => saveCustomExercise({ label: '   ', bodyRegion: 'full' })).toThrow('required');
  });

  it('throws "required" when bodyRegion is missing', () => {
    expect(() => saveCustomExercise({ label: 'No Region' })).toThrow('required');
  });
});

describe('updateCustomExercise', () => {
  it('mutates an existing custom exercise and persists the patch', () => {
    const ex = saveCustomExercise({ label: 'Before', bodyRegion: 'full', type: 'rep' });
    const updated = updateCustomExercise(ex.id, { label: 'After', reps: 25 });
    expect(updated.label).toBe('After');
    expect(updated.reps).toBe(25);
    expect(updated.id).toBe(ex.id); // id preserved
    expect(updated.source).toBe('custom'); // source forced to custom

    // persisted
    expect(getCustomExercises()[0].label).toBe('After');
    expect(getCustomExercises()[0].reps).toBe(25);
  });

  it('cannot overwrite the id via patch', () => {
    const ex = saveCustomExercise({ label: 'Locked', bodyRegion: 'full', type: 'rep' });
    const updated = updateCustomExercise(ex.id, { id: 'hacked' });
    expect(updated.id).toBe(ex.id);
    expect(getCustomExercises()[0].id).toBe(ex.id);
  });

  it('throws Error("not-found") for an unknown id', () => {
    expect(() => updateCustomExercise('nope', {})).toThrow('not-found');
    let caught;
    try {
      updateCustomExercise('nope', {});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('not-found');
  });
});

describe('deleteCustomExercise', () => {
  it('removes a custom exercise', () => {
    const ex = saveCustomExercise({ label: 'Temp', bodyRegion: 'full', type: 'rep' });
    expect(getCustomExercises()).toHaveLength(1);
    deleteCustomExercise(ex.id);
    expect(getCustomExercises()).toHaveLength(0);
    expect(exerciseExists(ex.id)).toBe(false);
    expect(getExercises().length).toBe(EXERCISES.length);
  });

  it('is a no-op for unknown ids', () => {
    saveCustomExercise({ label: 'Keep', bodyRegion: 'full', type: 'rep' });
    deleteCustomExercise('not-there');
    expect(getCustomExercises()).toHaveLength(1);
  });
});

describe('exerciseSnapshot', () => {
  it('returns null for non-custom exercises', () => {
    expect(exerciseSnapshot(null)).toBeNull();
    expect(exerciseSnapshot(undefined)).toBeNull();
    expect(exerciseSnapshot(EXERCISES[0])).toBeNull(); // builtin source
    expect(exerciseSnapshot({ source: 'builtin' })).toBeNull();
  });

  it('returns a canonical snapshot for a custom exercise', () => {
    const ex = saveCustomExercise({ label: 'Snap', bodyRegion: 'right_arm', type: 'rep' });
    const snap = exerciseSnapshot(ex);
    expect(snap).not.toBeNull();
    expect(snap.id).toBe(ex.id);
    expect(snap.source).toBe('custom');
    expect(snap.label).toBe('Snap');
    expect(snap.primaryJoint).toBe(ex.primaryJoint);
    expect(snap.bodyRegion).toBe('right_arm');
    expect(snap.type).toBe('rep');
    expect(snap.target).toBe(ex.target);
    expect(snap.rest).toBe(ex.rest);
  });
});

describe('exLabel', () => {
  it('returns custom exercise label directly', () => {
    expect(exLabel({ source: 'custom', label: 'My Move' }, fakeT)).toBe('My Move');
  });

  it('falls back to id when custom label missing', () => {
    expect(exLabel({ source: 'custom', id: 'cust_x' }, fakeT)).toBe('cust_x');
  });

  it('uses the i18n key for built-ins', () => {
    const out = exLabel({ key: 'shoulder' }, fakeT);
    expect(typeof out).toBe('string');
    expect(out).toBe('ex_shoulder');
  });

  it('returns empty string for missing exercise', () => {
    expect(exLabel(null, fakeT)).toBe('');
    expect(exLabel(undefined, fakeT)).toBe('');
  });
});

describe('romRange', () => {
  it('returns the absolute target-rest difference when >= 20', () => {
    expect(romRange({ target: 158, rest: 22 })).toBe(136);
    expect(romRange({ target: 22, rest: 158 })).toBe(136); // absolute value
  });

  it('clamps to a minimum of 20', () => {
    expect(romRange({ target: 100, rest: 100 })).toBe(20);
    expect(romRange({ target: 105, rest: 100 })).toBe(20);
    expect(romRange({ target: 120, rest: 100 })).toBe(20); // exactly 20 boundary
    expect(romRange({ target: 121, rest: 100 })).toBe(21); // just above boundary
  });
});
