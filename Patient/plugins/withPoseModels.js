// Expo config plugin — bundle the MediaPipe `.task` pose model(s) into the NATIVE app
// so react-native-mediapipe can load them by filename at runtime:
//   • iOS     → added to "Copy Bundle Resources" (flattened into the .app bundle)
//   • Android → copied into app/src/main/assets/
//
// We can't use the built-in `expo-asset` plugin because it whitelists asset
// extensions and rejects `.task`. This mirrors exactly what that plugin does for
// non-image/font files, minus the whitelist. Runs on every `expo prebuild`, so the
// model survives a native regen (no manual Xcode drag needed).
const { withXcodeProject, withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Relative to the app root (where app.json lives). Android asset basenames must be
// lowercase a-z/0-9/underscore — these already comply.
const MODELS = [
  'assets/models/pose_landmarker_lite.task',
  'assets/models/pose_landmarker_full.task',
];

const withIosPoseModels = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const { projectRoot, platformProjectRoot } = cfg.modRequest;
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, 'Resources');
    for (const rel of MODELS) {
      const abs = path.join(projectRoot, rel);
      if (!fs.existsSync(abs)) continue;
      // Reference the file by a path relative to the iOS project (no copy needed —
      // Xcode flattens bundle resources by basename).
      const filepath = path.relative(platformProjectRoot, abs);
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath,
        groupName: 'Resources',
        project,
        isBuildFile: true,
        verbose: false,
      });
    }
    return cfg;
  });

const withAndroidPoseModels = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const assetsDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      for (const rel of MODELS) {
        const abs = path.join(projectRoot, rel);
        if (fs.existsSync(abs)) fs.copyFileSync(abs, path.join(assetsDir, path.basename(abs)));
      }
      return cfg;
    },
  ]);

module.exports = (config) => withAndroidPoseModels(withIosPoseModels(config));
