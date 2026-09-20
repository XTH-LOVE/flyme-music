/** Type scale - inspired by HyperOS MiSans proportions. */
export const typography = {
  fontFamily:
    "'MiSans', 'HarmonyOS Sans', 'PingFang SC', 'Segoe UI', system-ui, -apple-system, sans-serif",
  sizes: {
    display: 28,
    title1: 24,
    title2: 20,
    title3: 17,
    body: 15,
    bodySmall: 13,
    caption: 12,
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.45,
    relaxed: 1.6,
  },
} as const;
