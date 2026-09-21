// Cloudflare Pages Function: GET /api/update/download?url=<enc>&filename=<name>
//
// Relays an APK from GitHub Releases. This is not a convenience - it is the
// difference between an update that installs and one that never arrives:
// `objects.githubusercontent.com` is frequently unreachable from mainland
// China, so a client told to download from GitHub directly simply hangs.
//
// It is also an open relay unless it is fenced, so the target is restricted to
// GitHub's own hosts and nothing else.

import { guard, queryParam, type Env, type PagesContext } from '../_shared';

/** Hosts a release asset can legitimately be served from. */
const ALLOWED_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];

function isAllowedAssetUrl(raw: string | null): boolean {
  if (!raw) return false;
  let host: string;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    host = url.hostname.toLowerCase();
  } catch {
    return false;
  }
  // `endsWith` on the whole host would accept `evilgithub.com`, so the match is
  // on the host itself or a subdomain of it.
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith('.' + allowed));
}

/**
 * A filename safe to put in `Content-Disposition`.
 *
 * The header is built from a query parameter, so without this an attacker could
 * inject CRLF and forge headers, or use a quote to break out of the value.
 * Everything outside a conservative set is replaced rather than escaped - a
 * mangled filename is a cosmetic problem, a header injection is not.
 */
function safeFilename(raw: string | null): string {
  const base = (raw ?? 'flyme-music.apk').split(/[/\\]/).pop() ?? 'flyme-music.apk';
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  return cleaned.toLowerCase().endsWith('.apk') ? cleaned : cleaned + '.apk';
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  // Navigation allowed: this URL is opened by the browser, not fetched, and a
  // navigation sends no Origin - which the check used to read as an attacker
  // and reject with "origin not allowed". The target allowlist below is what
  // actually keeps this from being an open relay.
  const blocked = guard(request, context.env as Env, 'update', { allowNavigation: true });
  if (blocked) return blocked;

  const target = queryParam(request, 'url');
  if (!target) return new Response('missing url', { status: 400 });
  if (!isAllowedAssetUrl(target)) {
    // Not a 404: a caller that got here with a foreign URL is either a bug or
    // an attempt, and both deserve to be told no explicitly.
    return new Response('source not allowed', { status: 403 });
  }

  const headers: Record<string, string> = { 'User-Agent': 'Flyme-Music-App' };
  if (context.env.GITHUB_TOKEN) {
    headers.Authorization = 'Bearer ' + context.env.GITHUB_TOKEN;
  }

  // Range is forwarded, and the upstream status is passed through with it.
  //
  // Without this every request returned the whole file from byte zero. A
  // browser that asks to resume an interrupted 75 MB download - which on a
  // domestic connection is the normal case, not the exception - would have
  // been handed the entire thing again instead of the remainder, and a player
  // seeking inside a partially downloaded file could not be served at all.
  const range = request.headers.get('Range');
  if (range) headers.Range = range;

  try {
    const upstream = await fetch(target, { headers, redirect: 'follow' });
    if (!upstream.ok || !upstream.body) {
      return new Response('download failed', { status: upstream.status || 502 });
    }

    const filename = safeFilename(queryParam(request, 'filename'));

    // Stream rather than buffer: an APK is tens of megabytes and the Workers
    // runtime has a 128 MB memory limit per request. Relaying the body is what
    // keeps this inside it regardless of how large the release grows.
    const outHeaders = new Headers({
      'Content-Type': 'application/vnd.android.package-archive',
      // `filename*` with UTF-8 is the modern form; the ASCII `filename` is the
      // fallback for older clients. `safeFilename` has already reduced the name
      // to ASCII, so both say the same thing.
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'X-Content-Type-Options': 'nosniff',
      // Long-lived: a release asset at a given URL never changes.
      'Cache-Control': 'public, max-age=3600',
      // So a client knows the range it asked for was understood.
      'Accept-Ranges': 'bytes',
    });

    // Only set when upstream actually supplied it. An empty Content-Length is
    // not "unknown", it is malformed, and clients disagree about what to do
    // with it - some treat the response as zero-length.
    const length = upstream.headers.get('content-length');
    if (length) outHeaders.set('Content-Length', length);

    // 206 must survive, or a client that asked for a range is told it got the
    // whole file and reads the first chunk as if it were the start.
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) outHeaders.set('Content-Range', contentRange);

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers: outHeaders,
    });
  } catch (error) {
    return new Response('download error: ' + String(error).slice(0, 200), { status: 502 });
  }
}
