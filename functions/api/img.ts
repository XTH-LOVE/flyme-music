// Cloudflare Pages Function: GET /api/img?url=<enc>
// Remote-image proxy - bypasses CDN hotlink / referrer blocks (covers).
import { PC_USER_AGENT, isHttpUrl, queryParam, type PagesContext } from './_shared';

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
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
    // Stream the upstream body straight through.
    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=2592000, immutable',
      },
    });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
