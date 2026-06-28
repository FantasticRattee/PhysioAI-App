// Tests for Patient core i18n (bilingual copy + language state).
// Source: Patient/src/core/i18n.js
//
// NOTE on the real default language: the module initializes _lang = 'th'
// (Thai-first for the target users). So a fresh t(key) returns the Thai
// string. To exercise the "English default" the test sets the language to
// 'en' first. State lives on the module singleton, so each test resets the
// language explicitly in beforeEach for isolation.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  STRINGS,
  loadLang,
  getLang,
  setLang,
  onLangChange,
  t,
} from '../../Patient/src/core/i18n.js';

beforeEach(() => {
  AsyncStorage.__reset();
  // Deterministic starting point for language state.
  setLang('en');
});

describe('STRINGS dictionaries', () => {
  it('has both "en" and "th" dictionaries', () => {
    expect(STRINGS).toHaveProperty('en');
    expect(STRINGS).toHaveProperty('th');
    expect(STRINGS.en).toBeInstanceOf(Object);
    expect(STRINGS.th).toBeInstanceOf(Object);
  });

  it('exposes known real keys in both languages', () => {
    expect(STRINGS.en.greeting).toBe('Hi, {name}');
    expect(STRINGS.th.greeting).toBe('สวัสดี, {name}');
    expect(STRINGS.en.appName).toBe('PhysioAI');
    expect(STRINGS.en.save).toBe('Save');
    expect(STRINGS.th.save).toBe('บันทึก');
  });

  it('every en key also exists in th', () => {
    const enKeys = Object.keys(STRINGS.en);
    const missing = enKeys.filter((k) => !(k in STRINGS.th));
    expect(missing).toEqual([]);
  });
});

describe('t() translation', () => {
  it('returns the en string by default when language is en', () => {
    expect(getLang()).toBe('en');
    expect(t('save')).toBe('Save');
    expect(t('cancel')).toBe('Cancel');
    expect(t('appName')).toBe('PhysioAI');
  });

  it('interpolates a single {placeholder}', () => {
    expect(t('greeting', { name: 'Alex' })).toBe('Hi, Alex');
  });

  it('interpolates a numeric-style placeholder ({n})', () => {
    // spokenScore: 'Your form score is {n} percent'
    expect(t('spokenScore', { n: 87 })).toBe('Your form score is 87 percent');
  });

  it('replaces all occurrences of the same placeholder', () => {
    // Mutate the imported object at runtime (not the source file) to test
    // that replaceAll handles repeated tokens.
    STRINGS.en.__multi = '{x} and {x}';
    try {
      expect(t('__multi', { x: 'go' })).toBe('go and go');
    } finally {
      delete STRINGS.en.__multi;
    }
  });

  it('leaves the string untouched when no vars are passed', () => {
    expect(t('greeting')).toBe('Hi, {name}');
  });

  it('falls back to the key itself for an unknown key', () => {
    expect(t('totally_unknown_key_xyz')).toBe('totally_unknown_key_xyz');
  });

  it('still interpolates an unknown key (key used as the template)', () => {
    // Unknown key falls back to the key string; vars only matter if the key
    // text contains the token, which it does not here, so it is unchanged.
    expect(t('no_such_key', { name: 'X' })).toBe('no_such_key');
  });
});

describe('t() with explicit language argument', () => {
  it('uses Thai when lang === "th" is passed explicitly', () => {
    expect(getLang()).toBe('en'); // current default unchanged
    expect(t('save', undefined, 'th')).toBe('บันทึก');
    expect(t('greeting', { name: 'น้อง' }, 'th')).toBe('สวัสดี, น้อง');
  });

  it('passing lang does not change the global language', () => {
    t('save', undefined, 'th');
    expect(getLang()).toBe('en');
    expect(t('save')).toBe('Save');
  });

  it('falls back to en when a key is missing in th', () => {
    // No real key is missing from th, so add an en-only key at runtime to
    // exercise the (STRINGS[L][key]) ?? (STRINGS.en[key]) fallback branch.
    STRINGS.en.__enOnly = 'English only';
    try {
      expect(STRINGS.th.__enOnly).toBeUndefined();
      expect(t('__enOnly', undefined, 'th')).toBe('English only');
    } finally {
      delete STRINGS.en.__enOnly;
    }
  });

  it('falls back to en for an unknown lang code', () => {
    // STRINGS['fr'] is undefined -> outer guard -> STRINGS.en[key]
    expect(t('save', undefined, 'fr')).toBe('Save');
  });
});

describe('setLang / getLang', () => {
  it('setLang("th") changes getLang() to "th"', () => {
    setLang('th');
    expect(getLang()).toBe('th');
  });

  it('setLang("th") changes the t() default to Thai', () => {
    setLang('th');
    expect(t('save')).toBe('บันทึก');
    expect(t('greeting', { name: 'ก้อง' })).toBe('สวัสดี, ก้อง');
  });

  it('setLang persists the language to AsyncStorage', async () => {
    setLang('th');
    const stored = await AsyncStorage.getItem('physioai.v2.lang');
    expect(stored).toBe('th');
  });
});

describe('loadLang', () => {
  it('returns the current language and reads a stored value', async () => {
    await AsyncStorage.setItem('physioai.v2.lang', 'th');
    const loaded = await loadLang();
    expect(loaded).toBe('th');
    expect(getLang()).toBe('th');
  });

  it('keeps the current language when nothing is stored', async () => {
    // beforeEach reset storage and set lang to 'en'.
    const loaded = await loadLang();
    expect(loaded).toBe('en');
    expect(getLang()).toBe('en');
  });
});

describe('onLangChange', () => {
  it('fires the callback with the new language on setLang', () => {
    const cb = jest.fn();
    const unsub = onLangChange(cb);
    try {
      setLang('th');
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('th');
    } finally {
      unsub();
    }
  });

  it('the returned unsubscribe stops further calls', () => {
    const cb = jest.fn();
    const unsub = onLangChange(cb);
    setLang('th');
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    setLang('en');
    // No additional calls after unsubscribe.
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a throwing listener does not break setLang or other listeners', () => {
    const bad = jest.fn(() => { throw new Error('boom'); });
    const good = jest.fn();
    const unsubBad = onLangChange(bad);
    const unsubGood = onLangChange(good);
    try {
      expect(() => setLang('th')).not.toThrow();
      expect(getLang()).toBe('th');
      expect(good).toHaveBeenCalledWith('th');
    } finally {
      unsubBad();
      unsubGood();
    }
  });
});
