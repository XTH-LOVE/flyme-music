import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';

export interface LocalUser { id: string; username: string; nickname: string; avatarUrl?: string }
interface AuthState {
  user: LocalUser | null; token: string; ready: boolean;
  register: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  registerUsername: (displayName: string, username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  loginUsername: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  updateProfile: (patch: { nickname?: string; avatarUrl?: string }) => Promise<void>;
  uploadAvatar: (file: File) => Promise<{ ok: boolean; message?: string; url?: string }>;
}
function mapUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): LocalUser {
  const meta = user.user_metadata ?? {};
  return { id: user.id, username: String(meta.username || user.email || ''), nickname: String(meta.nickname || meta.display_name || user.email?.split('@')[0] || 'Aurora 听友'), avatarUrl: typeof meta.avatarUrl === 'string' ? meta.avatarUrl : undefined };
}
async function legacyRequest(path: string, init: RequestInit = {}) {
  const response = await fetch('/api/auth' + path, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  const data = await response.json() as { message?: string; token?: string; user?: LocalUser };
  if (!response.ok) throw new Error(data.message || '账号服务暂不可用');
  return data;
}
const normalizeUsername = (username: string) => username.trim().toLowerCase();
// Keep the historical address for ASCII accounts; encode Unicode names so they remain valid emails.
const internalEmail = (username: string) => {
  const normalized = normalizeUsername(username);
  if (/^[a-z0-9_]+$/.test(normalized)) return `account.${normalized}@users.auroramusic.invalid`;
  const bytes = new TextEncoder().encode(normalized);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `account.u${encoded}@users.auroramusic.invalid`;
};

export const useAuthStore = create<AuthState>()(persist((set, get) => ({
  user: null, token: '', ready: false,
  register: async (email, password) => {
    if (!/^\d{6}$/.test(password)) return { ok: false, message: '密码必须是 6 位数字' };
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) return { ok: false, message: error.message };
      if (data.user && data.session) set({ user: mapUser(data.user), token: data.session.access_token });
      return { ok: true, message: data.session ? '注册成功' : '注册成功，请查收验证邮件后登录' };
    }
    try { const d = await legacyRequest('/register', { method: 'POST', body: JSON.stringify({ username: email, password }) }); set({ token: d.token || '', user: d.user || null }); return { ok: true }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : '注册失败' }; }
  },
  login: async (email, password) => {
    if (!/^\d{6}$/.test(password)) return { ok: false, message: '密码必须是 6 位数字' };
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user || !data.session) return { ok: false, message: error?.message || '登录失败' };
      set({ user: mapUser(data.user), token: data.session.access_token }); return { ok: true };
    }
    try { const d = await legacyRequest('/login', { method: 'POST', body: JSON.stringify({ username: email, password }) }); set({ token: d.token || '', user: d.user || null }); return { ok: true }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : '登录失败' }; }
  },
  registerUsername: async (displayName, username, password) => {
    if (!supabase) return { ok: false, message: 'Supabase 尚未配置' };
    const normalized = normalizeUsername(username);
    if (!/^[\p{L}\p{N}_]{2,20}$/u.test(normalized)) return { ok: false, message: '账号名需要 2-20 位中文、字母、数字或下划线' };
    if (!/^\d{6}$/.test(password)) return { ok: false, message: '密码必须是 6 位数字' };
    const { data, error } = await supabase.functions.invoke('account-auth', { body: { action: 'register', displayName: displayName.trim() || 'Aurora 听友', username: normalized, password } });
    if (error || data?.error) return { ok: false, message: data?.error || error?.message || '注册失败' };
    return get().loginUsername(normalized, password);
  },
  loginUsername: async (username, password) => {
    if (supabase) {
      if (!/^\d{6}$/.test(password)) return { ok: false, message: '密码必须是 6 位数字' };
      const { data, error } = await supabase.auth.signInWithPassword({ email: internalEmail(username), password });
      if (error || !data.user || !data.session) return { ok: false, message: error?.message || '账号或密码错误' };
      set({ user: mapUser(data.user), token: data.session.access_token }); return { ok: true };
    }
    return { ok: false, message: 'Supabase 尚未配置' };
  },
  logout: async () => { if (supabase) await supabase.auth.signOut(); set({ token: '', user: null }); },
  updateProfile: async (patch) => {
    if (supabase) {
      const { data, error } = await supabase.auth.updateUser({ data: { nickname: patch.nickname?.trim(), avatarUrl: patch.avatarUrl?.trim() || null } });
      if (!error && data.user) set({ user: mapUser(data.user) });
      return;
    }
    const token = get().token; if (!token) return;
    try { const d = await legacyRequest('/profile', { method: 'PATCH', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify(patch) }); if (d.user) set({ user: d.user }); } catch { /* preserve last known profile */ }
  },
  uploadAvatar: async (file) => {
    const user = get().user;
    if (!supabase || !user) return { ok: false, message: '请先登录 Aurora 账号' };
    if (!file.type.startsWith('image/')) return { ok: false, message: '请选择图片文件' };
    if (file.size > 5 * 1024 * 1024) return { ok: false, message: '图片不能超过 5MB' };
    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    if (error) return { ok: false, message: '头像上传失败：' + error.message };
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = data.publicUrl + '?v=' + Date.now();
    await get().updateProfile({ avatarUrl: url });
    return { ok: true, url };
  },
}), { name: 'aurora.cloud.auth', partialize: (state) => ({ token: state.token, user: state.user }) }));

if (supabase) {
  void supabase.auth.getSession().then(({ data }) => {
    const session = data.session;
    useAuthStore.setState({ ready: true, token: session?.access_token ?? '', user: session?.user ? mapUser(session.user) : null });
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({ token: session?.access_token ?? '', user: session?.user ? mapUser(session.user) : null, ready: true });
  });
} else {
  useAuthStore.setState({ ready: true });
}
