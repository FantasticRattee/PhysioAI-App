// PhysioAI · Version-2 — usePractice hook.
//
// Owns the live practice loop on the React side: builds the session, drives the
// synthetic DEMO feed (works in Expo Go, no native module), receives LIVE pose
// frames from <PoseCamera>, speaks cues (TTS), and logs the session on finish.
// Camera-agnostic: the screen renders the camera and pipes results to onPoseResult.

import { useEffect, useRef, useState, useCallback } from 'react';
import { createSession } from '../core/session.js';
import { getExercise } from '../core/exercises.js';
import { getReference, getAllReferences, getSettings, logSession } from '../core/store.js';
import { makeSyntheticFeed } from '../ai/SyntheticPose.js';
import { tts } from '../core/tts.js';
import { t, getLang } from '../core/i18n.js';

export function usePractice({ exId, mode, dose, kind, exercise: exerciseSnapshot, patientId = 'p1' }) {
  const [snapshot, setSnapshot] = useState(null);
  const [summary, setSummary] = useState(null);
  const [ready, setReady] = useState(false);

  const session = useRef(null);
  const feed = useRef(null);
  const timer = useRef(null);
  const lastTs = useRef(0);
  const finished = useRef(false);
  const voice = useRef(true);
  const lang = useRef(getLang());

  // Practice phase (live): positioning → countdown → active. Demo starts active.
  const [phase, setPhaseState] = useState(mode === 'live' ? 'positioning' : 'active');
  const [countdown, setCountdown] = useState(0);
  const phaseRef = useRef(mode === 'live' ? 'positioning' : 'active');
  const posStableSince = useRef(0);
  const cdTimer = useRef(null);
  const posFallback = useRef(null);

  const stopLoop = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);

  const clearPhaseTimers = useCallback(() => {
    if (cdTimer.current) { clearInterval(cdTimer.current); cdTimer.current = null; }
    if (posFallback.current) { clearTimeout(posFallback.current); posFallback.current = null; }
  }, []);

  const enterActive = useCallback(() => {
    clearPhaseTimers();
    session.current?.reset();          // active workout = fresh reps / score / duration
    lastTs.current = Date.now();
    setCountdown(0);
    phaseRef.current = 'active'; setPhaseState('active');
  }, [clearPhaseTimers]);

  const startCountdown = useCallback(() => {
    if (phaseRef.current === 'countdown' || phaseRef.current === 'active') return;
    clearPhaseTimers();
    phaseRef.current = 'countdown'; setPhaseState('countdown');
    let n = 3; setCountdown(n);
    cdTimer.current = setInterval(() => {
      n -= 1;
      if (n <= 0) enterActive(); else setCountdown(n);
    }, 1000);
  }, [clearPhaseTimers, enterActive]);

  const emit = useCallback((snap) => {
    if (!snap) return;
    setSnapshot({ ...snap });
    if (voice.current && snap.cue && snap.cue.tone !== 'none') {
      tts.say(snap.cue.id, snap.cue.text, lang.current);
    }
  }, []);

  const feedFrame = useCallback((landmarks, boundary = null) => {
    const s = session.current;
    if (!s || finished.current || !landmarks) return;
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastTs.current) / 1000);
    lastTs.current = now;
    const counting = phaseRef.current === 'active';   // only count reps once active
    const snap = s.pushFrame(landmarks, dt, counting, { boundary });
    emit(snap);
    // Live: hold a well-framed pose ~1s → start the 3-2-1 countdown (setup frames don't count).
    if (mode === 'live' && phaseRef.current === 'positioning' && snap) {
      const framed = snap.hasPose && snap.gate && snap.gate.ok;
      if (framed) {
        if (!posStableSince.current) posStableSince.current = now;
        else if (now - posStableSince.current >= 1000) startCountdown();
      } else {
        posStableSince.current = 0;
      }
    }
  }, [emit, mode, startCountdown]);

  // Live camera pushes normalized 33-landmark frames here.
  const onPoseResult = useCallback((landmarks, boundary) => {
    if (mode === 'live') feedFrame(landmarks, boundary);
  }, [mode, feedFrame]);

  const startDemo = useCallback(() => {
    const start = Date.now();
    lastTs.current = start;
    timer.current = setInterval(() => {
      const el = (Date.now() - start) / 1000;
      const { landmarks } = feed.current(el);
      feedFrame(landmarks);
    }, 40); // ~25 fps synthetic
  }, [feedFrame]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    stopLoop();
    const sum = session.current.finishSummary();
    logSession(sum).catch(() => {});
    if (voice.current) tts.speakNow(t('sessionDone', null, lang.current), lang.current);
    setSummary(sum);
  }, [stopLoop]);

  const handleEvent = useCallback((e) => {
    if (e.type === 'rep' && voice.current) tts.say('evt:rep', t('repDone', null, lang.current), lang.current, 1200);
    else if (e.type === 'set' && voice.current) tts.say('evt:set', t('setDone', null, lang.current), lang.current, 1200);
    else if (e.type === 'done') finish();
  }, [finish]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [reference, allRefs, settings] = await Promise.all([
        getReference(exId), getAllReferences(), getSettings(),
      ]);
      if (!alive) return;
      const ex = getExercise(exId, [exerciseSnapshot, dose?.exercise, reference?.exercise, reference]);
      voice.current = settings.voice !== false;
      lang.current = getLang();
      session.current = createSession({
        exercise: ex, reference, allRefs, lang: lang.current, dose, kind,
        patientId, source: mode === 'demo' ? 'demo' : 'live', onEvent: handleEvent,
      });
      feed.current = makeSyntheticFeed(session.current.exercise);
      lastTs.current = Date.now();
      setReady(true);
      if (mode === 'demo') startDemo();
      else posFallback.current = setTimeout(startCountdown, 10000); // never stall if framing never passes
    })();
    return () => { alive = false; stopLoop(); clearPhaseTimers(); tts.cancel(); };
  }, [exId, mode, dose, exerciseSnapshot, patientId, handleEvent, startDemo, stopLoop, startCountdown, clearPhaseTimers]);

  const restart = useCallback(() => {
    stopLoop(); clearPhaseTimers(); // clear any running demo/countdown timer before re-arming
    finished.current = false;
    setSummary(null);
    setSnapshot(null);
    session.current?.reset();
    lastTs.current = Date.now();
    posStableSince.current = 0;
    const p = mode === 'live' ? 'positioning' : 'active';
    phaseRef.current = p; setPhaseState(p); setCountdown(0);
    if (mode === 'demo') startDemo();
    else posFallback.current = setTimeout(startCountdown, 10000);
  }, [mode, startDemo, stopLoop, clearPhaseTimers, startCountdown]);

  return { snapshot, summary, ready, source: mode, phase, countdown, onPoseResult, restart, finish };
}
