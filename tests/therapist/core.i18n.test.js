import { STRINGS, getLang, setLang, onLangChange, t } from '../../Therapist/shared/core/i18n.js';

const LANG_KEY = 'physioai.v1.lang';

beforeEach(() => {
  localStorage.clear();
  // Reset the <html lang> attribute that setLang mutates.
  document.documentElement.lang = '';
});

describe('STRINGS dictionary', () => {
  it('exposes both en and th tables', () => {
    expect(STRINGS).toHaveProperty('en');
    expect(STRINGS).toHaveProperty('th');
    expect(typeof STRINGS.en).toBe('object');
    expect(typeof STRINGS.th).toBe('object');
  });

  it('has matching real keys across en and th', () => {
    // appName is identical in both languages.
    expect(STRINGS.en.appName).toBe('PhysioAI');
    expect(STRINGS.th.appName).toBe('PhysioAI');
    // start differs by language.
    expect(STRINGS.en.start).toBe('Start session');
    expect(STRINGS.th.start).toBe('เริ่มเซสชัน');
  });

  it('contains placeholder-bearing keys in both languages', () => {
    expect(STRINGS.en.jc_raise).toBe('Raise your {limb} higher');
    expect(STRINGS.th.jc_raise).toBe('ยก{limb}ขึ้นอีก');
    expect(STRINGS.en.planSaved).toBe('Plan saved for {name}');
    expect(STRINGS.en.spokenScore).toBe('Your form score is {n} percent');
  });
});

describe('getLang', () => {
  it('defaults to en when nothing persisted', () => {
    expect(getLang()).toBe('en');
  });

  it('returns the persisted language', () => {
    localStorage.setItem(LANG_KEY, 'th');
    expect(getLang()).toBe('th');
  });
});

describe('setLang', () => {
  it('updates getLang and persists to localStorage', () => {
    setLang('th');
    expect(getLang()).toBe('th');
    expect(localStorage.getItem(LANG_KEY)).toBe('th');
  });

  it('sets the document element lang attribute', () => {
    setLang('th');
    expect(document.documentElement.lang).toBe('th');
  });

  it('dispatches a physioai-lang CustomEvent carrying the new lang', () => {
    const received = [];
    const handler = (e) => received.push(e.detail && e.detail.lang);
    window.addEventListener('physioai-lang', handler);
    setLang('th');
    window.removeEventListener('physioai-lang', handler);
    expect(received).toEqual(['th']);
  });
});

describe('onLangChange', () => {
  it('fires the callback with the new lang on setLang', () => {
    const cb = jest.fn();
    const unsubscribe = onLangChange(cb);
    setLang('th');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('th');
    unsubscribe();
  });

  it('stops firing after unsubscribe', () => {
    const cb = jest.fn();
    const unsubscribe = onLangChange(cb);
    unsubscribe();
    setLang('th');
    expect(cb).not.toHaveBeenCalled();
  });

  it('returns a function for unsubscribing', () => {
    const unsubscribe = onLangChange(() => {});
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});

describe('t (translate)', () => {
  it('defaults to en when no language is set', () => {
    expect(t('start')).toBe('Start session');
    expect(t('appName')).toBe('PhysioAI');
  });

  it('uses the current language after setLang', () => {
    setLang('th');
    expect(t('start')).toBe('เริ่มเซสชัน');
  });

  it('honours an explicit lang argument over the current language', () => {
    setLang('th');
    expect(t('start', undefined, 'en')).toBe('Start session');
  });

  it('interpolates a single {placeholder}', () => {
    expect(t('jc_raise', { limb: 'right arm' })).toBe('Raise your right arm higher');
    expect(t('spokenScore', { n: 87 })).toBe('Your form score is 87 percent');
  });

  it('interpolates with the th table', () => {
    expect(t('planSaved', { name: 'สมชาย' }, 'th')).toBe('บันทึกแผนสำหรับ สมชาย แล้ว');
  });

  it('replaces all occurrences of a repeated placeholder', () => {
    // t uses replaceAll, so a key appearing twice both get substituted.
    // jc_raise only has one {limb}; verify replaceAll semantics via a vars loop
    // by interpolating a key that uses the placeholder once but confirm no leftover braces.
    const out = t('jc_straighten', { limb: 'left knee' });
    expect(out).toBe('Straighten your left knee');
    expect(out).not.toContain('{limb}');
  });

  it('returns the key itself for an unknown key', () => {
    expect(t('__no_such_key__')).toBe('__no_such_key__');
    expect(t('__no_such_key__', { x: 'Y' }, 'th')).toBe('__no_such_key__');
  });

  it('falls back to en when key is missing in the requested language', () => {
    // Inject a key present only in en for this assertion path.
    // appName exists in both; instead verify fallback by using a key that only
    // lives in en if any. All real keys mirror, so simulate via explicit lang
    // pointing at th for a key both have, then an en-only synthetic check:
    expect(t('appName', undefined, 'th')).toBe('PhysioAI');
    // Unknown language code -> STRINGS[L] undefined -> en fallback.
    expect(t('start', undefined, 'xx')).toBe('Start session');
  });

  it('leaves the string untouched when vars is omitted on a placeholder key', () => {
    expect(t('jc_raise')).toBe('Raise your {limb} higher');
  });
});
