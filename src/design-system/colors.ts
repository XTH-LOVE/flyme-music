/**
 * Aurora Music color system.
 * Values mirror the CSS custom properties defined in styles/global.css.
 */
export const lightColors = {
  background: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0F0F2',
  textPrimary: '#111111',
  textSecondary: '#777777',
  textTertiary: '#A8A8AD',
  accent: '#3D7BFF',
  accentSoft: 'rgba(61, 123, 255, 0.12)',
  danger: '#FF4D4F',
  divider: 'rgba(17, 17, 17, 0.06)',
  scrim: 'rgba(16, 16, 18, 0.45)',
  glass: 'rgba(255, 255, 255, 0.66)',
  glassBorder: 'rgba(255, 255, 255, 0.55)',
} as const;

export const darkColors = {
  background: '#101012',
  surface: '#18181B',
  surfaceSecondary: '#222225',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A5',
  textTertiary: '#6E6E74',
  accent: '#5B8CFF',
  accentSoft: 'rgba(91, 140, 255, 0.16)',
  danger: '#FF6B6B',
  divider: 'rgba(255, 255, 255, 0.08)',
  scrim: 'rgba(0, 0, 0, 0.55)',
  glass: 'rgba(24, 24, 27, 0.66)',
  glassBorder: 'rgba(255, 255, 255, 0.09)',
} as const;

export type ColorScheme = typeof lightColors;
