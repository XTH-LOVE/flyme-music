import { lightColors, darkColors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { radius } from './radius';
import { shadows } from './shadows';
import { motion } from './motion';

/** Single aggregated token export for programmatic access. */
export const tokens = {
  colors: { light: lightColors, dark: darkColors },
  typography,
  spacing,
  radius,
  shadows,
  motion,
} as const;

export type Tokens = typeof tokens;
