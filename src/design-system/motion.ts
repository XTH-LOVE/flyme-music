/** Unified motion tokens. */
export const motion = {
  durations: {
    micro: 120,
    normal: 200,
    page: 280,
    sheet: 350,
  },
  easings: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
    spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
  },
} as const;
