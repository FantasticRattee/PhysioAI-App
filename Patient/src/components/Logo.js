// PhysioAI · Version-2 — brand logo (mark + optional wordmark).
// Vector port of UI-Mock/shared/logo-mark.svg so it stays crisp at any size.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors } from '../core/theme.js';

// The PhysioAI mark — a rising "growth" stroke anchored by a node.
export function LogoMark({ size = 64, stroke = colors.brand, dot = colors.accent }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M 19 46 L 47 40 L 37 14" stroke={stroke} strokeWidth={11}
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={19} cy={46} r={8} fill={dot} />
    </Svg>
  );
}

// Mark + "PhysioAI" wordmark — stacked (default) or inline.
export default function Logo({ size = 64, wordmark = true, inline = false }) {
  const word = (
    <Text style={[styles.word, { fontSize: size * 0.42 }]}>
      Physio<Text style={{ color: colors.brand }}>AI</Text>
    </Text>
  );
  return (
    <View style={[styles.wrap, inline ? styles.inline : styles.stack]}>
      <LogoMark size={size} />
      {wordmark ? word : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  stack: { flexDirection: 'column', gap: 10 },
  inline: { flexDirection: 'row', gap: 12 },
  word: { fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
});
