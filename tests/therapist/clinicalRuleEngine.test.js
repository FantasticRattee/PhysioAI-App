import { clinicalAlerts } from '../../Therapist/shared/ai/ClinicalRuleEngine.js';

// ClinicalRuleEngine.clinicalAlerts(patient, sessions, lang) consumes session
// logs that are NEWEST-FIRST (list[0] is the most recent). It emits an array of
// { severity:'high'|'med'|'low', code, text } sorted high -> med -> low.
//
// R3 (missed-sessions) uses Date.now() internally, so all endedAt timestamps are
// built relative to the real Date.now() at test time.

const SEVERITIES = ['high', 'med', 'low'];
const DAY = 86400000;

// Helper: a "good" session — recent, high score, no joint deltas — so that on
// its own it fires NO rules. Build arrays of these and then tweak the newest.
function goodSession(overrides = {}) {
  return {
    avgScore: 90,
    endedAt: Date.now() - 1 * DAY, // 1 day ago: well under the 3-day floor
    reps: 10,
    avgDeltas: {},
    ...overrides,
  };
}

function assertAlertShape(alerts) {
  expect(Array.isArray(alerts)).toBe(true);
  for (const a of alerts) {
    expect(SEVERITIES).toContain(a.severity);
    expect(typeof a.code).toBe('string');
    expect(a.code.length).toBeGreaterThan(0);
    expect(typeof a.text).toBe('string');
    expect(a.text.length).toBeGreaterThan(0);
  }
}

function codes(alerts) {
  return alerts.map((a) => a.code);
}

function byCode(alerts, code) {
  return alerts.find((a) => a.code === code);
}

describe('clinicalAlerts — empty / sparse input', () => {
  it('returns an empty array for no sessions', () => {
    expect(clinicalAlerts({ name: 'A' }, [])).toEqual([]);
  });

  it('treats null sessions as empty (no crash)', () => {
    expect(clinicalAlerts({ name: 'A' }, null)).toEqual([]);
  });

  it('treats undefined sessions as empty (no crash)', () => {
    expect(clinicalAlerts({ name: 'A' }, undefined)).toEqual([]);
  });

  it('a single recent high-score session fires no alerts', () => {
    const alerts = clinicalAlerts({ name: 'A' }, [goodSession()]);
    expect(alerts).toEqual([]);
  });

  it('does not crash when newest has no avgScore and no endedAt', () => {
    const alerts = clinicalAlerts({ name: 'A' }, [{ reps: 5 }]);
    assertAlertShape(alerts);
    // No score, no endedAt, no deltas -> nothing should fire.
    expect(alerts).toEqual([]);
  });
});

describe('clinicalAlerts — R2 low-score rule', () => {
  it('newest avgScore < 50 => high severity low-score alert', () => {
    // Two sessions only (< MIN_BASELINE_N=3) so R1 cannot fire; both recent.
    const sessions = [
      goodSession({ avgScore: 40 }),
      goodSession({ avgScore: 42 }),
    ];
    const alerts = clinicalAlerts({ name: 'A' }, sessions);
    assertAlertShape(alerts);
    const low = byCode(alerts, 'low-score');
    expect(low).toBeDefined();
    expect(low.severity).toBe('high');
    expect(low.text).toContain('40'); // Math.round(40)
  });

  it('newest avgScore between 50 and 65 => med severity low-score alert', () => {
    const sessions = [
      goodSession({ avgScore: 60 }),
      goodSession({ avgScore: 61 }),
    ];
    const alerts = clinicalAlerts({ name: 'A' }, sessions);
    const low = byCode(alerts, 'low-score');
    expect(low).toBeDefined();
    expect(low.severity).toBe('med');
    expect(low.text).toContain('60');
  });

  it('avgScore exactly 65 (the med boundary) does NOT fire low-score', () => {
    const sessions = [
      goodSession({ avgScore: 65 }),
      goodSession({ avgScore: 65 }),
    ];
    const alerts = clinicalAlerts({ name: 'A' }, sessions);
    expect(byCode(alerts, 'low-score')).toBeUndefined();
  });

  it('avgScore exactly 50 (the high boundary) is med, not high', () => {
    // 50 is NOT < 50, so severity falls to med (since 50 < 65).
    const sessions = [
      goodSession({ avgScore: 50 }),
      goodSession({ avgScore: 50 }),
    ];
    const low = byCode(clinicalAlerts({ name: 'A' }, sessions), 'low-score');
    expect(low).toBeDefined();
    expect(low.severity).toBe('med');
  });
});

describe('clinicalAlerts — R3 missed-sessions rule (Date.now based)', () => {
  it('last session > 5 days ago => high severity missed-sessions alert', () => {
    // Build endedAt relative to real Date.now(): 6 days ago.
    const sessions = [
      goodSession({ avgScore: 90, endedAt: Date.now() - 6 * DAY }),
      goodSession({ avgScore: 90, endedAt: Date.now() - 8 * DAY }),
    ];
    const alerts = clinicalAlerts({ name: 'A' }, sessions);
    const miss = byCode(alerts, 'missed-sessions');
    expect(miss).toBeDefined();
    expect(miss.severity).toBe('high');
    expect(miss.text).toContain('6'); // Math.floor(~6 days)
  });

  it('last session between 3 and 5 days ago => med severity missed-sessions', () => {
    const sessions = [
      goodSession({ avgScore: 90, endedAt: Date.now() - 4 * DAY }),
    ];
    const alerts = clinicalAlerts({ name: 'A' }, sessions);
    const miss = byCode(alerts, 'missed-sessions');
    expect(miss).toBeDefined();
    expect(miss.severity).toBe('med');
  });

  it('last session ~2 days ago => no missed-sessions alert (below 3-day floor)', () => {
    const sessions = [
      goodSession({ avgScore: 90, endedAt: Date.now() - 2 * DAY }),
    ];
    expect(byCode(clinicalAlerts({ name: 'A' }, sessions), 'missed-sessions')).toBeUndefined();
  });

  it('does not fire missed-sessions when newest has no endedAt', () => {
    const sessions = [goodSession({ avgScore: 90, endedAt: null })];
    expect(byCode(clinicalAlerts({ name: 'A' }, sessions), 'missed-sessions')).toBeUndefined();
  });
});

describe('clinicalAlerts — R1 form-regression rule', () => {
  it('fires when newest score is > 1.5 sd below a stable baseline', () => {
    // Newest-first: newest is a sharp drop, baseline is a tight cluster high up.
    // scores = [10, 90, 90, 90, 90]
    //   mean = 74, sd ~ 32, z[newest=10] = (10-74)/32 ~ -2.0 < -1.5  -> fires.
    const sessions = [
      goodSession({ avgScore: 10 }), // newest
      goodSession({ avgScore: 90 }),
      goodSession({ avgScore: 90 }),
      goodSession({ avgScore: 90 }),
      goodSession({ avgScore: 90 }),
    ];
    const alerts = clinicalAlerts({ name: 'A' }, sessions);
    const reg = byCode(alerts, 'form-regression');
    expect(reg).toBeDefined();
    expect(reg.severity).toBe('high');
    // The regression text reports the rounded score and a sigma value.
    expect(reg.text).toContain('10');
  });

  it('does NOT fire form-regression with fewer than MIN_BASELINE_N=3 sessions', () => {
    // Only 2 sessions; even a big drop cannot produce a regression alert.
    const sessions = [
      goodSession({ avgScore: 10 }),
      goodSession({ avgScore: 90 }),
    ];
    expect(byCode(clinicalAlerts({ name: 'A' }, sessions), 'form-regression')).toBeUndefined();
  });

  it('does NOT fire form-regression when scores are flat (sd = 0, z = 0)', () => {
    const sessions = [
      goodSession({ avgScore: 90 }),
      goodSession({ avgScore: 90 }),
      goodSession({ avgScore: 90 }),
    ];
    expect(byCode(clinicalAlerts({ name: 'A' }, sessions), 'form-regression')).toBeUndefined();
  });
});

describe('clinicalAlerts — R4 declining-trend rule', () => {
  it('fires med declining-trend when smoothed slope drops more than 3 pts', () => {
    // sessions are newest-first; sessionTrend reverses to oldest->newest then
    // takes a 3-window moving average. Use a strong steady decline so the
    // smoothed net drift is well below -3 while keeping each step small enough
    // to avoid a regression z-outlier dominating expectations.
    // newest-first: [40,55,70,85,100] -> oldest->newest [100,85,70,55,40]
    //   movavg(3) starts ~100, ends ~ (70+55+40)/3 = 55 -> slope ~ -45 < -3.
    const sessions = [
      goodSession({ avgScore: 40 }),
      goodSession({ avgScore: 55 }),
      goodSession({ avgScore: 70 }),
      goodSession({ avgScore: 85 }),
      goodSession({ avgScore: 100 }),
    ];
    const alerts = clinicalAlerts({ name: 'A' }, sessions);
    const trend = byCode(alerts, 'declining-trend');
    expect(trend).toBeDefined();
    expect(trend.severity).toBe('med');
  });

  it('does NOT fire declining-trend when scores are improving', () => {
    // newest-first: newest is highest -> oldest->newest is increasing -> slope > 0.
    const sessions = [
      goodSession({ avgScore: 100 }),
      goodSession({ avgScore: 85 }),
      goodSession({ avgScore: 70 }),
      goodSession({ avgScore: 55 }),
      goodSession({ avgScore: 40 }),
    ];
    expect(byCode(clinicalAlerts({ name: 'A' }, sessions), 'declining-trend')).toBeUndefined();
  });
});

describe('clinicalAlerts — R5 joint-risk rule', () => {
  it('fires med joint-risk when one joint is worst & consistently above 18 deg', () => {
    // Each of the recent 3 sessions has left_knee as the largest delta, and the
    // overall mean delta for left_knee exceeds JOINT_DELTA=18.
    const deltas = { left_knee: 30, right_knee: 5 };
    const sessions = [
      goodSession({ avgScore: 90, avgDeltas: { ...deltas } }),
      goodSession({ avgScore: 90, avgDeltas: { ...deltas } }),
      goodSession({ avgScore: 90, avgDeltas: { ...deltas } }),
    ];
    const alerts = clinicalAlerts({ name: 'A' }, sessions);
    const joint = byCode(alerts, 'joint-risk');
    expect(joint).toBeDefined();
    expect(joint.severity).toBe('med');
    // English label for left_knee.
    expect(joint.text).toContain('left knee');
  });

  it('does NOT fire joint-risk when worst joint delta is at/under threshold', () => {
    const deltas = { left_knee: 18, right_knee: 5 }; // 18 is NOT > 18
    const sessions = [
      goodSession({ avgScore: 90, avgDeltas: { ...deltas } }),
      goodSession({ avgScore: 90, avgDeltas: { ...deltas } }),
      goodSession({ avgScore: 90, avgDeltas: { ...deltas } }),
    ];
    expect(byCode(clinicalAlerts({ name: 'A' }, sessions), 'joint-risk')).toBeUndefined();
  });

  it('does NOT fire joint-risk when the worst joint is not consistent recently', () => {
    // Overall worst (by mean) is left_knee, but the most-recent session has a
    // different worst joint -> the consistency check breaks.
    const sessions = [
      goodSession({ avgScore: 90, avgDeltas: { left_knee: 5, right_hip: 40 } }), // newest worst = right_hip
      goodSession({ avgScore: 90, avgDeltas: { left_knee: 50, right_hip: 5 } }),
      goodSession({ avgScore: 90, avgDeltas: { left_knee: 50, right_hip: 5 } }),
    ];
    expect(byCode(clinicalAlerts({ name: 'A' }, sessions), 'joint-risk')).toBeUndefined();
  });
});

describe('clinicalAlerts — localization (en vs th)', () => {
  function regressionAndLowScoreSessions() {
    // Fires low-score (40<50) and missed-sessions; deterministic content.
    return [
      goodSession({ avgScore: 40, endedAt: Date.now() - 6 * DAY }),
      goodSession({ avgScore: 42, endedAt: Date.now() - 8 * DAY }),
    ];
  }

  it('English text is Latin-script and differs from Thai', () => {
    const en = clinicalAlerts({ name: 'A' }, regressionAndLowScoreSessions(), 'en');
    const th = clinicalAlerts({ name: 'A' }, regressionAndLowScoreSessions(), 'th');
    assertAlertShape(en);
    assertAlertShape(th);
    expect(codes(en)).toEqual(codes(th)); // same rules fire either way

    const enLow = byCode(en, 'low-score');
    const thLow = byCode(th, 'low-score');
    expect(enLow.text).not.toBe(thLow.text);
    // English copy uses the word "low"; Thai copy contains Thai characters.
    expect(enLow.text.toLowerCase()).toContain('low');
    expect(/[฀-๿]/.test(thLow.text)).toBe(true);
    expect(/[฀-๿]/.test(enLow.text)).toBe(false);
  });

  it('defaults to English when lang is omitted', () => {
    const def = clinicalAlerts({ name: 'A' }, regressionAndLowScoreSessions());
    const en = clinicalAlerts({ name: 'A' }, regressionAndLowScoreSessions(), 'en');
    expect(def.map((a) => a.text)).toEqual(en.map((a) => a.text));
  });

  it('Thai missed-sessions text contains Thai script', () => {
    const sessions = [goodSession({ avgScore: 90, endedAt: Date.now() - 6 * DAY })];
    const th = byCode(clinicalAlerts({ name: 'A' }, sessions, 'th'), 'missed-sessions');
    expect(th).toBeDefined();
    expect(/[฀-๿]/.test(th.text)).toBe(true);
  });

  it('Thai joint-risk uses the Thai joint label', () => {
    const deltas = { left_knee: 30, right_knee: 5 };
    const sessions = [
      goodSession({ avgScore: 90, avgDeltas: { ...deltas } }),
      goodSession({ avgScore: 90, avgDeltas: { ...deltas } }),
      goodSession({ avgScore: 90, avgDeltas: { ...deltas } }),
    ];
    const th = byCode(clinicalAlerts({ name: 'A' }, sessions, 'th'), 'joint-risk');
    expect(th).toBeDefined();
    expect(th.text).toContain('เข่าซ้าย'); // Thai for "left knee"
  });
});

describe('clinicalAlerts — output ordering & combined scenario', () => {
  it('sorts alerts high -> med -> low', () => {
    // Construct input that fires both a high (low-score <50 + missed >5d) and a
    // med (declining-trend) so we can verify high precedes med.
    const sessions = [
      goodSession({ avgScore: 40, endedAt: Date.now() - 6 * DAY }), // newest
      goodSession({ avgScore: 55 }),
      goodSession({ avgScore: 70 }),
      goodSession({ avgScore: 85 }),
      goodSession({ avgScore: 100 }),
    ];
    const alerts = clinicalAlerts({ name: 'A' }, sessions);
    assertAlertShape(alerts);
    expect(alerts.length).toBeGreaterThanOrEqual(2);

    const ranks = { high: 0, med: 1, low: 2 };
    for (let i = 1; i < alerts.length; i++) {
      expect(ranks[alerts[i].severity]).toBeGreaterThanOrEqual(ranks[alerts[i - 1].severity]);
    }
    // sanity: at least one high and one med present
    const sevs = alerts.map((a) => a.severity);
    expect(sevs).toContain('high');
    expect(sevs).toContain('med');
  });
});
