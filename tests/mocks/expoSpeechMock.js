// No-op stand-in for expo-speech (namespace import `import * as Speech`).
// tts.js is RN/native-only and is verified manually; this keeps imports loadable.
module.exports = {
  speak: () => {},
  stop: () => {},
  pause: () => {},
  resume: () => {},
  getAvailableVoicesAsync: () => Promise.resolve([]),
  isSpeakingAsync: () => Promise.resolve(false),
};
