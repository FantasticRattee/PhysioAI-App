// PhysioAI · Version-1 — Text-to-speech (on-device).
// Web Speech API is the browser equivalent of Expo Speech: synthesis runs on
// the device, no audio leaves it. Thai uses th-TH; falls back gracefully.

const VOICE_LANG = { th: 'th-TH', en: 'en-US' };

class TTS {
  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.enabled = true;
    this.voices = [];
    this._lastId = null;
    this._lastAt = 0;
    if (this.supported) {
      this._load();
      window.speechSynthesis.onvoiceschanged = () => this._load();
    }
  }
  _load() { try { this.voices = window.speechSynthesis.getVoices() || []; } catch { this.voices = []; } }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) this.cancel();
  }

  _pickVoice(lang) {
    const want = VOICE_LANG[lang] || 'en-US';
    return (
      this.voices.find((v) => v.lang === want) ||
      this.voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang)) ||
      null
    );
  }

  /** Speak immediately, cancelling anything in progress. */
  speakNow(text, lang = 'en') {
    if (!this.supported || !this.enabled || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = VOICE_LANG[lang] || 'en-US';
      const v = this._pickVoice(lang);
      if (v) u.voice = v;
      u.rate = lang === 'th' ? 0.98 : 1.0;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    } catch {}
  }

  /**
   * Debounced cue speech: skips if the same cue id was spoken within `gapMs`,
   * so the voice doesn't stutter while a cue persists across frames.
   */
  say(id, text, lang = 'en', gapMs = 2600) {
    const now = performance.now();
    if (id === this._lastId && now - this._lastAt < gapMs) return;
    if (window.speechSynthesis && window.speechSynthesis.speaking && id === this._lastId) return;
    this._lastId = id;
    this._lastAt = now;
    this.speakNow(text, lang);
  }

  cancel() { try { window.speechSynthesis?.cancel(); } catch {} this._lastId = null; }
}

export const tts = new TTS();
