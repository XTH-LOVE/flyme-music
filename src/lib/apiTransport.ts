/**
 * Runtime transport selection.
 * Inside a Tauri webview every cross-origin request is routed through the
 * Rust core (no CORS, custom headers allowed); in a plain browser the vite
 * dev-server middlewares keep working unchanged.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let tauriFetch: FetchLike | null = null;

/** CORS-free fetch: Tauri -> plugin-http (Rust), browser -> window.fetch. */
export async function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    if (!tauriFetch) {
      const mod = await import('@tauri-apps/plugin-http');
      tauriFetch = mod.fetch as unknown as FetchLike;
    }
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}
