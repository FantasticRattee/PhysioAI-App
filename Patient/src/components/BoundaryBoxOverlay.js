// PhysioAI · Boundary box overlay.

import React from 'react';
import Svg, { Rect } from 'react-native-svg';
import { getBoundaryBox } from '../ai/BoundaryBoxGate.js';
import { colors } from '../core/theme.js';

const STATUS_COLOR = {
  inside: colors.good,
  outside: colors.bad,
};

export default function BoundaryBoxOverlay({ boundary, width, height }) {
  if (!width || !height) return null;
  const box = boundary?.box || getBoundaryBox(width, height);
  const status = boundary?.status || 'outside';
  const stroke = STATUS_COLOR[status] || colors.bad;

  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Rect
        x={box.left}
        y={box.top}
        width={box.width}
        height={box.height}
        rx={12}
        ry={12}
        fill="none"
        stroke={stroke}
        strokeWidth={4}
        opacity={0.95}
      />
      <Rect
        x={box.left + 3}
        y={box.top + 3}
        width={Math.max(0, box.width - 6)}
        height={Math.max(0, box.height - 6)}
        rx={9}
        ry={9}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={1}
        opacity={0.7}
      />
    </Svg>
  );
}
