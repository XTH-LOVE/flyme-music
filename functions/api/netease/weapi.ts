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
    const relay = () =>
      fetch('https://music.163.com' + apiPath, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': PC_USER_AGENT,
          Referer: 'https://music.163.com',
          Origin: 'https://music.163.com',
          Cookie: typeof cookie === 'string' ? cookie.replace(/[\r\n]/g, '').slice(0, 12000) : '',
        },
        body: form,
      });
    // Netease risk control (-462 etc.) is per-egress-IP and intermittent;
    // repeated attempts often ride a different egress and clear it.
    let upstream = await relay();
    let text = await upstream.text();
    for (const delay of [250, 700, 1500]) {
      if (!isRiskBody(text)) break;
      await new Promise((r) => setTimeout(r, delay));
      upstream = await relay();
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
