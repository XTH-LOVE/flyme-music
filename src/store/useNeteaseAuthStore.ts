import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface NeteaseUser {
  id: string;
  nickname: string;
  avatarUrl?: string;
}

interface NeteaseAuthState {
  cookie: string;
  user: NeteaseUser | null;
  setSession: (cookie: string, user: NeteaseUser) => void;
  logout: () => void;
}

export const useNeteaseAuthStore = create<NeteaseAuthState>()(
  persist(
    (set) => ({
      cookie: '',
      user: null,
      setSession: (cookie, user) => set({ cookie, user }),
      logout: () => set({ cookie: '', user: null }),
    }),
    { name: 'aurora.netease.auth' },
  ),
);

