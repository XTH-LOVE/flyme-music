// Cloudflare Pages Function: GET /api/netease/public?path=<legacy>&<query>
// Fallback relay for Netease's legacy UNENCRYPTED endpoints - used when the
// weapi channel is risk-controlled (-462). Whitelist-only to prevent abuse.
import { PC_USER_AGENT, json, errorJson, guard, type PagesContext } from '../_shared';

const ALLOWED = new Set(['/api/playlist/detail']);

export async function onRequest(context: PagesContext): Promise<Response> {
  const blocked = guard(context.request, context.env, 'weapi');
  if (blocked) return blocked;
  try {
    const url = new URL(context.request.url);
    const path = url.searchParams.get('path') ?? '';
    if (!ALLOWED.has(path)) {
      return json({ error: 'path not allowed' }, 400);
    }
    const upstream = await fetch('https://music.163.com' + path + '?' + url.searchParams.toString(), {
      headers: {
        'User-Agent': PC_USER_AGENT,
        Referer: 'https://music.163.com',
        Cookie: 'os=pc; appver=2.9.7; mode=31',
      },
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return errorJson(e);
  }
}
