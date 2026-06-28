// PhysioAI · Version-2 — design tokens (ported from V1 theme.css).
export const colors = {
  bg: '#F5F1E8', surface: '#FFFFFF', surface2: '#FAF7F0', surface3: '#EFE9DD',
  line: '#E5DFD3',
  ink: '#1F2937', ink2: '#6B7280', ink3: '#9CA3AF', inverse: '#FBFAF5',
  brand: '#2F5D50', brandSoft: '#E3ECE7', accent: '#7BA88F',
  good: '#2F5D50', warn: '#9C7344', bad: '#8C4F40',
};

export const scoreTone = (score) =>
  score == null ? 'none' : score >= 75 ? 'good' : score >= 50 ? 'warn' : 'bad';

export const toneColor = (tone) =>
  ({ good: colors.good, warn: colors.warn, bad: colors.bad, none: colors.ink3 }[tone] || colors.ink3);

// Skeleton stroke / joint colors per tone (matches V1 runner).
export const skeletonColors = {
  good: ['#2F5D50', '#7BA88F'],
  warn: ['#9C7344', '#C8955A'],
  bad: ['#8C4F40', '#B86C5A'],
  none: ['#8A8275', '#8A8275'],
};
