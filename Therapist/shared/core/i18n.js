// PhysioAI · Version-1 — bilingual copy (Thai / English).
// Single source of truth for all UI text. Language persists in localStorage.

export const STRINGS = {
  en: {
    appName: 'PhysioAI',
    tagline: 'On-device physiotherapy AI',
    landingTitle: 'AI physiotherapy at home',
    landingSub: 'For disabled persons in Thailand',
    iAmPatient: "I'm a Patient", iAmTherapist: "I'm a Therapist",
    mobileApp: 'Mobile app', webDashboard: 'Web dashboard',
    navHint: 'Use the top-right menu to jump between any screen',

    // Roles / nav
    home: 'Home', back: 'Back', screens: 'Screens',
    patientMobile: 'Patient (mobile)', therapistWeb: 'Therapist (web)',

    // Modes
    chooseMode: 'Choose mode',
    modePractice: 'Patient Practice', modeAudio: 'Audio-Only', modeVisual: 'Visual-Only',
    modeCapture: 'Therapist Setup', modeDash: 'Therapist Dashboard',
    hintPractice: 'Live session with real-time pose feedback',
    hintAudio: 'Voice-guided — for patients with visual impairment',
    hintVisual: 'Captions & color cues — for deaf / hard-of-hearing',
    hintCapture: 'Record a reference pose & prescribe exercises',
    hintDash: 'Monitor patients & review session data',

    // Common
    start: 'Start session', startPractice: 'Start practice', resume: 'Resume', pause: 'Pause',
    finish: 'Finish', next: 'Next', save: 'Save', cancel: 'Cancel', done: 'Done',
    settings: 'Settings', today: 'Today', reps: 'reps', sets: 'sets', rep: 'Rep', of: 'of',
    accuracy: 'Accuracy', score: 'Score', target: 'target', hold: 'Hold', sec: 's',
    selectExercise: 'Select an exercise', exercise: 'Exercise', exercises: 'Exercises',
    healthRomCategory: 'ROM exercise presets',
    onDeviceActive: 'On-device AI · Offline-ready', loadingModel: 'Loading pose model…',
    cameraOff: 'Camera off', startCamera: 'Start camera', stopCamera: 'Stop camera',
    enableCamera: 'Enable camera to begin', cameraDenied: 'Camera unavailable — running in Demo mode',
    demoMode: 'Demo mode (simulated pose)', liveMode: 'Live camera',
    permissionHint: 'Allow camera access when prompted. Nothing is uploaded.',

    // Exercises
    ex_shoulder: 'Shoulder flexion', ex_knee: 'Knee extension', ex_hip: 'Hip abduction',
    ex_squat: 'Assisted squat', ex_balance: 'Single-leg balance',
    ex_rom_left_shoulder: 'Left shoulder ROM', ex_rom_right_shoulder: 'Right shoulder ROM',
    ex_rom_left_elbow: 'Left elbow ROM', ex_rom_right_elbow: 'Right elbow ROM',
    ex_rom_left_hip: 'Left hip ROM', ex_rom_right_hip: 'Right hip ROM',
    ex_rom_left_knee: 'Left knee ROM', ex_rom_right_knee: 'Right knee ROM',
    ex_rom_back: 'Back ROM', ex_rom_neck: 'Neck ROM',
    exd_shoulder: 'Raise your right arm forward and up',
    exd_knee: 'Straighten your knee fully',
    exd_hip: 'Lift your leg out to the side',
    exd_squat: 'Lower into a supported squat',
    exd_balance: 'Stand on one leg and hold',
    exd_rom_left_shoulder: 'Measure controlled range of motion for the left shoulder',
    exd_rom_right_shoulder: 'Measure controlled range of motion for the right shoulder',
    exd_rom_left_elbow: 'Measure controlled range of motion for the left elbow',
    exd_rom_right_elbow: 'Measure controlled range of motion for the right elbow',
    exd_rom_left_hip: 'Measure controlled range of motion for the left hip',
    exd_rom_right_hip: 'Measure controlled range of motion for the right hip',
    exd_rom_left_knee: 'Measure controlled range of motion for the left knee',
    exd_rom_right_knee: 'Measure controlled range of motion for the right knee',
    exd_rom_back: 'Measure controlled range of motion for the back',
    exd_rom_neck: 'Measure controlled range of motion for the neck',

    // Cues (generic)
    cueGetReady: 'Get ready', cueGoodForm: 'Great form — hold it', cueHoldSteady: 'Hold steady',
    cuePerfect: 'Perfect — keep going', cueAdjust: 'Adjust your posture', cueNoPose: 'Step back so I can see you',
    repDone: 'Rep complete', setDone: 'Set complete', sessionDone: 'Session complete — well done',

    // Joint cue verbs
    jc_raise: 'Raise your {limb} higher', jc_lower: 'Lower your {limb} a little',
    jc_straighten: 'Straighten your {limb}', jc_bend: 'Bend your {limb} a little',
    jc_open: 'Open your {limb} wider', jc_close: 'Bring your {limb} in slightly',
    jc_adjust: 'Adjust your {limb}',

    // Limbs
    limb_r_arm: 'right arm', limb_l_arm: 'left arm', limb_r_elbow: 'right elbow', limb_l_elbow: 'left elbow',
    limb_r_knee: 'right knee', limb_l_knee: 'left knee', limb_r_hip: 'right hip', limb_l_hip: 'left hip',
    limb_r_ankle: 'right ankle', limb_l_ankle: 'left ankle', limb_back: 'back', limb_neck: 'neck',

    // Audio mode
    audioTitle: 'Audio-Only', audioReady: 'Voice guidance ready',
    audioIntro: 'I will guide you with my voice. Tap anywhere to start, tap again to pause.',
    tapToStart: 'Tap to start', tapToPause: 'Tap to pause', listening: 'Guiding you…',
    spokenScore: 'Your form score is {n} percent',

    // Visual mode
    visualTitle: 'Visual-Only', visualIntro: 'Follow the on-screen cues. No sound needed.',
    bigCue: 'CUE', matchTarget: 'Match the green target',

    // Capture / setup
    captureTitle: 'Therapist Setup', patient: 'Patient', patients: 'Patients',
    referencePose: 'Reference pose', captureRef: 'Capture reference', recapture: 'Re-capture',
    fromImage: 'From image…', validate: 'Validate', setup: 'Setup',
    captureHint: 'Pose the model pose, then capture. 12 joint angles are stored as the target.',
    refSaved: 'Reference saved', noPose: 'No pose detected — make sure the full body is in frame',
    jointsCaptured: '{n}/12 joints captured', prescribe: 'Prescribe to plan', prescribed: 'Prescribed',
    treatmentPlan: 'Treatment plan', addToPlan: 'Add to plan', removeFromPlan: 'In plan',
    repsTarget: 'Reps', setsTarget: 'Sets', targetAngle: 'Target angle', holdSec: 'Hold (s)',
    savePlan: 'Save plan', planSaved: 'Plan saved for {name}',
    // Plan builder
    modePlan: 'Plan Builder', planBuilderSub: 'Prescribe a home exercise program',
    planExercises: 'Exercises in plan', tapToAdd: 'Tap an exercise to add or remove',
    noExercises: 'No exercises selected yet', dosage: 'Dosage',
    schedule: 'Schedule', frequency: 'Frequency', perDay: '× / day', daysPerWeek: 'days / week',
    startDate: 'Start date', durationWeeks: 'Duration (weeks)', endDate: 'Ends', weeks: 'weeks',
    notesForPatient: 'Note for patient (optional)', planSummary: 'Summary',
    planEmpty: 'Add at least one exercise first', perDayShort: '/day', sessionsTotal: 'total sessions',

    // Dashboard
    dashTitle: 'Therapist Dashboard', adherence: 'Adherence', avgScore: 'Avg. form score',
    sessionsWeek: 'Sessions this week', activePatients: 'Active patients',
    live: 'Live', offline: 'Offline', lastSeen: 'Last seen', review: 'Review', message: 'Message',
    alerts: 'Alerts', recentSessions: 'Recent sessions', formTrend: 'Form-score trend',
    aiSummary: 'AI session summary', regenerate: 'Regenerate', noSessions: 'No sessions logged yet',
    weekday_mon: 'Mon', weekday_tue: 'Tue', weekday_wed: 'Wed', weekday_thu: 'Thu',
    weekday_fri: 'Fri', weekday_sat: 'Sat', weekday_sun: 'Sun',
    summaryNote: 'Generated on-device from session logs. In production this is produced asynchronously by a cloud LLM (Claude / GPT) from de-identified aggregates.',

    // Form scorer · camera gate · recognition · phase-3 analytics (new)
    formLabel: 'Form', formCorrect: 'good form', cameraSetup: 'Camera setup', framingGood: 'Framing good',
    detected: 'Detected', wrongExercise: 'Looks like a different exercise',
    sessionAvg3: '3-session avg', clinicalAlerts: 'Clinical alerts', noAlerts: 'No alerts — on track',
    summarySrc: 'Source', srcOnDevice: 'on-device', srcCloud: 'cloud LLM', movingAvg: 'Moving avg',

    // Settings
    language: 'Language', modelQuality: 'Model quality', modelLite: 'Lite (fast)',
    modelFull: 'Full (balanced)', modelHeavy: 'Heavy (accurate)', voice: 'Voice feedback',
    mirrorCam: 'Mirror camera', resetData: 'Reset local data', confirmReset: 'Reset all local data?',
  },

  th: {
    appName: 'PhysioAI',
    tagline: 'AI กายภาพบำบัดบนอุปกรณ์',
    landingTitle: 'กายภาพบำบัดที่บ้านด้วย AI',
    landingSub: 'สำหรับผู้พิการในประเทศไทย',
    iAmPatient: 'ฉันเป็นผู้ป่วย', iAmTherapist: 'ฉันเป็นนักกายภาพ',
    mobileApp: 'แอปบนมือถือ', webDashboard: 'แดชบอร์ดบนเว็บ',
    navHint: 'เปิดเมนูมุมบนขวาเพื่อไปยังหน้าจออื่น',

    home: 'หน้าแรก', back: 'ย้อนกลับ', screens: 'เลือกหน้าจอ',
    patientMobile: 'ผู้ป่วย (มือถือ)', therapistWeb: 'นักกายภาพ (เว็บ)',

    chooseMode: 'เลือกโหมด',
    modePractice: 'โหมดผู้ป่วย', modeAudio: 'โหมดเสียงอย่างเดียว', modeVisual: 'โหมดภาพอย่างเดียว',
    modeCapture: 'โหมดนักกายภาพ', modeDash: 'แดชบอร์ดนักกายภาพ',
    hintPractice: 'เซสชันสดพร้อมฟีดแบคท่าทางแบบเรียลไทม์',
    hintAudio: 'นำทางด้วยเสียง — สำหรับผู้พิการทางสายตา',
    hintVisual: 'คำบรรยายและสัญญาณสี — สำหรับผู้พิการทางการได้ยิน',
    hintCapture: 'บันทึกท่าอ้างอิงและสั่งการออกกำลัง',
    hintDash: 'ติดตามผู้ป่วยและทบทวนข้อมูลเซสชัน',

    start: 'เริ่มเซสชัน', startPractice: 'เริ่มฝึก', resume: 'ทำต่อ', pause: 'หยุดชั่วคราว',
    finish: 'เสร็จสิ้น', next: 'ถัดไป', save: 'บันทึก', cancel: 'ยกเลิก', done: 'เสร็จ',
    settings: 'ตั้งค่า', today: 'วันนี้', reps: 'ครั้ง', sets: 'เซ็ต', rep: 'ครั้งที่', of: 'จาก',
    accuracy: 'ความแม่นยำ', score: 'คะแนน', target: 'เป้าหมาย', hold: 'ค้างไว้', sec: 'วิ',
    selectExercise: 'เลือกท่าออกกำลัง', exercise: 'ท่าออกกำลัง', exercises: 'ท่าออกกำลัง',
    healthRomCategory: 'ท่า ROM สำหรับบันทึก/เข้าแผน',
    onDeviceActive: 'AI บนอุปกรณ์ · ใช้ออฟไลน์ได้', loadingModel: 'กำลังโหลดโมเดลท่าทาง…',
    cameraOff: 'กล้องปิดอยู่', startCamera: 'เปิดกล้อง', stopCamera: 'ปิดกล้อง',
    enableCamera: 'เปิดกล้องเพื่อเริ่ม', cameraDenied: 'ใช้กล้องไม่ได้ — กำลังใช้โหมดสาธิต',
    demoMode: 'โหมดสาธิต (จำลองท่าทาง)', liveMode: 'กล้องสด',
    permissionHint: 'อนุญาตการใช้กล้องเมื่อระบบถาม ข้อมูลจะไม่ถูกอัปโหลด',

    ex_shoulder: 'ยกแขนขึ้น', ex_knee: 'เหยียดเข่า', ex_hip: 'กางสะโพก',
    ex_squat: 'สควอทช่วยพยุง', ex_balance: 'ยืนขาเดียว',
    ex_rom_left_shoulder: 'ROM ไหล่ซ้าย', ex_rom_right_shoulder: 'ROM ไหล่ขวา',
    ex_rom_left_elbow: 'ROM ศอกซ้าย', ex_rom_right_elbow: 'ROM ศอกขวา',
    ex_rom_left_hip: 'ROM สะโพกซ้าย', ex_rom_right_hip: 'ROM สะโพกขวา',
    ex_rom_left_knee: 'ROM เข่าซ้าย', ex_rom_right_knee: 'ROM เข่าขวา',
    ex_rom_back: 'ROM หลัง', ex_rom_neck: 'ROM คอ',
    exd_shoulder: 'ยกแขนขวาไปข้างหน้าและขึ้นสูง',
    exd_knee: 'เหยียดเข่าให้ตรงสุด',
    exd_hip: 'ยกขาออกไปด้านข้าง',
    exd_squat: 'ย่อตัวลงสควอทแบบมีที่พยุง',
    exd_balance: 'ยืนขาเดียวแล้วค้างไว้',
    exd_rom_left_shoulder: 'วัดช่วงการเคลื่อนไหวของไหล่ซ้ายแบบควบคุม',
    exd_rom_right_shoulder: 'วัดช่วงการเคลื่อนไหวของไหล่ขวาแบบควบคุม',
    exd_rom_left_elbow: 'วัดช่วงการเคลื่อนไหวของศอกซ้ายแบบควบคุม',
    exd_rom_right_elbow: 'วัดช่วงการเคลื่อนไหวของศอกขวาแบบควบคุม',
    exd_rom_left_hip: 'วัดช่วงการเคลื่อนไหวของสะโพกซ้ายแบบควบคุม',
    exd_rom_right_hip: 'วัดช่วงการเคลื่อนไหวของสะโพกขวาแบบควบคุม',
    exd_rom_left_knee: 'วัดช่วงการเคลื่อนไหวของเข่าซ้ายแบบควบคุม',
    exd_rom_right_knee: 'วัดช่วงการเคลื่อนไหวของเข่าขวาแบบควบคุม',
    exd_rom_back: 'วัดช่วงการเคลื่อนไหวของหลังแบบควบคุม',
    exd_rom_neck: 'วัดช่วงการเคลื่อนไหวของคอแบบควบคุม',

    cueGetReady: 'เตรียมตัว', cueGoodForm: 'ท่าดีมาก ค้างไว้', cueHoldSteady: 'ค้างไว้นิ่งๆ',
    cuePerfect: 'ดีเยี่ยม ทำต่อไป', cueAdjust: 'ปรับท่าทางของคุณ', cueNoPose: 'ถอยออกเพื่อให้เห็นตัวคุณ',
    repDone: 'ครบหนึ่งครั้ง', setDone: 'ครบหนึ่งเซ็ต', sessionDone: 'จบเซสชันแล้ว เยี่ยมมาก',

    jc_raise: 'ยก{limb}ขึ้นอีก', jc_lower: 'ลด{limb}ลงเล็กน้อย',
    jc_straighten: 'เหยียด{limb}ให้ตรง', jc_bend: 'งอ{limb}เล็กน้อย',
    jc_open: 'กาง{limb}ออกให้กว้างขึ้น', jc_close: 'หุบ{limb}เข้าเล็กน้อย',
    jc_adjust: 'ปรับ{limb}',

    limb_r_arm: 'แขนขวา', limb_l_arm: 'แขนซ้าย', limb_r_elbow: 'ศอกขวา', limb_l_elbow: 'ศอกซ้าย',
    limb_r_knee: 'เข่าขวา', limb_l_knee: 'เข่าซ้าย', limb_r_hip: 'สะโพกขวา', limb_l_hip: 'สะโพกซ้าย',
    limb_r_ankle: 'ข้อเท้าขวา', limb_l_ankle: 'ข้อเท้าซ้าย', limb_back: 'หลัง', limb_neck: 'คอ',

    audioTitle: 'โหมดเสียงอย่างเดียว', audioReady: 'พร้อมนำทางด้วยเสียง',
    audioIntro: 'ฉันจะนำทางคุณด้วยเสียง แตะที่ใดก็ได้เพื่อเริ่ม แตะอีกครั้งเพื่อหยุด',
    tapToStart: 'แตะเพื่อเริ่ม', tapToPause: 'แตะเพื่อหยุด', listening: 'กำลังนำทาง…',
    spokenScore: 'คะแนนท่าของคุณคือ {n} เปอร์เซ็นต์',

    visualTitle: 'โหมดภาพอย่างเดียว', visualIntro: 'ทำตามสัญญาณบนหน้าจอ ไม่ต้องใช้เสียง',
    bigCue: 'คำแนะนำ', matchTarget: 'ทำให้ตรงกับเป้าหมายสีเขียว',

    captureTitle: 'โหมดนักกายภาพ', patient: 'ผู้ป่วย', patients: 'ผู้ป่วย',
    referencePose: 'ท่าอ้างอิง', captureRef: 'บันทึกท่าอ้างอิง', recapture: 'บันทึกใหม่',
    fromImage: 'จากรูปภาพ…', validate: 'ตรวจสอบ', setup: 'ตั้งค่า',
    captureHint: 'จัดท่าต้นแบบแล้วกดบันทึก ระบบจะเก็บมุมข้อต่อ 12 จุดเป็นเป้าหมาย',
    refSaved: 'บันทึกท่าอ้างอิงแล้ว', noPose: 'ไม่พบท่าทาง — ตรวจสอบว่าเห็นทั้งตัวในกรอบ',
    jointsCaptured: 'บันทึกข้อต่อ {n}/12 จุด', prescribe: 'เพิ่มในแผน', prescribed: 'อยู่ในแผนแล้ว',
    treatmentPlan: 'แผนการรักษา', addToPlan: 'เพิ่มในแผน', removeFromPlan: 'อยู่ในแผน',
    repsTarget: 'จำนวนครั้ง', setsTarget: 'เซ็ต', targetAngle: 'มุมเป้าหมาย', holdSec: 'ค้าง (วิ)',
    savePlan: 'บันทึกแผน', planSaved: 'บันทึกแผนสำหรับ {name} แล้ว',
    // Plan builder
    modePlan: 'สร้างแผน', planBuilderSub: 'กำหนดโปรแกรมออกกำลังที่บ้าน',
    planExercises: 'ท่าในแผน', tapToAdd: 'แตะที่ท่าเพื่อเพิ่มหรือลบ',
    noExercises: 'ยังไม่ได้เลือกท่า', dosage: 'ขนาด',
    schedule: 'ตารางเวลา', frequency: 'ความถี่', perDay: 'ครั้ง / วัน', daysPerWeek: 'วัน / สัปดาห์',
    startDate: 'วันเริ่ม', durationWeeks: 'ระยะเวลา (สัปดาห์)', endDate: 'สิ้นสุด', weeks: 'สัปดาห์',
    notesForPatient: 'หมายเหตุถึงคนไข้ (ไม่บังคับ)', planSummary: 'สรุป',
    planEmpty: 'เพิ่มอย่างน้อยหนึ่งท่าก่อน', perDayShort: '/วัน', sessionsTotal: 'เซสชันทั้งหมด',

    dashTitle: 'แดชบอร์ดนักกายภาพ', adherence: 'ความต่อเนื่อง', avgScore: 'คะแนนท่าเฉลี่ย',
    sessionsWeek: 'เซสชันสัปดาห์นี้', activePatients: 'ผู้ป่วยที่ใช้งาน',
    live: 'สด', offline: 'ออฟไลน์', lastSeen: 'ออนไลน์ล่าสุด', review: 'ทบทวน', message: 'ส่งข้อความ',
    alerts: 'การแจ้งเตือน', recentSessions: 'เซสชันล่าสุด', formTrend: 'แนวโน้มคะแนนท่า',
    aiSummary: 'สรุปเซสชันด้วย AI', regenerate: 'สร้างใหม่', noSessions: 'ยังไม่มีเซสชันที่บันทึก',
    weekday_mon: 'จ.', weekday_tue: 'อ.', weekday_wed: 'พ.', weekday_thu: 'พฤ.',
    weekday_fri: 'ศ.', weekday_sat: 'ส.', weekday_sun: 'อา.',
    summaryNote: 'สร้างบนอุปกรณ์จากบันทึกเซสชัน ในระบบจริงจะสร้างแบบอะซิงก์ด้วย Cloud LLM (Claude / GPT) จากข้อมูลสรุปที่ลบข้อมูลระบุตัวตนแล้ว',

    // Form scorer · camera gate · recognition · phase-3 analytics (new)
    formLabel: 'ฟอร์ม', formCorrect: 'ฟอร์มดี', cameraSetup: 'จัดกล้อง', framingGood: 'จัดกล้องพร้อม',
    detected: 'ตรวจพบ', wrongExercise: 'ดูเหมือนเป็นคนละท่า',
    sessionAvg3: 'เฉลี่ย 3 ครั้ง', clinicalAlerts: 'การแจ้งเตือนทางคลินิก', noAlerts: 'ไม่มีการแจ้งเตือน — ปกติดี',
    summarySrc: 'แหล่งที่มา', srcOnDevice: 'บนอุปกรณ์', srcCloud: 'LLM คลาวด์', movingAvg: 'ค่าเฉลี่ยเคลื่อนที่',

    language: 'ภาษา', modelQuality: 'คุณภาพโมเดล', modelLite: 'เบา (เร็ว)',
    modelFull: 'เต็ม (สมดุล)', modelHeavy: 'หนัก (แม่นยำ)', voice: 'ฟีดแบคด้วยเสียง',
    mirrorCam: 'สลับกล้องกระจก', resetData: 'ล้างข้อมูลในเครื่อง', confirmReset: 'ล้างข้อมูลในเครื่องทั้งหมด?',
  },
};

const LANG_KEY = 'physioai.v1.lang';

export function getLang() {
  try { return localStorage.getItem(LANG_KEY) || 'en'; } catch { return 'en'; }
}
export function setLang(lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  document.documentElement.lang = lang;
  window.dispatchEvent(new CustomEvent('physioai-lang', { detail: { lang } }));
}
export function onLangChange(cb) {
  const h = (e) => cb((e.detail && e.detail.lang) || getLang());
  window.addEventListener('physioai-lang', h);
  window.addEventListener('storage', h);
  return () => { window.removeEventListener('physioai-lang', h); window.removeEventListener('storage', h); };
}

/** Translate a key for the current (or given) language, with {placeholder} interpolation. */
export function t(key, vars, lang) {
  const L = lang || getLang();
  let s = (STRINGS[L] && STRINGS[L][key]) ?? (STRINGS.en[key] ?? key);
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}
