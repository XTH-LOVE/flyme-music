/**
 * Shared helpers for the Cloudflare Pages Functions under functions/api.
 * This file exports no onRequest handler, so Cloudflare does NOT expose it
 * as a route.
 *
 * Logic mirrors server/auroraApi.ts (the Vercel/Node variant); here we target
 * the Workers runtime (fetch-style Request/Response). On Cloudflare the
 * routing prefix is stripped before the handler runs, so request.url's
 * pathname already equals the route path.
 */

export const PC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fallback defaults for the AI pass-through (Zhipu). Only the API key is
 * secret and MUST come from the Pages environment variables; endpoint and
 * model are non-sensitive so users only need to configure one variable.
 */
export const AI_DEFAULT_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4';
export const AI_DEFAULT_MODEL = 'glm-4-flash';

export type Env = Record<string, string | undefined>;

export interface PagesContext {
  env: Env;
  request: Request;
  params: Record<string, string | string[]>;
}

export function isHttpUrl(target: string | null): target is string {
  return Boolean(target && /^https?:\/\//.test(target));
}

export function queryParam(request: Request, name: string): string | null {
  return new URL(request.url).searchParams.get(name);
}

/** Preserve the actual login session issued in Netease's Set-Cookie headers. */
export function getResponseCookies(headers: Headers): string[] {
  const list =
    typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie') as string]
        : [];
  return list
    .map((value) => value.split(';', 1)[0]?.trim())
    .filter((value): value is string => Boolean(value));
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorJson(e: unknown, status = 502): Response {
  return json({ error: String(e) }, status);
}
