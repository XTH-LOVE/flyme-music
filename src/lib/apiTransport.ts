/**
 * Runtime transport selection.
 * Inside a Tauri webview every cross-origin request is routed through the
 * Rust core (no CORS preflight, no browser-side header filtering); in a plain
 * browser the vite dev-server middlewares keep working unchanged.
 *
 * Differences from window.fetch on the Tauri branch (verified against
 * @tauri-apps/plugin-http 2.6.0 JS + tauri-plugin-http v2 Rust):
 * - `input` MUST be an absolute URL: the plugin builds `new Request(input)`,
 *   which throws TypeError on a relative path.
 * - The Rust side DROPS fetch-spec forbidden headers (Referer, Origin,
 *   Cookie, Accept-Encoding, ...) unless tauri-plugin-http is compiled with
 *   the `unsafe-headers` Cargo feature. It also injects its own User-Agent
 *   ("tauri-plugin-http/<ver>") and an Origin matching the webview.
 *   => Task 6 (QQ) / Task 8 (images) depend on a custom Referer, so
 *      src-tauri/Cargo.toml MUST use:
 *      tauri-plugin-http = { version = "2", features = ["unsafe-headers"] }
 * - Cancellation via `init.signal` works (plugin:http|fetch_cancel), but the
 *   plugin rejects with Error('Request cancelled') - or, while the body is
 *   being read, with the bare string 'Request cancelled' - instead of a
 *   DOMException AbortError. The request phase is normalized below; body-read
 *   aborts must still be tolerated by callers.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Lazy cache. Concurrent first calls may both `await import(...)`; the ESM
 * module registry dedupes that, so a cached Promise would buy nothing.
 * Tests must `vi.resetModules()` to clear it.
 */
let tauriFetch: FetchLike | null = null;

/** CORS-free fetch: Tauri -> plugin-http (Rust), browser -> window.fetch. */
export async function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!isTauri()) return fetch(input, init);

  if (!/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    throw new TypeError(
      `httpFetch: the Tauri branch needs an absolute URL, got "${input}" ` +
        '(relative paths such as /api/... only work in the browser branch)',
    );
  }
  if (!tauriFetch) {
    const mod = await import('@tauri-apps/plugin-http');
    tauriFetch = mod.fetch;
  }
  const signal = init?.signal;
  try {
    return await tauriFetch(input, init);
  } catch (error) {
    // Normalize the plugin's Error('Request cancelled') into browser semantics
    // so downstream abort/timeout checks (e.g. isAbort) do not treat a user
    // cancellation as an endpoint failure and put a healthy API in cooldown.
    if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    throw error;
  }
}
