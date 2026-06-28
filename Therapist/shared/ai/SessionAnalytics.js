// PhysioAI · Version-1 — Session Analytics (diagram node P3.2a · type = Algorithm).
//
// Pure descriptive statistics over session logs — moving average, mean/sd,
// z-scores, trend slope, and headline aggregates. Deterministic math, no
// judgement and no AI. Consumed by the dashboard (KPIs / trend chart) and by the
// Clinical Rule Engine (which turns these numbers into explainable alerts).

/** Trailing moving average. Returns an array the same length as `values`;
 *  position i averages values[max(0,i-window+1) .. i]. */
export function movingAverage(values, window = 3) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum = 0, n = 0;
    for (let j = start; j <= i; j++) { sum += values[j]; n++; }
    out.push(n === 0 ? 0 : sum / n);
  }
  return out;
}

/** Population mean / sd and per-value z-scores. If sd === 0 (or <2 values),
 *  every z is 0 (no spread → nothing is anomalous). */
export function zScores(values) {
  const n = values.length;
  if (n === 0) return { mean: 0, sd: 0, z: [] };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n; // population
  const sd = Math.sqrt(variance);
  const z = sd === 0 ? values.map(() => 0) : values.map((v) => (v - mean) / sd);
  return { mean, sd, z };
}

export const sessionScore = (s) => {
  const v = s?.overallScore ?? s?.avgScore;
  return Number.isFinite(Number(v)) ? Number(v) : null;
};

const meanScore = (list, key) => {
  const values = list.map((s) => s?.[key]).filter((v) => Number.isFinite(Number(v))).map(Number);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
};

/** Roll a list of session logs up into headline numbers.
 *  worstJoint = the joint with the largest mean avgDeltas across `sessions`. */
export function aggregate(sessions) {
  const list = sessions || [];
  const scores = list.map(sessionScore).filter((v) => v != null);
  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;
  const totalReps = list.reduce((a, s) => a + (s.reps || 0), 0);
  const invalidRepCount = list.reduce((a, s) => a + (s.invalidRepCount || 0), 0);

  const sum = {}, cnt = {};
  for (const s of list) {
    for (const j in (s.avgDeltas || {})) {
      sum[j] = (sum[j] || 0) + s.avgDeltas[j];
      cnt[j] = (cnt[j] || 0) + 1;
    }
  }
  let worstJoint = null, worstVal = -1;
  for (const j in sum) {
    const v = sum[j] / cnt[j];
    if (v > worstVal) { worstVal = v; worstJoint = { joint: j, delta: v }; }
  }

  return {
    avgScore,
    totalReps,
    sessionCount: list.length,
    worstJoint,
    invalidRepCount,
    avgMotionScore: meanScore(list, 'avgMotionScore'),
    avgPoseScore: meanScore(list, 'avgPoseScore'),
    avgTempoScore: meanScore(list, 'avgTempoScore'),
    avgSmoothnessScore: meanScore(list, 'avgSmoothnessScore'),
    avgPathScore: meanScore(list, 'avgPathScore'),
    avgSyncScore: meanScore(list, 'avgSyncScore'),
  };
}

/** Trend over the last `n` sessions (OLDEST→NEWEST).
 *  `sessions` arrives newest-first (getSessions order) → reverse + slice tail.
 *  movavg = movingAverage(scores, 3); slope = last − first of movavg (the net
 *  drift of the smoothed line; positive = improving, negative = declining). */
export function sessionTrend(sessions, n = 7) {
  const newestFirst = sessions || [];
  const scores = newestFirst
    .slice(0, n)                                   // last n (newest-first)
    .map(sessionScore)
    .filter((v) => v != null)
    .reverse();                                    // → oldest→newest
  const movavg = movingAverage(scores, 3);
  const slope = movavg.length >= 2 ? movavg[movavg.length - 1] - movavg[0] : 0;
  return { scores, movavg, slope };
}
