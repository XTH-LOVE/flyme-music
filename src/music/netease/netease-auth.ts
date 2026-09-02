import type { NeteaseUser } from '@/store/useNeteaseAuthStore';

interface QrKeyResponse {
  code: number;
  unikey?: string;
}

interface AccountResponse {
  code: number;
  profile?: { userId?: number; nickname?: string; avatarUrl?: string };
}

async function callAuth<T>(path: string, data: Record<string, unknown>, cookie = ''): Promise<T> {
  const response = await fetch('/api/netease/weapi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, data, cookie }),
  });
  if (!response.ok) throw new Error('网易云登录服务 HTTP ' + response.status);
  return (await response.json()) as T;
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

export function checkNeteaseQr(key: string): Promise<NeteaseQrStatus> {
  return callAuth<NeteaseQrStatus>('/weapi/login/qrcode/client/login', {
    key,
    type: 1,
    csrf_token: '',
  });
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
