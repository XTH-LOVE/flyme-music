// Cloudflare Pages Function: GET /api/media-proxy?url=<enc>
// Streams remote media so downloads bypass CORS.
import { PC_USER_AGENT, isHttpUrl, queryParam, guard, type PagesContext } from './_shared';

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const blocked = guard(request, context.env, 'media-proxy');
  if (blocked) return blocked;
  const target = queryParam(request, 'url');
  if (!isHttpUrl(target)) {
    return new Response('bad url', { status: 400 });
  }
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': PC_USER_AGENT,
        Referer: new URL(target).origin + '/',
      },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response('upstream error', { status: upstream.status || 502 });
    }
    const headers: Record<string, string> = {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    };
    const len = upstream.headers.get('content-length');
    if (len) headers['Content-Length'] = len;
    return new Response(upstream.body, { headers });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
