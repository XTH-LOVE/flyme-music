/**
 * Test environment shims.
 *
 * jsdom implements neither matchMedia nor the Network Information API, but
 * application modules read both at import time (theme resolution, bandwidth
 * gating). Without these, any test that transitively imports such a module fails
 * at collection rather than on an assertion - which is noise, not signal.
 *
 * Each shim only fills a genuine gap: real implementations are left alone.
 */

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
