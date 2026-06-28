// PhysioAI · Version-1 — Session summary generator.
// Phase-3 "LLM summary" stand-in: builds a natural-language progress note
// on-device from session-log aggregates. In production this runs asynchronously
// in the cloud (Claude / GPT) over de-identified aggregates — see summaryNote.

const JOINT_LABEL = {
  en: { left_elbow: 'left elbow', right_elbow: 'right elbow', left_shoulder: 'left shoulder', right_shoulder: 'right shoulder', left_hip: 'left hip', right_hip: 'right hip', left_knee: 'left knee', right_knee: 'right knee', left_ankle: 'left ankle', right_ankle: 'right ankle', back: 'back', neck: 'neck' },
  th: { left_elbow: 'ศอกซ้าย', right_elbow: 'ศอกขวา', left_shoulder: 'ไหล่ซ้าย', right_shoulder: 'ไหล่ขวา', left_hip: 'สะโพกซ้าย', right_hip: 'สะโพกขวา', left_knee: 'เข่าซ้าย', right_knee: 'เข่าขวา', left_ankle: 'ข้อเท้าซ้าย', right_ankle: 'ข้อเท้าขวา', back: 'หลัง', neck: 'คอ' },
};

function worstJoint(sessions) {
  const sum = {}, n = {};
  for (const s of sessions) for (const j in (s.avgDeltas || {})) { sum[j] = (sum[j] || 0) + s.avgDeltas[j]; n[j] = (n[j] || 0) + 1; }
  let worst = null, worstVal = -1;
  for (const j in sum) { const v = sum[j] / n[j]; if (v > worstVal) { worstVal = v; worst = j; } }
  return worst ? { joint: worst, delta: worstVal } : null;
}

export function generateSummary(patient, sessions, lang = 'en') {
  if (!sessions || sessions.length === 0) {
    return lang === 'th'
      ? `ยังไม่มีเซสชันที่บันทึกสำหรับ ${patient.name} เมื่อผู้ป่วยเริ่มฝึก ระบบจะสรุปความก้าวหน้าที่นี่`
      : `No sessions logged for ${patient.name} yet. Once they practise, a progress note appears here.`;
  }
  const scores = sessions.map((s) => s.avgScore).filter((v) => v != null);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const first = scores[scores.length - 1], last = scores[0];
  const trend = last - first;
  const totalReps = sessions.reduce((a, s) => a + (s.reps || 0), 0);
  const wj = worstJoint(sessions);
  const trendWord = (en, th) => (lang === 'th' ? th : en);

  if (lang === 'th') {
    const dir = trend > 4 ? 'ดีขึ้นอย่างต่อเนื่อง' : trend < -4 ? 'มีแนวโน้มลดลง ควรติดตามใกล้ชิด' : 'ค่อนข้างคงที่';
    const focus = wj ? ` จุดที่ควรปรับปรุงคือ${JOINT_LABEL.th[wj.joint] || wj.joint} (คลาดเคลื่อนเฉลี่ย ${Math.round(wj.delta)}°)` : '';
    return `${patient.name} ทำไปแล้ว ${sessions.length} เซสชัน รวม ${totalReps} ครั้ง คะแนนท่าเฉลี่ย ${avg}% และ${dir}.${focus} ความต่อเนื่องอยู่ที่ ${patient.adherence}% — ${patient.adherence >= 80 ? 'อยู่ในเกณฑ์ดี' : 'แนะนำให้กระตุ้นการฝึกสม่ำเสมอ'}.`;
  }
  const dir = trend > 4 ? 'improving steadily' : trend < -4 ? 'trending down — worth a closer look' : 'holding steady';
  const focus = wj ? ` The joint needing most attention is the ${JOINT_LABEL.en[wj.joint] || wj.joint} (avg ${Math.round(wj.delta)}° off target).` : '';
  return `${patient.name} has completed ${sessions.length} session${sessions.length > 1 ? 's' : ''} (${totalReps} reps total), averaging ${avg}% form accuracy and ${dir}.${focus} Adherence is ${patient.adherence}% — ${patient.adherence >= 80 ? 'on track' : 'consider a reminder to keep practice consistent'}.`;
}
