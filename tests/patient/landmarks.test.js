import { LANDMARK_NAMES, idx } from '../../Patient/src/ai/landmarks.js';

describe('landmarks (BlazePose schema)', () => {
  it('exposes the 33 BlazePose landmark names', () => {
    expect(Array.isArray(LANDMARK_NAMES)).toBe(true);
    expect(LANDMARK_NAMES).toHaveLength(33);
    expect(LANDMARK_NAMES[0]).toBe('nose');
  });

  it('idx() returns the index of a known landmark', () => {
    expect(idx('nose')).toBe(0);
    expect(idx('left_shoulder')).toBe(LANDMARK_NAMES.indexOf('left_shoulder'));
    expect(idx('left_shoulder')).toBeGreaterThanOrEqual(0);
  });

  it('idx() returns -1 for an unknown landmark', () => {
    expect(idx('not_a_landmark')).toBe(-1);
  });
});
