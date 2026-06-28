// PhysioAI · Version-2 — Live pose camera (react-native-mediapipe / BlazePose).
//
// Renders the on-device MediaPipe Pose Landmarker camera and forwards each frame
// as 33 normalized landmarks { x, y, z, visibility } (the SAME schema as V1) to
// `onLandmarks`. That feeds the unchanged AI pipeline (angle calc → comparator →
// form scorer). No video leaves the device.
//
// ⚠️ NATIVE MODULE — requires an Expo *dev build* (won't run in Expo Go) and the
// MediaPipe model asset bundled (see README). The exact react-native-mediapipe
// API is version-specific; this targets ~0.5.x. If your installed version differs,
// adjust the two clearly-marked spots: (1) the hook/usePoseDetection call and
// (2) normalizeResults() — keep the normalized output shape identical.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../core/theme.js';

// Defensive load so demo mode still runs even if the native module isn't linked.
let MP = null;
try { MP = require('react-native-mediapipe'); } catch (e) { MP = null; }

// MediaPipe Pose returns 33 landmarks already in BlazePose order → pass through,
// guaranteeing x/y/z/visibility fields. Adjust here if your version nests differently.
function normalizeResults(result) {
  // react-native-mediapipe 0.5.x bundle: { results: [{ landmarks: Landmark[][] }], ... }.
  // results[0].landmarks[0] = the first pose's 33 landmarks (normalized 0..1, BlazePose order).
  const first = result?.results?.[0]?.landmarks?.[0];
  if (!Array.isArray(first)) return null;
  return first.map((p) => ({
    x: p.x, y: p.y, z: p.z ?? 0,
    visibility: p.visibility ?? p.presence ?? 1,
  }));
}

export default function PoseCamera({ onLandmarks, style }) {
  if (!MP || !MP.usePoseDetection || !MP.MediapipeCamera) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={styles.fallbackText}>
          Live camera needs a dev build with react-native-mediapipe.{'\n'}
          Use Demo mode, or see README → "Enable live pose".
        </Text>
      </View>
    );
  }

  // react-native-mediapipe 0.5.x: usePoseDetection(callbacks, runningMode, model, options).
  // RunningMode + Delegate are ENUMS (not strings); model is the .task filename that must be
  // bundled into the native app (iOS: app bundle resource · Android: android/app/src/main/assets).
  const solution = MP.usePoseDetection(
    {
      onResults: (result, vc) => {
        const lm = normalizeResults(result);
        if (!lm) return;
        // Map landmarks to VIEW pixels using the SDK's ViewCoordinator. It applies the
        // frame rotation (camera buffer is in sensor orientation!) + front-camera mirror
        // + cover crop — i.e. the SAME transform as the preview. Raw normalized coords
        // are in the rotated buffer space and will NOT line up if drawn directly.
        let viewPts = null;
        try {
          if (vc && vc.convertPoint) {
            const fd = vc.getFrameDims ? vc.getFrameDims(result) : { width: result?.inputImageWidth || 0, height: result?.inputImageHeight || 0 };
            viewPts = lm.map((p) => { const v = vc.convertPoint(fd, p); return { x: v.x, y: v.y, visibility: p.visibility }; });
          }
        } catch (e) { viewPts = null; }
        onLandmarks(lm, viewPts);
      },
      onError: () => {},
    },
    MP.RunningMode?.LIVE_STREAM ?? 2,
    'pose_landmarker_lite.task',
    { numPoses: 1, minPoseDetectionConfidence: 0.5, minTrackingConfidence: 0.5, delegate: MP.Delegate?.GPU ?? 1 },
  );

  return <MP.MediapipeCamera style={[styles.camera, style]} solution={solution} activeCamera="front" resizeMode="cover" />;
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surface3 },
  fallbackText: { color: colors.ink2, textAlign: 'center', fontSize: 14, lineHeight: 21 },
});
