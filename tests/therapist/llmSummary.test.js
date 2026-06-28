// Tests for Therapist/shared/ai/LlmSummary.js
//
// LlmSummary imports JointAngleCalculator, which transitively imports
// PoseDetection.js (MediaPipe/browser-only). Mock it before importing.
jest.mock('../../Therapist/shared/ai/PoseDetection.js', () => {
  const LANDMARK_NAMES = ['nose', 'left_eye_inner', 'left_eye', 'left_eye_outer', 'right_eye_inner', 'right_eye', 'right_eye_outer', 'left_ear', 'right_ear', 'mouth_left', 'mouth_right', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky', 'left_index', 'right_index', 'left_thumb', 'right_thumb', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index'];
  return { LANDMARK_NAMES, idx: (n) => LANDMARK_NAMES.indexOf(n) };
});

import { LLM_CONFIG, isConfigured, buildSummaryPrompt, summarize } from '../../Therapist/shared/ai/LlmSummary.js';

const PATIENT = { name: 'Somchai Jaidee', email: 'somchai@example.com', adherence: 82 };

// Newest-first session logs (matches store.js getSessions ordering).
const SESSIONS = [
  { avgScore: 90, reps: 12, avgDeltas: { left_knee: 8, left_elbow: 3 } },
  { avgScore: 80, reps: 10, avgDeltas: { left_knee: 14, left_elbow: 2 } },
  { avgScore: 70, reps: 8, avgDeltas: { left_knee: 20, left_elbow: 4 } },
];

describe('LlmSummary · LLM_CONFIG / isConfigured', () => {
  // Ensure config is back to the shipped-blank state around every test, since
  // LLM_CONFIG is a shared mutable object.
  const snapshot = { ...LLM_CONFIG };
  afterEach(() => {
    LLM_CONFIG.endpoint = snapshot.endpoint;
    LLM_CONFIG.apiKey = snapshot.apiKey;
    LLM_CONFIG.model = snapshot.model;
    LLM_CONFIG.maxTokens = snapshot.maxTokens;
  });

  it('ships blank by default', () => {
    expect(LLM_CONFIG.endpoint).toBe('');
    expect(LLM_CONFIG.apiKey).toBe('');
    expect(LLM_CONFIG.model).toBe('');
    expect(LLM_CONFIG.maxTokens).toBe(400);
  });

  it('isConfigured() is false in the shipped-blank state', () => {
    expect(isConfigured()).toBe(false);
  });

  it('isConfigured() stays false unless endpoint, apiKey AND model are all set', () => {
    LLM_CONFIG.endpoint = 'https://api.example.com/v1/messages';
    expect(isConfigured()).toBe(false);
    LLM_CONFIG.apiKey = 'sk-test';
    expect(isConfigured()).toBe(false);
    LLM_CONFIG.model = 'claude-test';
    expect(isConfigured()).toBe(true);
  });

  it('isConfigured() is false when any single field is empty', () => {
    LLM_CONFIG.endpoint = 'https://api.example.com';
    LLM_CONFIG.apiKey = 'sk-test';
    LLM_CONFIG.model = '';
    expect(isConfigured()).toBe(false);
  });
});

describe('LlmSummary · buildSummaryPrompt (de-identification)', () => {
  it('returns a string', () => {
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS, 'en');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('does NOT leak the patient name or email (PII)', () => {
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS, 'en');
    expect(prompt).not.toContain('Somchai');
    expect(prompt).not.toContain('Jaidee');
    expect(prompt).not.toContain('somchai@example.com');
    expect(prompt).not.toContain('@example.com');
  });

  it('uses a generic anonymous patient id', () => {
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS, 'en');
    expect(prompt).toContain('patient_id: anonymous');
  });

  it('includes aggregate stats: session count, total reps, avg accuracy', () => {
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS, 'en');
    expect(prompt).toContain('sessions_logged: 3');
    expect(prompt).toContain('total_reps: 30'); // 12 + 10 + 8
    // avg of 90, 80, 70 = 80
    expect(prompt).toContain('avg_form_accuracy_pct: 80');
  });

  it('computes the score trend (newest - oldest) with a sign', () => {
    // newest=90, oldest=70 -> +20
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS, 'en');
    expect(prompt).toContain('score_trend_pct: +20');
  });

  it('renders a negative trend with a minus sign and no plus', () => {
    // newest-first: newest=60, oldest=90 -> -30
    const declining = [
      { avgScore: 60, reps: 5, avgDeltas: { left_knee: 5 } },
      { avgScore: 90, reps: 5, avgDeltas: { left_knee: 5 } },
    ];
    const prompt = buildSummaryPrompt(PATIENT, declining, 'en');
    expect(prompt).toContain('score_trend_pct: -30');
  });

  it('includes the worst joint with its human label (en)', () => {
    // left_knee avg delta = (8+14+20)/3 ~= 14, far worse than left_elbow.
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS, 'en');
    expect(prompt).toContain('worst_joint: L. knee');
    expect(prompt).toContain('off target');
  });

  it('includes adherence from the patient object', () => {
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS, 'en');
    expect(prompt).toContain('adherence_pct: 82');
  });

  it('emits the English clinician instruction for lang="en"', () => {
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS, 'en');
    expect(prompt).toContain('You are a physiotherapist');
    expect(prompt).toContain('in English');
  });

  it('emits Thai instruction text and Thai joint label for lang="th"', () => {
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS, 'th');
    expect(prompt).toContain('นักกายภาพบำบัด'); // physiotherapist (th)
    expect(prompt).toContain('เข่าซ้าย');        // L. knee (th)
    // Still de-identified.
    expect(prompt).not.toContain('Somchai');
    expect(prompt).not.toContain('somchai@example.com');
  });

  it('defaults lang to English when omitted', () => {
    const prompt = buildSummaryPrompt(PATIENT, SESSIONS);
    expect(prompt).toContain('in English');
  });

  it('handles empty sessions gracefully (n/a aggregates, no crash)', () => {
    const prompt = buildSummaryPrompt(PATIENT, [], 'en');
    expect(prompt).toContain('sessions_logged: 0');
    expect(prompt).toContain('total_reps: 0');
    expect(prompt).toContain('avg_form_accuracy_pct: n/a');
    expect(prompt).toContain('score_trend_pct: n/a');
    expect(prompt).toContain('worst_joint: n/a');
  });

  it('handles null sessions gracefully', () => {
    const prompt = buildSummaryPrompt(PATIENT, null, 'en');
    expect(prompt).toContain('sessions_logged: 0');
    expect(prompt).toContain('total_reps: 0');
  });

  it('renders adherence n/a when patient is null', () => {
    const prompt = buildSummaryPrompt(null, SESSIONS, 'en');
    expect(prompt).toContain('adherence_pct: n/a');
  });
});

describe('LlmSummary · summarize', () => {
  const snapshot = { ...LLM_CONFIG };
  afterEach(() => {
    LLM_CONFIG.endpoint = snapshot.endpoint;
    LLM_CONFIG.apiKey = snapshot.apiKey;
    LLM_CONFIG.model = snapshot.model;
    LLM_CONFIG.maxTokens = snapshot.maxTokens;
    jest.restoreAllMocks();
    delete global.fetch;
  });

  it('returns null WITHOUT calling fetch when not configured', async () => {
    global.fetch = jest.fn();
    const result = await summarize('any prompt');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns the generated text on a successful Anthropic-shaped response', async () => {
    LLM_CONFIG.endpoint = 'https://api.example.com/v1/messages';
    LLM_CONFIG.apiKey = 'sk-test';
    LLM_CONFIG.model = 'claude-test';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: '  Patient progressing well.  ' }] }),
    }));

    const result = await summarize('prompt text');
    expect(result).toBe('Patient progressing well.'); // trimmed
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends an Anthropic Messages-shaped request to the configured endpoint', async () => {
    LLM_CONFIG.endpoint = 'https://api.example.com/v1/messages';
    LLM_CONFIG.apiKey = 'sk-secret';
    LLM_CONFIG.model = 'claude-test';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    }));

    await summarize('the prompt');

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/messages');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-api-key']).toBe('sk-secret');
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');
    expect(opts.headers['content-type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('claude-test');
    expect(body.max_tokens).toBe(400);
    expect(body.messages).toEqual([{ role: 'user', content: 'the prompt' }]);
  });

  it('forwards an AbortSignal to fetch', async () => {
    LLM_CONFIG.endpoint = 'https://api.example.com/v1/messages';
    LLM_CONFIG.apiKey = 'sk-test';
    LLM_CONFIG.model = 'claude-test';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    }));
    const controller = new AbortController();
    await summarize('p', { signal: controller.signal });
    expect(global.fetch.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('returns null on a non-ok HTTP response', async () => {
    LLM_CONFIG.endpoint = 'https://api.example.com/v1/messages';
    LLM_CONFIG.apiKey = 'sk-test';
    LLM_CONFIG.model = 'claude-test';
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const result = await summarize('p');
    expect(result).toBeNull();
  });

  it('returns null when fetch rejects (network/abort error)', async () => {
    LLM_CONFIG.endpoint = 'https://api.example.com/v1/messages';
    LLM_CONFIG.apiKey = 'sk-test';
    LLM_CONFIG.model = 'claude-test';
    global.fetch = jest.fn(async () => { throw new Error('network down'); });
    const result = await summarize('p');
    expect(result).toBeNull();
  });

  it('returns null when the response has no text content', async () => {
    LLM_CONFIG.endpoint = 'https://api.example.com/v1/messages';
    LLM_CONFIG.apiKey = 'sk-test';
    LLM_CONFIG.model = 'claude-test';
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ content: [] }) }));
    const result = await summarize('p');
    expect(result).toBeNull();
  });

  it('returns null when text is whitespace-only', async () => {
    LLM_CONFIG.endpoint = 'https://api.example.com/v1/messages';
    LLM_CONFIG.apiKey = 'sk-test';
    LLM_CONFIG.model = 'claude-test';
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: '   ' }] }),
    }));
    const result = await summarize('p');
    expect(result).toBeNull();
  });
});
