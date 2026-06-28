// PhysioAI · Version-1 — Feedback Generator.
// Maps the comparator's per-joint delta into a single, actionable bilingual cue.
// Algorithm step: joint deltas → directional correction for the worst joint.

import { t } from '../core/i18n.js';

// joint → { limb i18n key, verb when angle must INCREASE / DECREASE }
const JOINT_CUE = {
  right_shoulder: { limb: 'limb_r_arm',   inc: 'jc_raise',      dec: 'jc_lower' },
  left_shoulder:  { limb: 'limb_l_arm',   inc: 'jc_raise',      dec: 'jc_lower' },
  right_elbow:    { limb: 'limb_r_elbow', inc: 'jc_straighten', dec: 'jc_bend' },
  left_elbow:     { limb: 'limb_l_elbow', inc: 'jc_straighten', dec: 'jc_bend' },
  right_knee:     { limb: 'limb_r_knee',  inc: 'jc_straighten', dec: 'jc_bend' },
  left_knee:      { limb: 'limb_l_knee',  inc: 'jc_straighten', dec: 'jc_bend' },
  right_hip:      { limb: 'limb_r_hip',   inc: 'jc_open',       dec: 'jc_close' },
  left_hip:       { limb: 'limb_l_hip',   inc: 'jc_open',       dec: 'jc_close' },
  right_ankle:    { limb: 'limb_r_ankle', inc: 'jc_adjust',     dec: 'jc_adjust' },
  left_ankle:     { limb: 'limb_l_ankle', inc: 'jc_adjust',     dec: 'jc_adjust' },
  back:           { limb: 'limb_back',    inc: 'jc_adjust',     dec: 'jc_adjust' },
  neck:           { limb: 'limb_neck',    inc: 'jc_adjust',     dec: 'jc_adjust' },
};

/**
 * Produce a cue from a comparison result.
 * @returns {{id:string, text:string, tone:'good'|'warn'|'bad'|'none'}}
 *   `id` is stable per (cue type + joint + direction) so TTS can avoid repeats.
 */
export function makeCue(comparison, lang) {
  if (!comparison || comparison.score == null || comparison.validCount === 0) {
    return { id: 'nopose', text: t('cueNoPose', null, lang), tone: 'none' };
  }
  const p = comparison.primary;
  if (p && p.status !== 'ok' && p.delta != null) {
    const cfg = JOINT_CUE[p.joint] || { limb: 'limb_r_arm', inc: 'jc_adjust', dec: 'jc_adjust' };
    const direction = p.live < p.ref ? 'inc' : 'dec';
    const limb = t(cfg.limb, null, lang);
    const text = t(cfg[direction], { limb }, lang);
    return { id: `${p.joint}:${direction}`, text, tone: p.status };
  }
  // All tracked joints within tolerance.
  const text = comparison.score >= 92 ? t('cuePerfect', null, lang) : t('cueGoodForm', null, lang);
  return { id: 'good', text, tone: 'good' };
}
