// PhysioAI · Version-1 — LLM Summary backend scaffold (plan P3.2c).
//
// Provider-agnostic plumbing for the optional cloud "LLM summary" path that
// sits behind the on-device template in shared/summary.js. It is written in the
// Anthropic Messages API shape (Claude) but works against any compatible
// endpoint you point it at.
//
// ⚠️ CURRENTLY INERT. LLM_CONFIG ships BLANK on purpose, so isConfigured() is
// false and summarize() returns null immediately — the dashboard falls back to
// generateSummary() (the on-device template). To enable, fill in endpoint +
// apiKey + model below.
//
// ⚠️ PRIVACY: unlike the rest of the app (which is 100% on-device — see store.js),
// enabling this means the prompt LEAVES THE DEVICE and is sent to a cloud LLM.
// buildSummaryPrompt() therefore de-identifies: it sends only aggregates and a
// generic id, never the patient's name or other PII.
//
// Pure async plumbing — no DOM, no imports (uses the global fetch + AbortSignal).

import { JOINT_SPECS } from './JointAngleCalculator.js';

// Joint → human label for the de-identified prompt (mirrors summary.js / JOINT_SPECS).
const JOINT_LABEL = {
  en: Object.fromEntries(JOINT_SPECS.map((s) => [s.joint, s.label])),
  th: Object.fromEntries(JOINT_SPECS.map((s) => [s.joint, s.labelTh])),
};

// ─── Config (intentionally blank — fill to enable) ──────────
export const LLM_CONFIG = { endpoint: '', apiKey: '', model: '', maxTokens: 400 };

/** True only when endpoint, apiKey, and model are all non-empty. */
export function isConfigured() {
  return !!(LLM_CONFIG.endpoint && LLM_CONFIG.apiKey && LLM_CONFIG.model);
}

// Mean delta per joint across sessions → worst (largest avg deviation). Same
// shape as summary.js#worstJoint but kept local so this module stays standalone.
function worstJoint(sessions) {
  const sum = {}, n = {};
  for (const s of sessions) for (const j in (s.avgDeltas || {})) { sum[j] = (sum[j] || 0) + s.avgDeltas[j]; n[j] = (n[j] || 0) + 1; }
  let worst = null, worstVal = -1;
  for (const j in sum) { const v = sum[j] / n[j]; if (v > worstVal) { worstVal = v; worst = j; } }
  return worst ? { joint: worst, delta: worstVal } : null;
}

/**
 * Build a de-identified, clinician-facing prompt from session-log aggregates.
 * Includes: avg score, session count, total reps, recent score trend, worst
 * joint. Excludes names/PII — the patient is referenced by a generic id only.
 *
 * @param {Object} patient   - store.js patient (only `adherence` is used; name is NOT sent)
 * @param {Array}  sessions  - store.js session logs (newest-first; see getSessions)
 * @param {'en'|'th'} lang   - output language (Thai if 'th')
 * @returns {string}
 */
export function buildSummaryPrompt(patient, sessions, lang = 'en') {
  const list = sessions || [];
  const scores = list.map((s) => s.avgScore).filter((v) => v != null);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const first = scores.length ? scores[scores.length - 1] : null;   // oldest (list is newest-first)
  const last = scores.length ? scores[0] : null;                    // newest
  const trend = (first != null && last != null) ? last - first : null;
  const totalReps = list.reduce((a, s) => a + (s.reps || 0), 0);
  const wj = worstJoint(list);
  const adherence = patient && patient.adherence != null ? patient.adherence : null;
  const lbl = JOINT_LABEL[lang === 'th' ? 'th' : 'en'];

  // De-identified data block — no names, just aggregates + a generic id.
  const lines = [
    `patient_id: anonymous`,
    `sessions_logged: ${list.length}`,
    `total_reps: ${totalReps}`,
    `avg_form_accuracy_pct: ${avg != null ? avg : 'n/a'}`,
    `score_trend_pct: ${trend != null ? (trend > 0 ? '+' : '') + Math.round(trend) : 'n/a'}`,
    `worst_joint: ${wj ? `${lbl[wj.joint] || wj.joint} (avg ${Math.round(wj.delta)}° off target)` : 'n/a'}`,
    `adherence_pct: ${adherence != null ? adherence : 'n/a'}`,
  ].join('\n');

  if (lang === 'th') {
    return [
      'คุณเป็นนักกายภาพบำบัด เขียนบันทึกความก้าวหน้าสำหรับแพทย์เป็นภาษาไทย ความยาว 2-3 ประโยค',
      'อิงจากข้อมูลสรุป (ไม่มีข้อมูลส่วนตัวของผู้ป่วย) ด้านล่างนี้เท่านั้น เน้นกระชับและนำไปใช้ได้จริง:',
      '',
      lines,
    ].join('\n');
  }
  return [
    'You are a physiotherapist. Write a concise, clinician-facing progress note in English, 2-3 sentences.',
    'Base it only on the de-identified aggregates below (no patient PII). Keep it actionable:',
    '',
    lines,
  ].join('\n');
}

/**
 * Send the prompt to the configured LLM and return the generated note.
 *
 * Returns null immediately when not configured (so the caller falls back to the
 * on-device template in summary.js) and on ANY error (network/parse/HTTP).
 * Written in the Anthropic Messages API shape (model, max_tokens, messages).
 *
 * @param {string} prompt
 * @param {{ signal?: AbortSignal }} [opts] - optional AbortSignal to cancel
 * @returns {Promise<string|null>}
 */
export async function summarize(prompt, { signal } = {}) {
  if (!isConfigured()) return null;   // inert / not enabled → use template fallback
  try {
    const res = await fetch(LLM_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': LLM_CONFIG.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: LLM_CONFIG.model,
        max_tokens: LLM_CONFIG.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Anthropic response: { content: [{ type:'text', text:'...' }], ... }
    const text = data && data.content && data.content[0] && data.content[0].text;
    return (typeof text === 'string' && text.trim()) ? text.trim() : null;
  } catch {
    return null;   // network/abort/parse — fall back to template
  }
}
