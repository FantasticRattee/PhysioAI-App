// PhysioAI · Version-1 — Clinical Rule Engine (diagram node P3.2b · type = "Custom AI · Rule-based").
//
// Consumes the Session Analytics statistics (z-score baselines, trend, worst
// joint) and applies deterministic IF-THEN clinical rules to emit explainable
// alerts — each one states the reason + the number that fired it. This is the
// on-device "AI" for Phase 3: no model weights, just transparent heuristics a
// therapist can audit. Feeds the dashboard Alerts Panel (P3.3b).
//
// (Date.now() is used by R3 only — it runs in the browser, where current-time is
// legitimately available.)

import { zScores, sessionTrend, aggregate } from './SessionAnalytics.js';

// ── Tunable clinical thresholds (named so they are auditable) ──
const Z_REGRESSION   = -1.5;  // R1: z below this vs own baseline = regression
const MIN_BASELINE_N = 3;     // R1: need ≥3 sessions for a meaningful baseline
const SCORE_LOW_HIGH = 50;    // R2: below → high severity
const SCORE_LOW_MED  = 65;    // R2: below → medium severity
const MISS_DAYS_HIGH = 5;     // R3: >5 days since last session = high
const MISS_DAYS_MED  = 3;     // R3: >3 days = medium
const TREND_DROP     = -3;    // R4: slope below this over last 5 = declining
const TREND_WINDOW   = 5;     // R4: trend look-back length
const JOINT_DELTA    = 18;    // R5: avg delta (°) above which a joint is "off"
const JOINT_RECENT_N = 3;     // R5: must be worst across this many recent sessions

const DAY_MS = 86400000;

// Bilingual joint labels (mirrors JointAngleCalculator.js JOINT_SPECS labels).
const JOINT_LABEL = {
  en: { left_elbow: 'left elbow', right_elbow: 'right elbow', left_shoulder: 'left shoulder', right_shoulder: 'right shoulder', left_hip: 'left hip', right_hip: 'right hip', left_knee: 'left knee', right_knee: 'right knee', left_ankle: 'left ankle', right_ankle: 'right ankle', back: 'back', neck: 'neck' },
  th: { left_elbow: 'ศอกซ้าย', right_elbow: 'ศอกขวา', left_shoulder: 'ไหล่ซ้าย', right_shoulder: 'ไหล่ขวา', left_hip: 'สะโพกซ้าย', right_hip: 'สะโพกขวา', left_knee: 'เข่าซ้าย', right_knee: 'เข่าขวา', left_ankle: 'ข้อเท้าซ้าย', right_ankle: 'ข้อเท้าขวา', back: 'หลัง', neck: 'คอ' },
};
const jointLabel = (joint, lang) => (JOINT_LABEL[lang] || JOINT_LABEL.en)[joint] || joint;

const SEV_RANK = { high: 0, med: 1, low: 2 };

/**
 * Run the clinical rule engine for one patient.
 * @param {Object} patient            store.js patient (uses .name, .adherence)
 * @param {Array}  sessions           THIS patient's logs, NEWEST-FIRST
 * @param {'en'|'th'} lang
 * @returns {Array<{severity:'high'|'med'|'low', code:string, text:string}>}
 *          Already localized to `lang`; sorted high→low. Empty if nothing fires.
 */
export function clinicalAlerts(patient, sessions, lang = 'en') {
  const th = lang === 'th';
  const list = sessions || [];
  const alerts = [];
  if (list.length === 0) return alerts;

  const newest = list[0];
  const newestScore = newest.avgScore;

  // ── R1 · form-regression (high) — newest score is a statistical outlier
  //         below the patient's own baseline (z-score, Algorithm-fed). ──
  if (list.length >= MIN_BASELINE_N && newestScore != null) {
    const scoresNewestFirst = list.map((s) => s.avgScore).filter((v) => v != null);
    if (scoresNewestFirst.length >= MIN_BASELINE_N) {
      const { z } = zScores(scoresNewestFirst);
      const zNewest = z[0]; // newest is index 0 (newest-first)
      if (zNewest < Z_REGRESSION) {
        const v = Math.round(newestScore);
        const zStr = zNewest.toFixed(1);
        alerts.push({
          severity: 'high', code: 'form-regression',
          text: th
            ? `คะแนนท่าตกลงเหลือ ${v}% — ต่ำกว่าค่าพื้นฐาน ${zStr}σ`
            : `Form score dropped to ${v}% — ${zStr}σ below baseline`,
        });
      }
    }
  }

  // ── R2 · low-score (high if <50, med if <65) — absolute floor. ──
  if (newestScore != null && newestScore < SCORE_LOW_MED) {
    const v = Math.round(newestScore);
    const severity = newestScore < SCORE_LOW_HIGH ? 'high' : 'med';
    alerts.push({
      severity, code: 'low-score',
      text: th
        ? `คะแนนท่าล่าสุดต่ำที่ ${v}%`
        : `Latest form score is low at ${v}%`,
    });
  }

  // ── R3 · missed-sessions (high if >5d, med if >3d). Uses browser clock. ──
  if (newest.endedAt != null) {
    const days = (Date.now() - newest.endedAt) / DAY_MS;
    if (days > MISS_DAYS_MED) {
      const n = Math.floor(days);
      const severity = days > MISS_DAYS_HIGH ? 'high' : 'med';
      alerts.push({
        severity, code: 'missed-sessions',
        text: th
          ? `ไม่มีการฝึกมา ${n} วัน`
          : `No session for ${n} days`,
      });
    }
  }

  // ── R4 · declining-trend (med) — smoothed slope falling over last 5. ──
  const { slope } = sessionTrend(list, TREND_WINDOW);
  if (slope < TREND_DROP) {
    const pts = Math.round(slope); // negative
    alerts.push({
      severity: 'med', code: 'declining-trend',
      text: th
        ? `คะแนนท่ามีแนวโน้มลดลง (${pts} คะแนน)`
        : `Form trending down (${pts} pts)`,
    });
  }

  // ── R5 · joint-risk (med) — one joint is the largest-delta joint overall
  //         AND remains the worst across the last 3 sessions, above threshold. ──
  const agg = aggregate(list);
  if (agg.worstJoint && agg.worstJoint.delta > JOINT_DELTA) {
    const recent = list.slice(0, JOINT_RECENT_N);
    const wj = agg.worstJoint.joint;
    let consistent = recent.length > 0;
    for (const s of recent) {
      const w = aggregate([s]).worstJoint;
      if (!w || w.joint !== wj) { consistent = false; break; }
    }
    if (consistent) {
      const d = Math.round(agg.worstJoint.delta);
      const name = jointLabel(wj, lang);
      alerts.push({
        severity: 'med', code: 'joint-risk',
        text: th
          ? `${name}คลาดเคลื่อนต่อเนื่อง (~${d}° เฉลี่ย)`
          : `${name} consistently off (~${d}° avg)`,
      });
    }
  }

  // Order by severity (high → med → low); stable for equal severities.
  return alerts.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}
