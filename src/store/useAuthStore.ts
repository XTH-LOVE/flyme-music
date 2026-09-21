import { create } from 'zustand';
import { useNeteaseAuthStore, type NeteaseUser } from '@/store/useNeteaseAuthStore';

/**
 * The app's identity, which is the NetEase account.
 *
 * There used to be a separate one: Supabase first, then a local password store.
 * Both were a second account for the same person, holding a nickname and an
 * avatar that the NetEase account already has - and the NetEase one was needed
 * anyway to play anything from that source.
 *
 * So this is a mirror, not a store of its own. Everything that needs to know
 * who is using the app reads `useAuthStore`, and that keeps reading the same
 * shape it always did; only the source of the answer changed.
 *
 * Signing in happens in Settings, as a QR scan - see the NetEase section there.
 */

export interface LocalUser {
  id: string;
  username: string;
  nickname: string;
  avatarUrl?: string;
}

interface AuthState {
  user: LocalUser | null;
  token: string;
  ready: boolean;
  register: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  registerUsername: (
    displayName: string,
    username: string,
    password: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  loginUsername: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  updateProfile: (patch: { nickname?: string; avatarUrl?: string }) => Promise<void>;
  uploadAvatar: (image: File | Blob) => Promise<{ ok: boolean; message?: string; url?: string }>;
}

/** The password rule the NetEase QR flow does not need, kept for the form. */
export function isValidPassword(password: string, mode: 'login' | 'register' = 'login'): boolean {
  const strong = /^(?=.*\p{L})(?=.*\d).{8,64}$/u.test(password);
  if (mode === 'register') return strong;
  return strong || /^\d{6}$/.test(password);
}

function mirror(user: NeteaseUser | null): LocalUser | null {
  if (!user) return null;
  return {
    id: String(user.id),
    // The NetEase account has no separate handle, so the nickname serves as one.
    username: user.nickname,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  };
}

const USE_NETEASE = '请使用网易云扫码登录';

export const useAuthStore = create<AuthState>()(() => ({
  user: mirror(useNeteaseAuthStore.getState().user),
  token: '',
  // Nothing to wait for: the session is already in localStorage by the time
  // this module is evaluated.
  ready: true,

  // Kept so existing callers compile and, more usefully, so anything that still
  // reaches for them is told where to go instead of failing quietly.
  register: async () => ({ ok: false, message: USE_NETEASE }),
  login: async () => ({ ok: false, message: USE_NETEASE }),
  registerUsername: async () => ({ ok: false, message: USE_NETEASE }),
  loginUsername: async () => ({ ok: false, message: USE_NETEASE }),

  logout: async () => {
    useNeteaseAuthStore.getState().logout();
  },

  // Both are no-ops on purpose. The nickname and avatar belong to the NetEase
  // account and are changed there, not here - letting them be edited locally
  // would create a second version that the next sign-in would silently undo.
  updateProfile: async () => undefined,
  uploadAvatar: async () => ({ ok: false, message: '头像来自网易云账号，请在那里修改' }),
}));

/** Keeps the mirror in step, without every consumer subscribing to two stores. */
useNeteaseAuthStore.subscribe((state) => {
  const next = mirror(state.user);
  if (useAuthStore.getState().user?.id !== next?.id) {
    useAuthStore.setState({ user: next });
  }
});
