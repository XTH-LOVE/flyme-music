// Cloudflare Pages Function: GET /api/update/mirror?version=<tag>&filename=<name>
//
// Redirects to the R2 copy of a release asset. The copy is uploaded by the
// Android release workflow, so this function never fetches the APK itself:
// the edge answers with a redirect and the bytes come from R2.
//
// A release that has not been mirrored yet falls through to the GitHub relay.
// That path is slow, but it is reachable, which matters more than failing a
// download outright while the first mirror is still being filled.

import { guard, queryParam, type Env, type PagesContext } from '../_shared';

function safeName(raw: string | null): string | null {
  const name = (raw ?? '').split(/[/\\]/).pop() ?? '';
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(name) || !name.toLowerCase().endsWith('.apk')) return null;
  return name;
}

function safeVersion(raw: string | null): string | null {
  if (!raw || !/^v?[A-Za-z0-9._-]{1,40}$/.test(raw)) return null;
  return raw;
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const blocked = guard(request, context.env as Env, 'update', { allowNavigation: true });
  if (blocked) return blocked;

  const version = safeVersion(queryParam(request, 'version'));
  const filename = safeName(queryParam(request, 'filename'));
  const mirror = context.env.RELEASE_MIRROR?.replace(/\/+$/, '');
  if (!version || !filename) return new Response('bad release', { status: 400 });

  const relay =
    new URL(request.url).origin +
    '/api/update/download?version=' +
    encodeURIComponent(version) +
    '&filename=' +
    encodeURIComponent(filename);

  if (!mirror) return Response.redirect(relay, 302);

  const target = mirror + '/releases/' + encodeURIComponent(version) + '/' + encodeURIComponent(filename);
  try {
    // A one-byte probe rather than HEAD: a public bucket can reject HEAD while
    // still serving the object, and a miss must fall through to the relay.
    const probe = await fetch(target, { headers: { Range: 'bytes=0-0' } });
    if (!probe.ok && probe.status !== 206) return Response.redirect(relay, 302);
  } catch {
    return Response.redirect(relay, 302);
  }
  return Response.redirect(target, 302);
}
