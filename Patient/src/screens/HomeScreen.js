// PhysioAI · Version-2 — Home (patient).
//
// Two zones, by the clinical model:
//  • "My plan" — exercises the therapist prescribed (with their dosage). These
//    count toward today's adherence/progress.
//  • "Extras"  — built-in popular exercises NOT in the plan, that the patient may
//    do on their own (optional, never counted toward adherence).

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EXERCISES, getExercise, isBuiltin } from '../core/exercises.js';
import { getPlanFull, getSessions } from '../core/store.js';
import { getSession, logout } from '../core/auth.js';
import { t, getLang } from '../core/i18n.js';
import { colors } from '../core/theme.js';

const FALLBACK_PATIENT_ID = 'p1';

export default function HomeScreen({ navigation }) {
  const [plan, setPlan] = useState(null);
  const [doneIds, setDoneIds] = useState(new Set());
  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    (async () => {
      const nextSession = await getSession().catch(() => null);
      const patientId = nextSession?.id || FALLBACK_PATIENT_ID;
      setSession(nextSession);
      try {
        const [nextPlan, list] = await Promise.all([
          getPlanFull(patientId),
          getSessions(patientId),
        ]);
        setLoadError(null);
        if (nextPlan) setPlan(nextPlan);
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const ms = start.getTime();
        // Count only plan exercises done today; extras (kind:'extra') never count.
        setDoneIds(new Set((list || [])
          .filter((s) => s.endedAt >= ms && s.kind !== 'extra')
          .map((s) => s.exerciseId)));
      } catch (error) {
        setLoadError(error);
        setPlan(null);
        setDoneIds(new Set());
      }
    })();
  }, []);
  useEffect(() => load(), [load]);
  useEffect(() => navigation.addListener('focus', load), [navigation, load]); // refresh after each session

  const lang = getLang();
  const doLogout = async () => { await logout(); navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] }); };

  const items = plan?.items || [];
  const planIds = items.map((i) => i.exerciseId);
  const extras = EXERCISES.filter((e) => isBuiltin(e) && !planIds.includes(e.id));
  const regularExtras = extras.filter((e) => e.category !== 'health_rom');
  const romExtras = extras.filter((e) => e.category === 'health_rom');
  const doneCount = planIds.filter((id) => doneIds.has(id)).length;
  const total = items.length;
  const patientId = session?.id || plan?.patientId || FALLBACK_PATIENT_ID;

  const go = (exId, dose, kind, exercise) => navigation.navigate('Practice', { exId, dose, kind, exercise, patientId });
  const errorText = loadError
    ? (loadError.code === 'api_not_configured' || loadError.code === 'demo_disabled'
        ? (lang === 'th' ? 'ยังไม่ได้ตั้งค่า API สำหรับ production' : 'Production API is not configured')
        : (lang === 'th' ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ' : 'Could not reach the server'))
    : '';
  const exerciseName = (ex) => ex.source === 'custom' ? (lang === 'th' ? ex.labelTh : ex.label) : t('ex_' + ex.key);
  const doseLine = (e) => e.type === 'hold'
    ? `${e.holdSec}${t('sec')} ${t('hold')} · ${e.sets} ${t('sets')}`
    : `${e.reps} ${t('reps')} · ${e.sets} ${t('sets')}`;

  const PlanRow = (item) => {
    const ex = getExercise(item.exerciseId, [item.exercise]);
    const done = doneIds.has(ex.id);
    return (
      <Pressable key={ex.id} style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        onPress={() => go(ex.id, { reps: item.reps, sets: item.sets, holdSec: item.holdSec, tol: item.tol, countMode: item.countMode, exercise: item.exercise }, 'plan', ex)}>
        <View style={[styles.iconWrap, done && { backgroundColor: colors.good }]}>
          <Text style={[styles.iconTxt, done && { color: colors.inverse }]}>{done ? '✓' : '◷'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{exerciseName(ex)}</Text>
          <Text style={styles.hint}>{doseLine({ ...ex, ...item })}</Text>
        </View>
        <Text style={styles.chev}>›</Text>
      </Pressable>
    );
  };

  const ExtraRow = (ex) => (
    <Pressable key={ex.id} style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => go(ex.id, undefined, 'extra', ex)}>
      <View style={styles.iconWrap}><Text style={styles.iconTxt}>＋</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{exerciseName(ex)}</Text>
        <Text style={styles.hint}>{doseLine(ex)}</Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text style={styles.brand}>Physio<Text style={{ color: colors.brand }}>AI</Text></Text>
          <Pressable onPress={doLogout} hitSlop={10}><Text style={styles.logout}>{t('logout')}</Text></Pressable>
        </View>
        {session?.name ? <Text style={styles.greeting}>{t('greeting', { name: session.name })}</Text> : null}
        {loadError ? <Text style={styles.errorBox}>{errorText}</Text> : null}

        {!loadError && total > 0 ? (
          <View style={styles.progCard}>
            <View style={styles.progTop}>
              <Text style={styles.progLabel}>{t('todayProgress')}</Text>
              <Text style={styles.progCount}>
                {doneCount >= total ? t('planAllDone') : t('planDoneOf', { done: doneCount, total })}
              </Text>
            </View>
            <View style={styles.progTrack}>
              <View style={[styles.progFill, { width: `${total ? (doneCount / total) * 100 : 0}%` }]} />
            </View>
          </View>
        ) : null}

        <Text style={styles.section}>{t('myPlan')}</Text>
        {loadError ? null : items.length ? items.map(PlanRow)
          : <Text style={styles.empty}>{lang === 'th' ? 'ยังไม่มีแผนจากนักกายภาพ' : 'No plan from your therapist yet'}</Text>}

        {regularExtras.length > 0 ? (
          <>
            <Text style={styles.section}>{t('extras')}</Text>
            <Text style={styles.sectionHint}>{t('extrasHint')}</Text>
            {regularExtras.map(ExtraRow)}
          </>
        ) : null}

        {romExtras.length > 0 ? (
          <>
            <Text style={styles.section}>{t('healthRomCategory')}</Text>
            <Text style={styles.sectionHint}>{lang === 'th' ? 'วัดช่วงการเคลื่อนไหวแบบแยกข้าง' : 'Quick range-of-motion checks by joint'}</Text>
            {romExtras.map(ExtraRow)}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  brand: { fontSize: 18, fontWeight: '700', color: colors.ink },
  logout: { color: colors.ink2, fontSize: 14, fontWeight: '600' },
  greeting: { fontSize: 15, color: colors.ink2, marginTop: 8 },
  errorBox: { color: colors.bad, backgroundColor: colors.surface, borderColor: colors.bad, borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 14, fontSize: 14, lineHeight: 20 },

  progCard: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 14 },
  progTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  progLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  progCount: { fontSize: 13, color: colors.brand, fontWeight: '600' },
  progTrack: { height: 8, borderRadius: 6, backgroundColor: colors.surface3, overflow: 'hidden' },
  progFill: { height: 8, borderRadius: 6, backgroundColor: colors.good },

  section: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.ink3, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  sectionHint: { fontSize: 12, color: colors.ink3, marginTop: -4, marginBottom: 8 },
  empty: { color: colors.ink2, fontSize: 14, paddingVertical: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  pressed: { opacity: 0.7 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  iconTxt: { color: colors.brand, fontSize: 20 },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink },
  hint: { fontSize: 13, color: colors.ink2, marginTop: 2 },
  chev: { fontSize: 24, color: colors.ink3 },
});
