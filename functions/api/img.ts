// Cloudflare Pages Function: GET /api/img?url=<enc>
// Remote-image proxy - bypasses CDN hotlink / referrer blocks (covers).
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
  const blocked = guard(request, context.env, 'img');
  if (blocked) return blocked;
  const target = queryParam(request, 'url');
  if (!isAllowedProxyTarget(target, 'image', (context.env.AURORA_PROXY_HOSTS ?? '').split(','))) {
    return new Response('bad url', { status: 400 });
  }
  try {
    const upstream = await fetch(target, {
      redirect: 'manual',
      headers: {
        'User-Agent': PC_USER_AGENT,
        Referer: new URL(target).origin + '/',
      },
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return new Response('redirects are not supported', { status: 502 });
    }
    if (!upstream.ok || !upstream.body) {
      return new Response('upstream error', { status: upstream.status || 502 });
    }
    const contentType = sanitizeProxyContentType(upstream.headers.get('content-type'), 'image');
    if (contentType === 'application/octet-stream') {
      // Not an image: refuse rather than relay someone else's document from our
      // own origin.
      return new Response('not an image', { status: 415 });
    }
    // Stream the upstream body straight through.
    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        // Immutable per URL, but private: a poisoned shared-cache entry would
        // otherwise outlive the request that created it.
        'Cache-Control': 'private, max-age=2592000, immutable',
      },
    });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
