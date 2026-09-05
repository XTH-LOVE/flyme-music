// Cloudflare Pages Function: GET /api/proxy?url=<enc>&referer=<enc>
// Generic forwarder with a caller-supplied Referer (QQ Music endpoints).
import { PC_USER_AGENT, isHttpUrl, queryParam, errorJson, guard, type PagesContext } from './_shared';

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const blocked = guard(request, context.env, 'proxy');
  if (blocked) return blocked;
  const target = queryParam(request, 'url');
  const referer = queryParam(request, 'referer') ?? '';
  if (!isHttpUrl(target)) {
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
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorJson(e);
  }
}
