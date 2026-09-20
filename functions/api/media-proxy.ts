// Cloudflare Pages Function: GET /api/media-proxy?url=<enc>
// Streams remote media so downloads bypass CORS and the player gets a
// same-origin source for the rhythm spectrum. Range requests are forwarded
// (206 + Content-Range) so <audio> can buffer and seek in chunks instead of
// downloading the whole file in one go.
import {
  PC_USER_AGENT,
  isAllowedProxyTarget,
  sanitizeProxyContentType,
  queryParam,
  guard,
  type PagesContext,
} from './_shared';

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const blocked = guard(request, context.env, 'media-proxy');
  if (blocked) return blocked;
  const target = queryParam(request, 'url');
  if (!isAllowedProxyTarget(target)) {
    return new Response('bad url', { status: 400 });
  }
  const range = request.headers.get('range');
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': PC_USER_AGENT,
        Referer: new URL(target).origin + '/',
        ...(range ? { Range: range } : {}),
      },
    });
    if (!upstream.ok && upstream.status !== 206) {
      return new Response('upstream error', { status: upstream.status || 502 });
    }
    const headers: Record<string, string> = {
      'Content-Type': sanitizeProxyContentType(upstream.headers.get('content-type'), 'media'),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
    };
    const len = upstream.headers.get('content-length');
    if (len) headers['Content-Length'] = len;
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) headers['Content-Range'] = contentRange;
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
