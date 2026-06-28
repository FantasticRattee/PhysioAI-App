import { generateSummary } from '../../Therapist/shared/ai/summary.js';

// Helper to build a session-log entry. avgScore drives the trend/average,
// reps add to totalReps, avgDeltas drive worstJoint detection.
const mkSession = ({ avgScore = 80, reps = 10, avgDeltas = {} } = {}) => ({
  avgScore,
  reps,
  avgDeltas,
});

const patient = (over = {}) => ({ name: 'Alice', adherence: 90, ...over });

describe('generateSummary - zero / missing sessions', () => {
  it('returns a sensible English string with the patient name when sessions is empty', () => {
    const out = generateSummary(patient({ name: 'Bob' }), [], 'en');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('Bob');
    expect(out).toContain('No sessions logged');
    expect(out).toContain('progress note');
  });

  it('returns a sensible Thai string with the patient name when sessions is empty', () => {
    const out = generateSummary(patient({ name: 'สมชาย' }), [], 'th');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('สมชาย');
    expect(out).toContain('ยังไม่มีเซสชัน');
  });

  it('does not crash and handles null sessions like empty', () => {
    const out = generateSummary(patient({ name: 'Carl' }), null, 'en');
    expect(out).toContain('Carl');
    expect(out).toContain('No sessions logged');
  });

  it('defaults to English when lang is omitted for empty sessions', () => {
    const out = generateSummary(patient({ name: 'Dana' }), []);
    expect(out).toContain('No sessions logged');
  });
});

describe('generateSummary - English with sessions', () => {
  it('returns a non-empty string reflecting count, reps, average and adherence', () => {
    const sessions = [
      mkSession({ avgScore: 90, reps: 12 }),
      mkSession({ avgScore: 80, reps: 8 }),
    ];
    const out = generateSummary(patient({ name: 'Alice', adherence: 90 }), sessions, 'en');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('Alice');
    // 2 sessions -> plural "sessions"
    expect(out).toContain('2 sessions');
    // total reps = 12 + 8 = 20
    expect(out).toContain('20 reps total');
    // avg of 90 and 80 = 85
    expect(out).toContain('85% form accuracy');
    // adherence wording
    expect(out).toContain('Adherence is 90%');
    expect(out).toContain('on track');
  });

  it('uses singular "session" for a single session and no plural s', () => {
    const out = generateSummary(patient(), [mkSession({ avgScore: 75, reps: 5 })], 'en');
    expect(out).toContain('1 session');
    expect(out).not.toContain('1 sessions');
    expect(out).toContain('5 reps total');
    expect(out).toContain('75% form accuracy');
  });

  it('describes an improving trend when last beats first by more than 4', () => {
    // sessions[0] is most recent (last), sessions[end] is oldest (first).
    // last - first > 4 => "improving steadily"
    const sessions = [mkSession({ avgScore: 90 }), mkSession({ avgScore: 80 })];
    const out = generateSummary(patient(), sessions, 'en');
    expect(out).toContain('improving steadily');
  });

  it('describes a downward trend when last is more than 4 below first', () => {
    // last (sessions[0]) = 70, first (sessions[end]) = 90 => trend = -20
    const sessions = [mkSession({ avgScore: 70 }), mkSession({ avgScore: 90 })];
    const out = generateSummary(patient(), sessions, 'en');
    expect(out).toContain('trending down');
  });

  it('describes holding steady when trend is within +/-4', () => {
    const sessions = [mkSession({ avgScore: 82 }), mkSession({ avgScore: 80 })];
    const out = generateSummary(patient(), sessions, 'en');
    expect(out).toContain('holding steady');
  });

  it('names the worst joint with its English label and rounded delta', () => {
    const sessions = [
      mkSession({ avgScore: 80, avgDeltas: { left_knee: 5, right_elbow: 12.4 } }),
      mkSession({ avgScore: 80, avgDeltas: { left_knee: 5, right_elbow: 12.6 } }),
    ];
    const out = generateSummary(patient(), sessions, 'en');
    // right_elbow has the higher avg delta -> worst joint, labeled "right elbow"
    expect(out).toContain('right elbow');
    expect(out).toContain('most attention');
    // avg of 12.4 and 12.6 = 12.5 -> Math.round = 13
    expect(out).toContain('13° off target');
  });

  it('omits the joint-focus sentence when no avgDeltas are present', () => {
    const sessions = [mkSession({ avgScore: 80, avgDeltas: {} })];
    const out = generateSummary(patient(), sessions, 'en');
    expect(out).not.toContain('most attention');
    expect(out).not.toContain('off target');
  });

  it('uses reminder wording when adherence is below 80', () => {
    const out = generateSummary(patient({ adherence: 50 }), [mkSession()], 'en');
    expect(out).toContain('Adherence is 50%');
    expect(out).toContain('consider a reminder');
    expect(out).not.toContain('on track');
  });

  it('treats exactly 80 adherence as on track (boundary)', () => {
    const out = generateSummary(patient({ adherence: 80 }), [mkSession()], 'en');
    expect(out).toContain('on track');
  });

  it('ignores null avgScore entries when averaging', () => {
    const sessions = [
      mkSession({ avgScore: 100 }),
      { avgScore: null, reps: 3 },
      mkSession({ avgScore: 60 }),
    ];
    const out = generateSummary(patient(), sessions, 'en');
    // average over non-null scores: (100 + 60) / 2 = 80
    expect(out).toContain('80% form accuracy');
    // still counts all 3 sessions
    expect(out).toContain('3 sessions');
  });
});

describe('generateSummary - Thai with sessions', () => {
  it('returns a non-empty Thai string reflecting count, reps, average and adherence', () => {
    const sessions = [
      mkSession({ avgScore: 90, reps: 12 }),
      mkSession({ avgScore: 80, reps: 8 }),
    ];
    const out = generateSummary(patient({ name: 'Alice', adherence: 90 }), sessions, 'th');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('Alice');
    expect(out).toContain('2 เซสชัน');
    expect(out).toContain('20 ครั้ง');
    expect(out).toContain('85%');
    expect(out).toContain('คะแนนท่าเฉลี่ย');
    expect(out).toContain('90%');
    expect(out).toContain('อยู่ในเกณฑ์ดี');
  });

  it('describes an improving trend in Thai', () => {
    const sessions = [mkSession({ avgScore: 90 }), mkSession({ avgScore: 80 })];
    const out = generateSummary(patient(), sessions, 'th');
    expect(out).toContain('ดีขึ้นอย่างต่อเนื่อง');
  });

  it('names the worst joint with its Thai label', () => {
    const sessions = [
      mkSession({ avgScore: 80, avgDeltas: { left_knee: 3, right_elbow: 11 } }),
    ];
    const out = generateSummary(patient(), sessions, 'th');
    expect(out).toContain('ศอกขวา'); // right_elbow
    expect(out).toContain('คลาดเคลื่อนเฉลี่ย');
  });

  it('uses encouragement wording when Thai adherence is below 80', () => {
    const out = generateSummary(patient({ adherence: 40 }), [mkSession()], 'th');
    expect(out).toContain('40%');
    expect(out).toContain('แนะนำให้กระตุ้น');
  });
});

describe('generateSummary - bilingual difference', () => {
  it('produces different text for th vs en with the same inputs', () => {
    const sessions = [
      mkSession({ avgScore: 88, reps: 10, avgDeltas: { right_knee: 9 } }),
      mkSession({ avgScore: 78, reps: 9, avgDeltas: { right_knee: 9 } }),
    ];
    const p = patient({ name: 'Alice', adherence: 85 });
    const en = generateSummary(p, sessions, 'en');
    const th = generateSummary(p, sessions, 'th');
    expect(en).not.toBe(th);
    // English-only marker
    expect(en).toContain('form accuracy');
    expect(en).not.toContain('คะแนนท่าเฉลี่ย');
    // Thai-only marker
    expect(th).toContain('คะแนนท่าเฉลี่ย');
    expect(th).not.toContain('form accuracy');
  });
});
