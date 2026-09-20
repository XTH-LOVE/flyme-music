// Cloudflare Pages Function: POST /api/netease/weapi
// Encryption already happened in src/music/netease/weapi.ts; we only relay
// the form and return the upstream body plus any Set-Cookie session values.
import { PC_USER_AGENT, getResponseCookies, json, errorJson, guard, type PagesContext } from '../_shared';

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
  const blocked = guard(request, context.env, 'weapi');
  if (blocked) return blocked;
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }
  try {
    const { path: apiPath, form, cookie } = (await request.json()) as {
      path: string;
      form: string;
      cookie?: string;
    };
    if (!apiPath || !apiPath.startsWith('/weapi/') || typeof form !== 'string') {
      return json({ error: 'bad path or form' }, 400);
    }
    const relay = (attempt: number) =>
      fetch('https://music.163.com' + apiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': PC_USER_AGENT,
          Referer: 'https://music.163.com',
          Origin: 'https://music.163.com',
          Cookie: attempt === 0
            ? typeof cookie === 'string' ? cookie.replace(/[\r\n]/g, '').slice(0, 12000) : ''
            : reIdCookie(typeof cookie === 'string' ? cookie : ''),
        },
        body: form,
      });
    // Netease risk control (-462, sometimes with a verify challenge bound to
    // the request's _ntes_nuid) is per-egress-IP/identity and intermittent;
    // retries with fresh identities often clear it.
    let upstream = await relay(0);
    let text = await upstream.text();
    for (const [i, delay] of [250, 700, 1500].entries()) {
      if (!isRiskBody(text)) break;
      await new Promise((r) => setTimeout(r, delay));
      upstream = await relay(i + 1);
      text = await upstream.text();
    }
    const cookies = getResponseCookies(upstream.headers);
    return new Response(JSON.stringify({ body: text, cookies }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return errorJson(e);
  }
}

function isRiskBody(text: string): boolean {
  try {
    const code = (JSON.parse(text) as { code?: number }).code;
    return code === -462 || code === 462 || code === -460 || code === 460 || code === 512;
  } catch {
    return false;
  }
}

/** Fresh random visitor identity for retry attempts (challenges bind to it). */
function reIdCookie(cookie: string): string {
  let nid = '';
  for (let i = 0; i < 32; i++) nid += '012345679abcdef'[Math.floor(Math.random() * 16)];
  return cookie
    .replace(/_ntes_nuid=[^;]*/, '_ntes_nuid=' + nid)
    .replace(/_ntes_nnid3=[^,;]*/, '_ntes_nnid3=' + nid + ',' + Date.now());
}
