// PhysioAI · Version-2 — Practice screen (ready → live/demo session → summary).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePractice } from '../pose/usePractice.js';
import PoseCamera from '../pose/PoseCamera.js';
import Skeleton from '../components/Skeleton.js';
import BoundaryBoxOverlay from '../components/BoundaryBoxOverlay.js';
import ScoreRing from '../components/ScoreRing.js';
import { getExercise } from '../core/exercises.js';
import { getReference } from '../core/store.js';
import { isDemoEnabled } from '../core/api.js';
import { t, getLang } from '../core/i18n.js';
import { colors, scoreTone, toneColor } from '../core/theme.js';
import { evaluateBoundaryBox } from '../ai/BoundaryBoxGate.js';

export default function PracticeScreen({ route, navigation }) {
  const exId = route.params?.exId || 'shoulder';
  const dose = route.params?.dose;            // prescribed reps/sets/holdSec (plan); undefined = defaults
  const kind = route.params?.kind || 'plan';  // 'plan' counts toward adherence, 'extra' does not
  const exercise = route.params?.exercise || dose?.exercise || null;
  const patientId = route.params?.patientId || 'p1';
  const [mode, setMode] = useState(null); // null = ready, else 'live' | 'demo'
  const [runKey, setRunKey] = useState(0);

  if (!mode) return <ReadyView exId={exId} dose={dose} exercise={exercise} onStart={(m) => setMode(m)} onBack={() => navigation.goBack()} />;
  return <SessionView key={runKey} exId={exId} mode={mode} dose={dose} kind={kind} exercise={exercise} patientId={patientId} onAgain={() => setRunKey((k) => k + 1)} onExit={() => navigation.goBack()} />;
}

function ReadyView({ exId, dose, exercise, onStart, onBack }) {
  const ex = getExercise(exId, [exercise]);
  const lang = getLang();
  const showDemo = isDemoEnabled();
  const [hasRef, setHasRef] = useState(false);
  useEffect(() => {
    const hasPlanReference = !!(ex?.jointMotion || ex?.targetJointAngles || ex?.jointAngles);
    getReference(exId).then((r) => setHasRef(!!r || hasPlanReference)).catch(() => setHasRef(hasPlanReference));
  }, [exId, ex?.jointMotion, ex?.targetJointAngles, ex?.jointAngles]);
  const reps = dose?.reps ?? ex.reps, sets = dose?.sets ?? ex.sets, holdSec = dose?.holdSec ?? ex.holdSec;
  const planLine = ex.type === 'hold'
    ? `${holdSec}${t('sec')} ${t('hold')} · ${sets} ${t('sets')}`
    : `${reps} ${t('reps')} · ${sets} ${t('sets')}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.readyPage}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ {t('back')}</Text></Pressable>
        <Text style={[styles.pill, styles.pillBrand]}>{t('modePractice')}</Text>
        <Text style={styles.h1}>{ex.source === 'custom' ? (lang === 'th' ? ex.labelTh : ex.label) : t('ex_' + ex.key)}</Text>
        <Text style={styles.sub}>{ex.source === 'custom' ? (lang === 'th' ? 'ท่าที่นักกายภาพสร้างเอง' : 'Custom therapist exercise') : t('exd_' + ex.key)}</Text>

        <View style={styles.card}>
          <Row label={t('target')} value={`${Math.round(ex.target)}°`} />
          <Row label={ex.type === 'hold' ? t('hold') : t('reps')} value={planLine} />
          <Row label={t('referencePose')} value={hasRef ? t('refSaved') : `${t('target')} °`} />
        </View>

        <View style={{ flex: 1 }} />
        <Text style={styles.permHint}>{t('permissionHint')}</Text>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => onStart('live')}>
          <Text style={styles.btnPrimaryTxt}>{t('startCamera')}</Text>
        </Pressable>
        {showDemo ? (
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => onStart('demo')}>
            <Text style={styles.btnGhostTxt}>▶  {t('demoMode')}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function SessionView({ exId, mode, dose, kind, exercise, patientId, onAgain, onExit }) {
  const { snapshot: s, summary, ready, phase, countdown, onPoseResult } = usePractice({ exId, mode, dose, kind, exercise, patientId });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [livePts, setLivePts] = useState(null); // skeleton points pre-mapped to view px by the camera ViewCoordinator
  const [boundary, setBoundary] = useState(null);
  const boundaryFrame = useRef(null);
  const lang = getLang();
  const ex = getExercise(exId, [exercise]);

  useEffect(() => {
    boundaryFrame.current = null;
    setBoundary(null);
  }, [exId, mode, size.w, size.h]);

  if (summary) return <SummaryView summary={summary} onAgain={onAgain} onExit={onExit} />;

  const tone = scoreTone(s?.score);
  const gateBad = mode === 'live' && s?.gate && !s.gate.ok;
  const gateTone = s?.gate?.blockingBoundaryStatus === 'outside' || s?.gate?.boundaryStatus === 'outside'
    ? 'bad'
    : 'warn';
  const cueText = gateBad ? (lang === 'th' ? s.gate.hintTh : s.gate.hint) : (s?.cue?.text || t('cueGetReady'));
  const cueTone = gateBad ? gateTone : (s?.cue?.tone || 'none');
  const fc = s?.formClass;

  return (
    <View style={styles.sessionRoot} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {mode === 'live'
        ? <PoseCamera style={StyleSheet.absoluteFill} onLandmarks={(lm, viewPts) => {
            setLivePts(viewPts);   // view-pixel points from the camera ViewCoordinator
            const nextBoundary = viewPts && size.w > 0 && size.h > 0
              ? evaluateBoundaryBox(viewPts, size.w, size.h, boundaryFrame.current, ex)
              : null;
            boundaryFrame.current = nextBoundary?.nextFrame || null;
            setBoundary(nextBoundary);
            onPoseResult(lm, nextBoundary);
          }} />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface3 }]} />}

      {size.w > 0 && (mode === 'live' ? livePts : s?.landmarks)
        ? <Skeleton
            points={mode === 'live' ? livePts : null}
            pixels={mode === 'live'}
            landmarks={mode === 'live' ? null : s.landmarks}
            width={size.w} height={size.h} tone={tone} />
        : null}

      {mode === 'live' && size.w > 0
        ? <BoundaryBoxOverlay boundary={boundary} width={size.w} height={size.h} />
        : null}

      {/* positioning → countdown overlay (live only; reps don't count until active) */}
      {mode === 'live' && phase && phase !== 'active' ? (
        <View style={styles.phaseOverlay} pointerEvents="none">
          {phase === 'countdown'
            ? <Text style={styles.countdownNum}>{countdown}</Text>
            : (
              <View style={styles.posCard}>
                <Text style={styles.posTitle}>{lang === 'th' ? 'จัดท่าให้พร้อม' : 'Get into position'}</Text>
                <Text style={styles.posHint}>
                  {gateBad ? cueText : (lang === 'th' ? 'ยืนให้เห็นทั้งตัวในกรอบ แล้วค้างไว้สักครู่' : 'Stand fully in view, then hold still')}
                </Text>
              </View>
            )}
        </View>
      ) : null}

      <SafeAreaView style={styles.hud} edges={['top', 'bottom']} pointerEvents="box-none">
        {/* top */}
        <View style={styles.topRow}>
          <Pressable style={styles.glassPill} onPress={onExit}><Text style={styles.glassTxt}>‹ {t('ex_' + ex.key)}</Text></Pressable>
          <Text style={styles.glassPill}>{mode === 'demo' ? t('demoMode') : t('liveMode')}</Text>
        </View>

        {/* progress + form chip */}
        <View style={styles.progressWrap}>
          <RepBar reps={s?.reps || 0} target={s?.repsTarget || 1} />
          <Text style={styles.repLabel}>
            {(ex.type === 'hold' ? t('hold') : t('rep'))} {Math.min((s?.reps || 0) + 1, s?.repsTarget || 1)} {t('of')} {s?.repsTarget || 1}
            {'  ·  '}{t('sets')} {(s?.setsDone || 0) + 1}/{s?.totalSets || 1}
          </Text>
          <View style={styles.chipRow}>
            <Text style={styles.angleChip}>{s?.primaryAngle == null ? '—' : `${Math.round(s.primaryAngle)}° / ${Math.round(s.targetAngle || 0)}°`}</Text>
            {fc ? <Text style={[styles.formChip, { color: toneColor(fc.conf === 0 ? 'none' : fc.cls === 'correct' ? 'good' : fc.cls === 'multi' ? 'bad' : 'warn') }]}>
              {t('formLabel')}: {lang === 'th' ? fc.labelTh : fc.label}</Text> : null}
          </View>
        </View>

        <View style={{ flex: 1 }} />

        {/* cue */}
        <View style={styles.cueCard}>
          <Text style={styles.cueEyebrow}>{lang === 'th' ? 'คำแนะนำ' : 'Cue'}</Text>
          <Text style={[styles.cueText, { color: toneColor(cueTone) }]}>{cueText}</Text>
        </View>

        {/* bottom: score */}
        <View style={styles.bottomBar}>
          <ScoreRing value={s?.score ?? null} size={58} color={toneColor(tone)} />
          <View style={{ flex: 1 }}>
            <Text style={styles.accEyebrow}>{t('accuracy')}</Text>
            <Text style={styles.accText}>{s?.score == null ? t('cueNoPose') : `${s.score}%`}</Text>
          </View>
          {!ready ? <ActivityIndicator color={colors.brand} /> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const metricValue = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const pctText = (v) => {
  const n = metricValue(v);
  return n == null ? '—' : `${n}%`;
};

function issueLabels(lang) {
  return {
    tempo: lang === 'th' ? 'ทำช้าลงและคุมจังหวะให้สม่ำเสมอ' : 'Slow down and keep the tempo steady',
    smoothness: lang === 'th' ? 'ลดการกระตุกระหว่างเคลื่อนไหว' : 'Reduce jerky movement during the transition',
    path: lang === 'th' ? 'รักษาแนวการเคลื่อนไหวให้ตรงกับท่า' : 'Keep the movement on the intended path',
    sync: lang === 'th' ? 'ขยับสองข้างให้พร้อมกันมากขึ้น' : 'Move both sides more evenly',
    sequence: lang === 'th' ? 'ทำตามลำดับซ้าย/ขวาที่กำหนด' : 'Follow the required left/right sequence',
    inactiveSide: lang === 'th' ? 'คุมอีกข้างให้อยู่ใกล้ท่าพัก' : 'Keep the inactive side near rest',
    tracking: lang === 'th' ? 'ให้กล้องเห็นข้อต่อสำคัญชัดขึ้น' : 'Keep the key joints clearly visible',
    boundary: lang === 'th' ? 'อยู่ในกรอบตลอดทั้งครั้ง' : 'Stay inside the boundary for the whole rep',
    pose: lang === 'th' ? 'จัดท่าให้ใกล้ reference มากขึ้น' : 'Match the reference pose more closely',
    motion: lang === 'th' ? 'ควบคุม motion ให้ต่อเนื่องขึ้น' : 'Control the motion more smoothly',
  };
}

function topIssues(summary, lang) {
  const labels = issueLabels(lang);
  const counts = summary.motionIssueCounts || {};
  const sorted = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (!sorted.length) {
    return [lang === 'th' ? 'ไม่มีปัญหาหลักในเซสชันนี้' : 'No major issues detected in this session'];
  }
  return sorted.map(([k]) => labels[k] || k);
}

function SummaryView({ summary, onAgain, onExit }) {
  const lang = getLang();
  const overallScore = summary.overallScore ?? summary.avgScore ?? 0;
  const poseScore = summary.avgPoseScore ?? summary.avgScore ?? null;
  const motionScore = summary.avgMotionScore ?? null;
  const col = toneColor(scoreTone(overallScore));
  const issues = topIssues(summary, lang);
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.summaryPage}>
        <View style={styles.summaryHero}>
          <ScoreRing value={overallScore} size={118} thickness={10} color={col} />
          <View style={{ flex: 1 }}>
            <Text style={styles.h2}>{t('sessionDone')}</Text>
            <Text style={styles.summarySub}>
              {lang === 'th' ? 'คะแนนรวมของท่านี้' : 'Exercise session dashboard'}
            </Text>
          </View>
        </View>

        <View style={styles.scoreGrid}>
          <MetricCard label={lang === 'th' ? 'รวม' : 'Overall'} value={pctText(overallScore)} tone={scoreTone(overallScore)} />
          <MetricCard label={lang === 'th' ? 'ท่าทาง' : 'Pose'} value={pctText(poseScore)} tone={scoreTone(poseScore)} />
          <MetricCard label="Motion" value={pctText(motionScore)} tone={scoreTone(motionScore)} />
        </View>

        <View style={styles.dashboardBand}>
          <Text style={styles.sectionTitle}>{lang === 'th' ? 'คุณภาพระหว่างเคลื่อนไหว' : 'Motion quality'}</Text>
          <MetricBar label={lang === 'th' ? 'จังหวะ' : 'Tempo'} value={summary.avgTempoScore} />
          <MetricBar label={lang === 'th' ? 'ความลื่นไหล' : 'Smoothness'} value={summary.avgSmoothnessScore} />
          <MetricBar label={lang === 'th' ? 'แนวการเคลื่อนไหว' : 'Path'} value={summary.avgPathScore} />
          <MetricBar label={lang === 'th' ? 'ความพร้อมกัน' : 'Sync'} value={summary.avgSyncScore} />
        </View>

        <View style={styles.dashboardBand}>
          <Text style={styles.sectionTitle}>{lang === 'th' ? 'สิ่งที่ควรโฟกัสครั้งหน้า' : 'Focus next time'}</Text>
          {issues.map((txt, i) => (
            <View key={`${txt}-${i}`} style={styles.issueRow}>
              <Text style={styles.issueDot}>{i + 1}</Text>
              <Text style={styles.issueText}>{txt}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statPanel}>
          <Stat v={summary.validReps ?? summary.reps} label={t('reps')} />
          <Stat v={summary.invalidRepCount ?? 0} label={lang === 'th' ? 'ไม่ผ่าน' : 'invalid'} />
          <Stat v={summary.sets} label={t('sets')} />
          <Stat v={`${summary.durationSec}s`} label={lang === 'th' ? 'เวลา' : 'time'} />
          {summary.avgSecPerRep != null
            ? <Stat v={`${summary.avgSecPerRep}s`} label={lang === 'th' ? 'วิ/ครั้ง' : 'sec/rep'} />
            : null}
        </View>

        <Pressable style={[styles.btn, styles.btnPrimary, { alignSelf: 'stretch' }]} onPress={onAgain}>
          <Text style={styles.btnPrimaryTxt}>↻  {t('startPractice')}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnGhost, { alignSelf: 'stretch' }]} onPress={onExit}>
          <Text style={styles.btnGhostTxt}>{t('finish')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const Row = ({ label, value }) => (
  <View style={styles.kvRow}><Text style={styles.kvLabel}>{label}</Text><Text style={styles.kvValue}>{value}</Text></View>
);
const Stat = ({ v, label }) => (
  <View style={{ alignItems: 'center' }}><Text style={styles.statV}>{String(v)}</Text><Text style={styles.statL}>{label}</Text></View>
);
const MetricCard = ({ label, value, tone }) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[styles.metricValue, { color: toneColor(tone) }]}>{value}</Text>
  </View>
);
const MetricBar = ({ label, value }) => {
  const n = metricValue(value);
  const width = `${Math.max(0, Math.min(100, n ?? 0))}%`;
  return (
    <View style={styles.metricBarRow}>
      <View style={styles.metricBarTop}>
        <Text style={styles.metricBarLabel}>{label}</Text>
        <Text style={styles.metricBarValue}>{n == null ? '—' : `${n}%`}</Text>
      </View>
      <View style={styles.metricTrack}>
        <View style={[styles.metricFill, { width, backgroundColor: toneColor(scoreTone(n)) }]} />
      </View>
    </View>
  );
};
const RepBar = ({ reps, target }) => (
  <View style={{ flexDirection: 'row', gap: 4 }}>
    {Array.from({ length: target }).map((_, i) => (
      <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i < reps ? colors.good : 'rgba(255,255,255,0.35)' }} />
    ))}
  </View>
);

const glass = { backgroundColor: 'rgba(255,255,255,0.82)', borderRadius: 16 };
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  readyPage: { flex: 1, padding: 22 },
  back: { color: colors.ink2, fontSize: 15, marginBottom: 12 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  pillBrand: { backgroundColor: colors.brandSoft, color: colors.brand },
  h1: { fontSize: 30, fontWeight: '700', color: colors.ink, marginTop: 16 },
  sub: { fontSize: 14, color: colors.ink2, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 18 },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  kvLabel: { color: colors.ink2 }, kvValue: { color: colors.ink, fontWeight: '700' },
  permHint: { color: colors.ink2, fontSize: 12.5, textAlign: 'center', marginBottom: 12 },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryTxt: { color: colors.inverse, fontWeight: '700', fontSize: 16 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  btnGhostTxt: { color: colors.ink, fontWeight: '600', fontSize: 15 },

  sessionRoot: { flex: 1, backgroundColor: '#000' },
  hud: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 16 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  glassPill: { ...glass, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, color: colors.ink, fontWeight: '600', overflow: 'hidden' },
  glassTxt: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  progressWrap: { marginTop: 12 },
  repLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 6 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  angleChip: { ...glass, paddingHorizontal: 8, paddingVertical: 3, fontSize: 13, fontWeight: '600', color: colors.ink, overflow: 'hidden' },
  formChip: { ...glass, paddingHorizontal: 8, paddingVertical: 3, fontSize: 13, fontWeight: '700', overflow: 'hidden' },
  cueCard: { ...glass, padding: 14, marginBottom: 12 },
  cueEyebrow: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.ink3, fontWeight: '600' },
  cueText: { fontSize: 17, fontWeight: '700', marginTop: 2 },
  bottomBar: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 13, marginBottom: 12 },
  accEyebrow: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.ink3, fontWeight: '600' },
  accText: { fontSize: 15, fontWeight: '600', color: colors.ink },

  phaseOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  countdownNum: { fontSize: 120, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 12 },
  posCard: { ...glass, paddingVertical: 16, paddingHorizontal: 22, marginHorizontal: 28, alignItems: 'center' },
  posTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  posHint: { fontSize: 13.5, color: colors.ink2, marginTop: 6, textAlign: 'center' },

  h2: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 18 },
  summaryPage: { padding: 22, paddingBottom: 34 },
  summaryHero: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 18 },
  summarySub: { color: colors.ink2, fontSize: 13.5, marginTop: 4 },
  scoreGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  metricCard: { flex: 1, minHeight: 82, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 12, justifyContent: 'space-between' },
  metricLabel: { color: colors.ink2, fontSize: 12, fontWeight: '600' },
  metricValue: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  dashboardBand: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 8, padding: 14, marginTop: 12 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  metricBarRow: { marginTop: 10 },
  metricBarTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  metricBarLabel: { color: colors.ink2, fontSize: 12.5, fontWeight: '600' },
  metricBarValue: { color: colors.ink, fontSize: 12.5, fontWeight: '700' },
  metricTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: 'hidden' },
  metricFill: { height: 8, borderRadius: 4 },
  issueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  issueDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandSoft, color: colors.brand, textAlign: 'center', lineHeight: 22, fontWeight: '800', fontSize: 12 },
  issueText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  statPanel: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18, paddingVertical: 18 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 22, marginVertical: 20 },
  statV: { fontSize: 20, fontWeight: '700', color: colors.ink },
  statL: { fontSize: 11, color: colors.ink2, marginTop: 2 },
});
