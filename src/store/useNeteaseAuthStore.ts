import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedStorage } from '@/lib/cryptoStorage';

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
    {
      name: 'aurora.netease.auth',
      // The cookie is a full account credential, so keep it encrypted at rest
      // instead of plaintext in localStorage. Existing plaintext values are
      // read and upgraded in place on first load; if WebCrypto or IndexedDB are
      // unavailable the adapter falls back to plaintext rather than breaking
      // login (see src/lib/cryptoStorage.ts for the threat model).
      storage: createJSONStorage(() => createEncryptedStorage()),
    },
  ),
);

