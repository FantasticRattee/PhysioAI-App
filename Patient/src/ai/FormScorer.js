// PhysioAI · Version-1 — Rule-based Form Scorer (plan component P2.5).
// "Custom AI · Rule-based classifier" — NO machine learning. Explicit,
// team-designed rules turn the comparator's per-joint deltas into ONE of exactly
// four form classes, so feedback can name the *kind* of mistake, not just
// the worst joint.
//
// Pipeline position:
//   poseComparator() → { joints[], primary, validCount, score } → formScorer()
//
// The four classes:
//   correct    — every tracked joint within tolerance (status 'ok').
//   undershoot — the single dominant error IS the target/primary joint:
//                the intended movement didn't reach/hold its target.
//   lean       — the dominant error is a NON-primary joint: the patient is
//                compensating / leaning elsewhere while doing the move.
//   multi      — two or more joints clearly out ('bad'): several errors at once.
//
// Pure function, no DOM, no network. Bilingual (en + th) user-facing strings.

export const FORM_CLASSES = ['correct', 'undershoot', 'lean', 'multi'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Stable bilingual labels per class (short, UI-friendly).
const LABELS = {
  correct:    { label: 'good form',           labelTh: 'ฟอร์มดี' },
  undershoot: { label: 'undershoot target',   labelTh: 'ทำไม่ถึงเป้า' },
  lean:       { label: 'compensating / leaning', labelTh: 'เอนชดเชย' },
  multi:      { label: 'multiple errors',     labelTh: 'ผิดหลายจุด' },
  none:       { label: 'no pose',             labelTh: 'ไม่พบท่า' },
};

/**
 * Classify the current form from a comparison result.
 *
 * @param {object|null} comparison  result of poseComparator() (PoseComparator.js).
 * @param {string} primaryJoint     exercise.primaryJoint, e.g. 'right_shoulder'.
 * @returns {{cls:'correct'|'undershoot'|'lean'|'multi', label:string,
 *            labelTh:string, conf:number, detail:string, detailTh:string}}
 */
export function formScorer(comparison, primaryJoint) {
  // ── No usable pose ──────────────────────────────────────────
  // If there's nothing to score we must NOT claim 'correct' (that would be a
  // false "good form" with the camera empty). We fall back to 'undershoot'
  // with conf 0 — the move simply hasn't reached anything detectable yet —
  // and a "no pose" label so the UI can show a neutral prompt.
  if (!comparison || comparison.score == null || comparison.validCount === 0) {
    return {
      cls: 'undershoot',
      ...LABELS.none,
      conf: 0,
      detail: 'No pose detected — step into frame so all joints are visible.',
      detailTh: 'ไม่พบท่าทาง — ขยับเข้าเฟรมให้เห็นข้อต่อทั้งหมด',
    };
  }

  // Consider only joints the comparator actually measured (delta != null).
  const valid = comparison.joints.filter((j) => j.delta != null);
  const bad = valid.filter((j) => j.status === 'bad');
  const warn = valid.filter((j) => j.status === 'warn');
  const off = bad.concat(warn);                 // every joint outside tolerance
  const worst = comparison.primary;             // worst joint row (or null)
  const lowSample = comparison.validCount < 3;  // few joints → less certain

  // ── correct: nothing outside tolerance ─────────────────────
  if (off.length === 0) {
    // High confidence, bumped a little by overall score; capped below 1.
    const conf = clamp(0.85 + (comparison.score / 100) * 0.12, 0.85, 0.97);
    return {
      cls: 'correct',
      ...LABELS.correct,
      conf: lowSample ? clamp(conf - 0.15, 0.5, 0.97) : conf,
      detail: `All ${valid.length} tracked joints within tolerance — keep it up.`,
      detailTh: `ข้อต่อที่ติดตามทั้ง ${valid.length} จุดอยู่ในเกณฑ์ — ทำต่อได้เลย`,
    };
  }

  // Confidence for the error classes: how far the deciding joint exceeds its
  // tolerance. delta == tol → 0.55; deeper → higher, capped at 0.95.
  const overshoot = worst && worst.tol ? worst.delta / worst.tol - 1 : 0;
  let conf = clamp(0.55 + overshoot * 0.18, 0.5, 0.95);
  if (lowSample) conf = clamp(conf - 0.15, 0.3, 0.95);

  const wTh = worst ? worst.labelTh : 'ข้อต่อ';
  const wEn = worst ? worst.label : 'joint';
  const wDeg = worst && worst.delta != null ? Math.round(worst.delta) : '?';

  // ── multi: two or more joints clearly out ('bad') ──────────
  if (bad.length >= 2) {
    return {
      cls: 'multi',
      ...LABELS.multi,
      conf,
      detail: `${bad.length} joints clearly off (worst: ${wEn}, ${wDeg}°) — reset and slow down.`,
      detailTh: `ข้อต่อ ${bad.length} จุดผิดชัดเจน (มากสุด: ${wTh} ${wDeg}°) — ตั้งท่าใหม่ช้าๆ`,
    };
  }

  // A single dominant error. Decide undershoot vs lean by whether the worst
  // joint is the exercise's target joint or a compensating one elsewhere.
  const isPrimary = worst && worst.joint === primaryJoint;

  // ── undershoot: dominant error IS the primary/target joint ─
  if (isPrimary) {
    return {
      cls: 'undershoot',
      ...LABELS.undershoot,
      conf,
      detail: `Target joint ${wEn} is ${wDeg}° from its goal — push a little further.`,
      detailTh: `ข้อต่อเป้าหมาย ${wTh} ห่างเป้า ${wDeg}° — ออกแรงให้ถึงอีกนิด`,
    };
  }

  // ── lean: dominant error is a NON-primary joint ────────────
  return {
    cls: 'lean',
    ...LABELS.lean,
    conf,
    detail: `${wEn} is compensating (${wDeg}° off) — keep it steady while you move.`,
    detailTh: `${wTh} กำลังชดเชย (ผิด ${wDeg}°) — ประคองให้นิ่งระหว่างเคลื่อนไหว`,
  };
}
