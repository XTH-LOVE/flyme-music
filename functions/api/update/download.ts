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
  const blocked = guard(request, context.env as Env, 'update');
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

  try {
    const upstream = await fetch(target, { headers, redirect: 'follow' });
    if (!upstream.ok || !upstream.body) {
      return new Response('download failed', { status: upstream.status || 502 });
    }

    const filename = safeFilename(queryParam(request, 'filename'));

    // Stream rather than buffer: an APK is tens of megabytes and the Workers
    // runtime has a 128 MB memory limit per request. Relaying the body is what
    // keeps this inside it regardless of how large the release grows.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        // `filename*` with UTF-8 is the modern form; the ASCII `filename` is the
        // fallback for older clients. `safeFilename` has already reduced the
        // name to ASCII, so both say the same thing.
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Content-Length': upstream.headers.get('content-length') ?? '',
        'X-Content-Type-Options': 'nosniff',
        // Long-lived: a release asset at a given URL never changes.
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return new Response('download error: ' + String(error).slice(0, 200), { status: 502 });
  }
}
