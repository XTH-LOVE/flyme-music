// Cloudflare Pages Function: POST /api/netease/weapi
// Encryption already happened in src/music/netease/weapi.ts; we only relay
// the form and return the upstream body plus any Set-Cookie session values.
import { PC_USER_AGENT, getResponseCookies, json, errorJson, type PagesContext } from '../_shared';

export async function onRequest(context: PagesContext): Promise<Response> {
  const request = context.request;
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
    const upstream = await fetch('https://music.163.com' + apiPath, {
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
    const text = await upstream.text();
    const cookies = getResponseCookies(upstream.headers);
    return new Response(JSON.stringify({ body: text, cookies }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return errorJson(e);
  }
}
