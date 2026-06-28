// PhysioAI · Version-2 — circular score ring (react-native-svg).

import React from 'react';
import Svg, { Circle, G } from 'react-native-svg';
import { View, Text } from 'react-native';
import { colors } from '../core/theme.js';

export default function ScoreRing({ value, size = 64, thickness = 6, color = colors.brand, label }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value / 100));
  const shown = label != null ? label : (value == null ? '—' : String(value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={thickness} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={thickness} fill="none"
                  strokeDasharray={`${c}`} strokeDashoffset={c * (1 - frac)} strokeLinecap="round" />
        </G>
      </Svg>
      <Text style={{ position: 'absolute', fontWeight: '700', fontSize: size * 0.3, color: colors.ink }}>{shown}</Text>
    </View>
  );
}
