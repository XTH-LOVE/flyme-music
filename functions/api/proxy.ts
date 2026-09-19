// Cloudflare Pages Function: GET /api/proxy?url=<enc>&referer=<enc>
// Generic forwarder with a caller-supplied Referer (QQ Music endpoints).
import {
  PC_USER_AGENT,
  isAllowedProxyTarget,
  sanitizeProxyContentType,
  queryParam,
  errorJson,
  guard,
  type PagesContext,
} from './_shared';

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const blocked = guard(request, context.env, 'proxy');
  if (blocked) return blocked;
  const target = queryParam(request, 'url');
  const referer = queryParam(request, 'referer') ?? '';
  if (!isAllowedProxyTarget(target)) {
    return new Response('bad url', { status: 400 });
  }
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': PC_USER_AGENT,
        ...(referer ? { Referer: referer } : {}),
      },
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        // HTML-ish upstream types are downgraded: the Hi歌 scraper needs the
        // markup, but the browser must not treat it as a document on our origin.
        'Content-Type': sanitizeProxyContentType(upstream.headers.get('content-type'), 'text'),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorJson(e);
  }
}
