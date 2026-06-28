// PhysioAI · Version-2 — Thai TTS Engine (expo-speech, on-device).
// Replaces V1's Web Speech wrapper. Thai (th-TH) availability depends on the
// device's installed voices; falls back to the platform default otherwise.
//
// On init it queries the device's installed voices and locks onto a real Thai
// voice (ported from V1's Web-Speech `_pickVoice`) so th-TH is reliable even when
// it isn't the platform default. Voice selection is best-effort + fully optional —
// if it fails or no Thai voice exists, speak() still works via the language code.

import * as Speech from 'expo-speech';

const VOICE_LANG = { th: 'th-TH', en: 'en-US' };

class TTS {
  constructor() {
    this.enabled = true;
    this._lastId = null;
    this._lastAt = 0;
    this._voice = {}; // { th: <identifier>, en: <identifier> } — filled async
    this._loadVoices();
  }

  // Pick the best installed voice per language: exact (th-TH) → any 'th*' → none.
  async _loadVoices() {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      if (!Array.isArray(voices)) return;
      for (const [key, want] of Object.entries(VOICE_LANG)) {
        const exact = voices.find((v) => v.language === want);
        const loose = voices.find((v) => (v.language || '').toLowerCase().startsWith(key));
        const v = exact || loose;
        if (v) this._voice[key] = v.identifier;
      }
    } catch {}
  }

  setEnabled(v) { this.enabled = !!v; if (!v) this.cancel(); }

  cancel() { try { Speech.stop(); } catch {} }

  speakNow(text, lang = 'th') {
    if (!this.enabled || !text) return;
    try {
      Speech.stop();
      const opts = { language: VOICE_LANG[lang] || 'en-US', rate: lang === 'th' ? 0.98 : 1.0 };
      if (this._voice[lang]) opts.voice = this._voice[lang]; // lock onto the picked Thai voice
      Speech.speak(String(text), opts);
    } catch {}
  }

  // Debounced per-id so the same cue isn't repeated within `minGap` ms.
  say(id, text, lang = 'th', minGap = 1500) {
    if (!this.enabled || !text) return;
    const now = Date.now();
    if (this._lastId === id && now - this._lastAt < minGap) return;
    this._lastId = id; this._lastAt = now;
    this.speakNow(text, lang);
  }
}

export const tts = new TTS();
