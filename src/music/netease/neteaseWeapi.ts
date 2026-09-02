import { isTauri } from '@/lib/apiTransport';
import { buildVisitorCookie, weapiForm } from './weapi';

export interface NeteaseResult<T> {
  json: T;
  /** Set-Cookie 首段列表；扫码登录（code 803）只在这里返回会话。 */
  cookies: string[];
}

function composeCookie(userCookie: string): string {
  const visitor = buildVisitorCookie();
  return userCookie ? userCookie + '; ' + visitor : visitor;
}

/**
 * Single entry point for every /weapi/ call. Encryption happens once in
 * weapi.ts; only the transport differs: Tauri -> Rust command, browser dev
 * -> vite middleware. Both return the same { body, cookies } envelope.
 */
export async function neteaseWeapi<T>(
  path: string,
  data: Record<string, unknown>,
  cookie = '',
  signal?: AbortSignal,
): Promise<NeteaseResult<T>> {
  const form = await weapiForm(data);
  const fullCookie = composeCookie(cookie);
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const r = await invoke<{ body: string; cookies: string[] }>('netease_post', {
      path,
      form,
      cookie: fullCookie,
    });
    return { json: JSON.parse(r.body) as T, cookies: r.cookies };
  }
  const res = await fetch('/api/netease/weapi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, form, cookie: fullCookie }),
    signal,
  });
  if (!res.ok) throw new Error('netease weapi HTTP ' + res.status);
  const envelope = (await res.json()) as { body: string; cookies: string[] };
  return { json: JSON.parse(envelope.body) as T, cookies: envelope.cookies ?? [] };
}
