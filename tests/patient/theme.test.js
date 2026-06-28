// Tests for Patient core theme tokens (pure module).
// Source: Patient/src/core/theme.js
import { colors, scoreTone, toneColor, skeletonColors } from '../../Patient/src/core/theme.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('theme.colors palette', () => {
  it('exports an object', () => {
    expect(colors).toBeInstanceOf(Object);
  });

  it('has all expected palette keys', () => {
    const expectedKeys = [
      'bg', 'surface', 'surface2', 'surface3',
      'line',
      'ink', 'ink2', 'ink3', 'inverse',
      'brand', 'brandSoft', 'accent',
      'good', 'warn', 'bad',
    ];
    expectedKeys.forEach((k) => {
      expect(colors).toHaveProperty(k);
    });
    expect(Object.keys(colors).sort()).toEqual(expectedKeys.sort());
  });

  it('every palette value is a 6-digit hex string', () => {
    Object.values(colors).forEach((v) => {
      expect(typeof v).toBe('string');
      expect(v).toMatch(HEX);
    });
  });

  it('has the exact expected tone colors', () => {
    expect(colors.good).toBe('#2F5D50');
    expect(colors.warn).toBe('#9C7344');
    expect(colors.bad).toBe('#8C4F40');
    expect(colors.ink3).toBe('#9CA3AF');
    expect(colors.brand).toBe('#2F5D50');
    expect(colors.bg).toBe('#F5F1E8');
  });
});

describe('scoreTone thresholds', () => {
  it('returns "none" for null', () => {
    expect(scoreTone(null)).toBe('none');
  });

  it('returns "none" for undefined (== null check)', () => {
    expect(scoreTone(undefined)).toBe('none');
  });

  it('returns "good" at and above 75', () => {
    expect(scoreTone(75)).toBe('good');
    expect(scoreTone(76)).toBe('good');
    expect(scoreTone(100)).toBe('good');
    expect(scoreTone(99.9)).toBe('good');
  });

  it('boundary: 74.999 is warn (just below good cutoff)', () => {
    expect(scoreTone(74.999)).toBe('warn');
    expect(scoreTone(74)).toBe('warn');
  });

  it('returns "warn" in [50, 75)', () => {
    expect(scoreTone(50)).toBe('warn');
    expect(scoreTone(60)).toBe('warn');
    expect(scoreTone(74)).toBe('warn');
  });

  it('boundary: 49.999 is bad (just below warn cutoff)', () => {
    expect(scoreTone(49.999)).toBe('bad');
    expect(scoreTone(49)).toBe('bad');
  });

  it('returns "bad" below 50', () => {
    expect(scoreTone(0)).toBe('bad');
    expect(scoreTone(25)).toBe('bad');
    expect(scoreTone(49)).toBe('bad');
  });

  it('handles negative scores as bad', () => {
    expect(scoreTone(-10)).toBe('bad');
  });

  it('zero is not treated as null (0 is bad, not none)', () => {
    expect(scoreTone(0)).toBe('bad');
  });
});

describe('toneColor', () => {
  it('maps "good" to colors.good hex', () => {
    expect(toneColor('good')).toBe(colors.good);
    expect(toneColor('good')).toMatch(HEX);
  });

  it('maps "warn" to colors.warn hex', () => {
    expect(toneColor('warn')).toBe(colors.warn);
  });

  it('maps "bad" to colors.bad hex', () => {
    expect(toneColor('bad')).toBe(colors.bad);
  });

  it('maps "none" to colors.ink3', () => {
    expect(toneColor('none')).toBe(colors.ink3);
  });

  it('returns default colors.ink3 for unknown tone', () => {
    expect(toneColor('purple')).toBe(colors.ink3);
    expect(toneColor('')).toBe(colors.ink3);
    expect(toneColor(undefined)).toBe(colors.ink3);
    expect(toneColor(null)).toBe(colors.ink3);
  });

  it('composes with scoreTone end-to-end', () => {
    expect(toneColor(scoreTone(80))).toBe(colors.good);
    expect(toneColor(scoreTone(60))).toBe(colors.warn);
    expect(toneColor(scoreTone(10))).toBe(colors.bad);
    expect(toneColor(scoreTone(null))).toBe(colors.ink3);
  });
});

describe('skeletonColors', () => {
  it('exports an object', () => {
    expect(skeletonColors).toBeInstanceOf(Object);
  });

  it('has exactly good/warn/bad/none keys', () => {
    expect(Object.keys(skeletonColors).sort()).toEqual(['bad', 'good', 'none', 'warn']);
  });

  it('each tone is an array of two hex colors', () => {
    ['good', 'warn', 'bad', 'none'].forEach((tone) => {
      const pair = skeletonColors[tone];
      expect(Array.isArray(pair)).toBe(true);
      expect(pair).toHaveLength(2);
      pair.forEach((c) => expect(c).toMatch(HEX));
    });
  });

  it('matches the exact expected color pairs', () => {
    expect(skeletonColors.good).toEqual(['#2F5D50', '#7BA88F']);
    expect(skeletonColors.warn).toEqual(['#9C7344', '#C8955A']);
    expect(skeletonColors.bad).toEqual(['#8C4F40', '#B86C5A']);
    expect(skeletonColors.none).toEqual(['#8A8275', '#8A8275']);
  });

  it('none pair has identical start/end colors', () => {
    expect(skeletonColors.none[0]).toBe(skeletonColors.none[1]);
  });
});
