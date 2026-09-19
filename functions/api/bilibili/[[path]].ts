// Cloudflare Pages Function: GET /api/bilibili?path=<api path>&<params>
//
// Relay for Bilibili's API, which needs a `buvid3` cookie that only the site
// issues and sends no CORS headers. Path-whitelisted; see src/lib/bilibiliServer.ts.
import { guard, json, type PagesContext } from '../_shared';
import { ALLOWED_PATHS, bilibiliUpstream } from '../../../src/lib/bilibiliServer';

const UPSTREAM_TIMEOUT_MS = 10_000;

export async function onRequest(context: PagesContext): Promise<Response> {
  const blocked = guard(context.request, context.env, 'weapi');
  if (blocked) return blocked;

  const incoming = new URL(context.request.url);
  const path = incoming.searchParams.get('path') ?? '';
  if (!ALLOWED_PATHS.has(path)) {
    return json({ error: 'path not allowed' }, 400);
  }

  // Forward every parameter except our own routing key.
  const params = new URLSearchParams(incoming.searchParams);
  params.delete('path');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await bilibiliUpstream(path, params, controller.signal);
    if (!upstream) {
      // Either no cookie could be obtained or the call failed; both mean the
      // source is unavailable right now, not that the request was wrong.
      return json({ error: 'bilibili unavailable' }, 503);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
