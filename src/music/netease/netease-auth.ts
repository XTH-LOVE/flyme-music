import type { NeteaseUser } from '@/store/useNeteaseAuthStore';
import { neteaseWeapi } from './neteaseWeapi';

interface QrKeyResponse {
  code: number;
  unikey?: string;
}

interface AccountResponse {
  code: number;
  profile?: { userId?: number; nickname?: string; avatarUrl?: string };
}

async function callAuth<T>(path: string, data: Record<string, unknown>, cookie = ''): Promise<T> {
  const { json } = await neteaseWeapi<T>(path, data, cookie);
  return json;
}

export async function getNeteaseQrKey(): Promise<string> {
  const response = await callAuth<QrKeyResponse>('/weapi/login/qrcode/unikey', { type: 1 });
  if (response.code !== 200 || !response.unikey) throw new Error('获取登录二维码失败');
  return response.unikey;
}

export interface NeteaseQrStatus {
  code: number;
  cookie?: string;
  message?: string;
  data?: { cookie?: string };
}

/** code 803 = 扫码成功，会话只在 Set-Cookie 里。 */
export async function checkNeteaseQr(key: string): Promise<NeteaseQrStatus> {
  const { json, cookies } = await neteaseWeapi<NeteaseQrStatus>(
    '/weapi/login/qrcode/client/login',
    { key, type: 1, csrf_token: '' },
  );
  if (json.code === 803 && cookies.length && typeof json.cookie !== 'string') {
    return { ...json, cookie: cookies.join('; ') };
  }
  return json;
}

export async function getNeteaseUser(cookie: string): Promise<NeteaseUser> {
  const response = await callAuth<AccountResponse>('/weapi/nuser/account/get', {}, cookie);
  const profile = response.profile;
  if (response.code !== 200 || !profile?.userId || !profile.nickname) {
    throw new Error('网易云登录凭据无效或已过期');
  }
  return {
    id: String(profile.userId),
    nickname: profile.nickname,
    avatarUrl: profile.avatarUrl ? profile.avatarUrl + '?param=96y96' : undefined,
  };
}
