// PhysioAI · Version-2 — Skeleton overlay (react-native-svg).
// Draws the 33 BlazePose landmarks + body connections, colored by score tone.
// Landmarks are normalized (0..1); scaled into width × height.

import React from 'react';
import Svg, { Line, Circle } from 'react-native-svg';
import { skeletonColors } from '../core/theme.js';

// BlazePose body connections (index pairs) — face detail omitted for clarity.
const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],          // shoulders + arms
  [11, 23], [12, 24], [23, 24],                               // torso
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],           // left leg
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],           // right leg
];

// Two coordinate modes:
//  • pixels=true  → `points` are ALREADY in view pixels (mapped by the camera's
//    ViewCoordinator: rotation + front-camera mirror + cover crop handled). Draw as-is.
//  • pixels=false → `landmarks` are normalized [0..1]; stretch onto width×height
//    (demo mode — synthetic pose over a plain background, no camera).
export default function Skeleton({ landmarks, points, pixels = false, width, height, tone = 'good' }) {
  const data = points || landmarks;
  if (!data || !data.length) return null;
  const [stroke, accent] = skeletonColors[tone] || skeletonColors.none;

  const px = pixels ? (lm) => lm.x : (lm) => lm.x * width;
  const py = pixels ? (lm) => lm.y : (lm) => lm.y * height;
  const vis = (i) => (data[i]?.visibility ?? 1) >= 0.5;

  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {CONNECTIONS.map(([a, b], i) =>
        data[a] && data[b] && vis(a) && vis(b) ? (
          <Line key={'l' + i} x1={px(data[a])} y1={py(data[a])} x2={px(data[b])} y2={py(data[b])}
                stroke={stroke} strokeWidth={5} strokeLinecap="round" />
        ) : null,
      )}
      {data.map((lm, i) =>
        i >= 11 && vis(i) ? (
          <Circle key={'c' + i} cx={px(lm)} cy={py(lm)} r={4.5} fill={accent} />
        ) : null,
      )}
    </Svg>
  );
}
