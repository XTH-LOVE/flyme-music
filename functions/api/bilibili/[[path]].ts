// Cloudflare Pages Function: GET /api/bilibili?path=<api path>&<params>
//
// Relay for Bilibili's API, which needs a `buvid3` cookie that only the site
// issues and sends no CORS headers. Path-whitelisted; see src/lib/bilibiliServer.ts.
import { guard, json, type PagesContext } from '../_shared';
import { ALLOWED_PATHS, bilibiliUpstream, isUpstreamFailure } from '../../../src/lib/bilibiliServer';

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
    if (isUpstreamFailure(upstream)) {
      // The reason is returned rather than hidden: a missing cookie means
      // bilibili changed its risk control, which is a different problem from a
      // brief outage, and the client shows it to the user.
      return json({ error: 'bilibili unavailable', reason: upstream.failure }, 503);
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
