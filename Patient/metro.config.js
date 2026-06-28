// PhysioAI · Patient — Metro config.
//
// react-native-mediapipe@0.5.1 declares its `react-native`/`source` entry as raw
// 0.73-era TypeScript, which Metro (SDK 54) tries to transpile against a Babel
// plugin that no longer exists (@babel/plugin-proposal-optional-chaining). The
// package also ships precompiled plain JS under lib/commonjs, so we redirect the
// bare import there — no TS transpile needed. Works both in Expo Go (native side
// absent → app falls back to the synthetic demo) and in a dev build (native present).

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const MEDIAPIPE_CJS = path.resolve(
  __dirname,
  'node_modules/react-native-mediapipe/lib/commonjs/index.js'
);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-mediapipe') {
    return { type: 'sourceFile', filePath: MEDIAPIPE_CJS };
  }
  return (defaultResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
