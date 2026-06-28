import {
  movingAverage,
  zScores,
  sessionScore,
  aggregate,
  sessionTrend,
} from '../../Therapist/shared/ai/SessionAnalytics.js';

function slopeOf(arr) {
  return arr.length >= 2 ? arr[arr.length - 1] - arr[0] : 0;
}

describe('SessionAnalytics.movingAverage', () => {
  it('preserves length of the input array', () => {
    expect(movingAverage([1, 2, 3, 4, 5])).toHaveLength(5);
    expect(movingAverage([1, 2, 3, 4], 2)).toHaveLength(4);
  });

  it('computes a trailing average (window=2) with known values', () => {
    const out = movingAverage([1, 2, 3, 4], 2);
    // i0: [1]=1, i1: [1,2]=1.5, i2: [2,3]=2.5, i3: [3,4]=3.5
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(1.5);
    expect(out[2]).toBeCloseTo(2.5);
    expect(out[3]).toBeCloseTo(3.5);
  });

  it('uses a default window of 3', () => {
    const out = movingAverage([3, 6, 9, 12]);
    // i0: [3]=3, i1: [3,6]=4.5, i2: [3,6,9]=6, i3: [6,9,12]=9
    expect(out[0]).toBeCloseTo(3);
    expect(out[1]).toBeCloseTo(4.5);
    expect(out[2]).toBeCloseTo(6);
    expect(out[3]).toBeCloseTo(9);
  });

  it('returns the original values when window is 1', () => {
    const values = [5, 10, 15, 20];
    expect(movingAverage(values, 1)).toEqual(values);
  });

  it('returns trailing means once the window covers the whole array', () => {
    const out = movingAverage([2, 4, 6], 10);
    // i0:[2]=2, i1:[2,4]=3, i2:[2,4,6]=4
    expect(out[0]).toBeCloseTo(2);
    expect(out[1]).toBeCloseTo(3);
    expect(out[2]).toBeCloseTo(4);
  });

  it('returns an empty array for empty input', () => {
    expect(movingAverage([])).toEqual([]);
    expect(movingAverage([], 5)).toEqual([]);
  });

  it('handles a single element', () => {
    expect(movingAverage([42])).toEqual([42]);
  });
});

describe('SessionAnalytics.zScores', () => {
  it('returns the population mean and sd', () => {
    const { mean, sd } = zScores([2, 4, 6]);
    // mean=4; population variance = (4+0+4)/3 = 8/3; sd = sqrt(8/3)
    expect(mean).toBeCloseTo(4);
    expect(sd).toBeCloseTo(Math.sqrt(8 / 3));
  });

  it('produces z-scores that are centered (sum ~ 0)', () => {
    const { z } = zScores([1, 2, 3, 4, 5]);
    const total = z.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(0);
    expect(z).toHaveLength(5);
  });

  it('computes correct individual z-scores', () => {
    const { mean, sd, z } = zScores([2, 4, 6]);
    expect(z[0]).toBeCloseTo((2 - mean) / sd);
    expect(z[1]).toBeCloseTo(0); // middle value equals mean
    expect(z[2]).toBeCloseTo((6 - mean) / sd);
  });

  it('returns sd 0 and all-zero z for constant input', () => {
    const { mean, sd, z } = zScores([5, 5, 5, 5]);
    expect(mean).toBeCloseTo(5);
    expect(sd).toBe(0);
    expect(z).toEqual([0, 0, 0, 0]);
  });

  it('returns zeros for empty input', () => {
    expect(zScores([])).toEqual({ mean: 0, sd: 0, z: [] });
  });

  it('treats a single value as having no spread (z = 0)', () => {
    const { mean, sd, z } = zScores([7]);
    expect(mean).toBeCloseTo(7);
    expect(sd).toBe(0);
    expect(z).toEqual([0]);
  });
});

describe('SessionAnalytics.sessionScore', () => {
  it('prefers overallScore when present', () => {
    expect(sessionScore({ overallScore: 88, avgScore: 50 })).toBe(88);
  });

  it('falls back to avgScore when overallScore is absent', () => {
    expect(sessionScore({ avgScore: 72 })).toBe(72);
  });

  it('coerces numeric strings to numbers', () => {
    expect(sessionScore({ avgScore: '64' })).toBe(64);
  });

  it('returns null when neither field is present', () => {
    expect(sessionScore({})).toBeNull();
    expect(sessionScore({ reps: 10 })).toBeNull();
  });

  it('returns null for null/undefined session', () => {
    expect(sessionScore(null)).toBeNull();
    expect(sessionScore(undefined)).toBeNull();
  });

  it('returns null when the value is not finite', () => {
    expect(sessionScore({ avgScore: 'abc' })).toBeNull();
    expect(sessionScore({ overallScore: NaN })).toBeNull();
  });

  it('handles a zero score (falsy but finite)', () => {
    expect(sessionScore({ overallScore: 0 })).toBe(0);
  });
});

describe('SessionAnalytics.aggregate', () => {
  it('returns the documented shape with all keys for empty input', () => {
    const out = aggregate([]);
    expect(out).toEqual({
      avgScore: 0,
      totalReps: 0,
      sessionCount: 0,
      worstJoint: null,
      invalidRepCount: 0,
      avgMotionScore: null,
      avgPoseScore: null,
      avgTempoScore: null,
      avgSmoothnessScore: null,
      avgPathScore: null,
      avgSyncScore: null,
    });
  });

  it('handles null/undefined input as empty', () => {
    expect(aggregate(null).sessionCount).toBe(0);
    expect(aggregate(undefined).avgScore).toBe(0);
  });

  it('computes avgScore, totalReps and sessionCount over multiple sessions', () => {
    const sessions = [
      { overallScore: 80, reps: 10 },
      { overallScore: 90, reps: 5 },
      { avgScore: 70, reps: 3 },
    ];
    const out = aggregate(sessions);
    expect(out.sessionCount).toBe(3);
    expect(out.totalReps).toBe(18);
    expect(out.avgScore).toBe(80); // (80+90+70)/3 = 80
  });

  it('rounds the average score', () => {
    const sessions = [{ overallScore: 80 }, { overallScore: 85 }];
    // (80+85)/2 = 82.5 -> Math.round -> 83
    expect(aggregate(sessions).avgScore).toBe(83);
  });

  it('skips sessions with no score when averaging but still counts them', () => {
    const sessions = [
      { overallScore: 60, reps: 2 },
      { reps: 4 }, // no score
      { overallScore: 80, reps: 1 },
    ];
    const out = aggregate(sessions);
    expect(out.avgScore).toBe(70); // (60+80)/2
    expect(out.totalReps).toBe(7);
    expect(out.sessionCount).toBe(3);
  });

  it('sums invalidRepCount across sessions', () => {
    const sessions = [
      { overallScore: 50, invalidRepCount: 2 },
      { overallScore: 60, invalidRepCount: 3 },
      { overallScore: 70 },
    ];
    expect(aggregate(sessions).invalidRepCount).toBe(5);
  });

  it('identifies worstJoint as the joint with the largest mean avgDeltas', () => {
    const sessions = [
      { overallScore: 70, avgDeltas: { knee: 10, hip: 4 } },
      { overallScore: 75, avgDeltas: { knee: 20, hip: 6 } },
    ];
    const out = aggregate(sessions);
    // knee mean = 15, hip mean = 5 -> knee is worst
    expect(out.worstJoint).toEqual({ joint: 'knee', delta: 15 });
  });

  it('averages deltas across only the sessions that report that joint', () => {
    const sessions = [
      { overallScore: 70, avgDeltas: { shoulder: 30 } },
      { overallScore: 75, avgDeltas: { elbow: 12, shoulder: 10 } },
    ];
    const out = aggregate(sessions);
    // shoulder mean = (30+10)/2 = 20; elbow mean = 12 -> shoulder worst
    expect(out.worstJoint).toEqual({ joint: 'shoulder', delta: 20 });
  });

  it('returns null worstJoint when no avgDeltas are present', () => {
    const out = aggregate([{ overallScore: 50 }, { overallScore: 60 }]);
    expect(out.worstJoint).toBeNull();
  });

  it('computes the avg*Score sub-metrics (rounded) when present', () => {
    const sessions = [
      {
        overallScore: 80,
        avgMotionScore: 70,
        avgPoseScore: 60,
        avgTempoScore: 50,
        avgSmoothnessScore: 40,
        avgPathScore: 30,
        avgSyncScore: 20,
      },
      {
        overallScore: 90,
        avgMotionScore: 71,
        avgPoseScore: 62,
        avgTempoScore: 52,
        avgSmoothnessScore: 44,
        avgPathScore: 30,
        avgSyncScore: 21,
      },
    ];
    const out = aggregate(sessions);
    expect(out.avgMotionScore).toBe(71); // (70+71)/2=70.5 -> 71
    expect(out.avgPoseScore).toBe(61); // (60+62)/2=61
    expect(out.avgTempoScore).toBe(51); // (50+52)/2=51
    expect(out.avgSmoothnessScore).toBe(42); // (40+44)/2=42
    expect(out.avgPathScore).toBe(30);
    expect(out.avgSyncScore).toBe(21); // (20+21)/2=20.5 -> 21
  });

  it('returns null for a sub-metric that no session reports', () => {
    const out = aggregate([{ overallScore: 80 }, { overallScore: 90 }]);
    expect(out.avgMotionScore).toBeNull();
    expect(out.avgPoseScore).toBeNull();
    expect(out.avgSyncScore).toBeNull();
  });

  it('treats missing reps/invalidRepCount as 0', () => {
    const out = aggregate([{ overallScore: 50 }]);
    expect(out.totalReps).toBe(0);
    expect(out.invalidRepCount).toBe(0);
  });
});

describe('SessionAnalytics.sessionTrend', () => {
  it('returns scores oldest->newest from newest-first input', () => {
    // input is newest-first; output scores should be oldest->newest
    const sessions = [
      { overallScore: 90 }, // newest
      { overallScore: 80 },
      { overallScore: 70 }, // oldest
    ];
    const { scores } = sessionTrend(sessions);
    expect(scores).toEqual([70, 80, 90]);
  });

  it('limits to the last n sessions (newest-first slice) before reversing', () => {
    const sessions = [
      { overallScore: 100 }, // newest
      { overallScore: 95 },
      { overallScore: 90 },
      { overallScore: 85 }, // beyond n=3, dropped
    ];
    const { scores } = sessionTrend(sessions, 3);
    // slice(0,3) -> [100,95,90] -> reversed -> [90,95,100]
    expect(scores).toEqual([90, 95, 100]);
  });

  it('computes a positive slope for improving sessions', () => {
    // newest-first: newest highest -> oldest->newest improves
    const sessions = [
      { overallScore: 95 },
      { overallScore: 85 },
      { overallScore: 75 },
      { overallScore: 65 },
    ];
    const { movavg, slope } = sessionTrend(sessions);
    expect(slope).toBeGreaterThan(0);
    expect(slope).toBeCloseTo(movavg[movavg.length - 1] - movavg[0]);
  });

  it('computes a negative slope for declining sessions', () => {
    // newest-first: newest lowest -> oldest->newest declines
    const sessions = [
      { overallScore: 50 },
      { overallScore: 60 },
      { overallScore: 70 },
      { overallScore: 80 },
    ];
    const { slope } = sessionTrend(sessions);
    expect(slope).toBeLessThan(0);
  });

  it('movavg is the 3-window moving average of scores', () => {
    const sessions = [
      { overallScore: 90 },
      { overallScore: 80 },
      { overallScore: 70 },
    ];
    const { scores, movavg, slope } = sessionTrend(sessions);
    expect(scores).toEqual([70, 80, 90]);
    // [70]=70, [70,80]=75, [70,80,90]=80
    expect(movavg[0]).toBeCloseTo(70);
    expect(movavg[1]).toBeCloseTo(75);
    expect(movavg[2]).toBeCloseTo(80);
    expect(slope).toBeCloseTo(slopeOf(movavg));
    expect(slope).toBeCloseTo(10);
  });

  it('returns slope 0 and empty arrays for no sessions', () => {
    const out = sessionTrend([]);
    expect(out.scores).toEqual([]);
    expect(out.movavg).toEqual([]);
    expect(out.slope).toBe(0);
  });

  it('returns slope 0 for a single scored session', () => {
    const out = sessionTrend([{ overallScore: 88 }]);
    expect(out.scores).toEqual([88]);
    expect(out.movavg).toEqual([88]);
    expect(out.slope).toBe(0);
  });

  it('drops sessions without a usable score', () => {
    const sessions = [
      { overallScore: 90 },
      { reps: 3 }, // no score
      { overallScore: 70 },
    ];
    const { scores } = sessionTrend(sessions);
    // newest-first slice -> [90, (skip), 70] -> reversed -> [70, 90]
    expect(scores).toEqual([70, 90]);
  });

  it('defaults n to 7', () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({ overallScore: i }));
    const { scores } = sessionTrend(sessions);
    expect(scores).toHaveLength(7);
  });

  it('handles null input', () => {
    const out = sessionTrend(null);
    expect(out.scores).toEqual([]);
    expect(out.slope).toBe(0);
  });
});
