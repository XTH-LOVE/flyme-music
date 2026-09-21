// Cloudflare Pages Function: GET /api/netease/public?path=<legacy>&<query>
// Fallback relay for Netease's legacy UNENCRYPTED endpoints - used when the
// weapi channel is risk-controlled (-462). Whitelist-only to prevent abuse.
// Netease risk control on datacenter IPs is PROBABILISTIC (a fraction of
// requests get code -462), so relay with a small retry budget.
import {
  PC_USER_AGENT,
  json,
  errorJson,
  guard,
  randomDomesticIp,
  type PagesContext,
} from '../_shared';

const ALLOWED = new Set(['/api/playlist/detail']);
const RISK_CODES = new Set([-462, -460, 512]);

export async function onRequest(context: PagesContext): Promise<Response> {
  const blocked = guard(context.request, context.env, 'weapi');
  if (blocked) return blocked;
  try {
    const url = new URL(context.request.url);
    const path = url.searchParams.get('path') ?? '';
    if (!ALLOWED.has(path)) {
      return json({ error: 'path not allowed' }, 400);
    }
    let text = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const upstream = await fetch('https://music.163.com' + path + '?' + url.searchParams.toString(), {
        headers: {
          'User-Agent': PC_USER_AGENT,
          Referer: 'https://music.163.com',
          Cookie: 'os=pc; appver=2.9.7; mode=31',
          'X-Real-IP': randomDomesticIp(),
          'X-Forwarded-For': randomDomesticIp(),
        },
      });
      text = await upstream.text();
      let code: number | undefined;
      try {
        code = JSON.parse(text).code;
      } catch {
        /* non-json upstream body */
      }
      if (upstream.ok && !RISK_CODES.has(code as number)) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 700));
    }
    // Always answer 200 with the upstream body: the risk-control code travels
    // in the JSON payload and the client surfaces it with a friendly hint.
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return errorJson(e);
  }
}
