import { create } from 'zustand';
import type { ListenRoomRow, RoomProfile } from '@/listen/listenRoom';

export type ListenStatus = 'idle' | 'connecting' | 'active' | 'error';

interface ListenState {
  status: ListenStatus;
  /** Room row id (uuid) when active. */
  roomId: string | null;
  code: string | null;
  role: 'host' | 'guest' | null;
  peer: RoomProfile | null;
  error: string | null;
  begin: (role: 'host' | 'guest') => void;
  activate: (row: ListenRoomRow, role: 'host' | 'guest', myId: string) => void;
  setPeer: (peer: RoomProfile | null) => void;
  fail: (message: string) => void;
  reset: () => void;
}

interface RoomMeta {
  myId: string;
}

/** Non-reactive bits (ids) kept out of the store surface. */
const meta: RoomMeta = { myId: '' };

export function setMyListenId(id: string): void {
  meta.myId = id;
}
export function myListenId(): string {
  return meta.myId;
}

export const useListenStore = create<ListenState>((set) => ({
  status: 'idle',
  roomId: null,
  code: null,
  role: null,
  peer: null,
  error: null,

  begin: (role) => set({ status: 'connecting', role, error: null }),
  activate: (row, role, myId) => {
    meta.myId = myId;
    set({
      status: 'active',
      roomId: row.id,
      code: row.code,
      role,
      peer: role === 'host' ? (row.guest_profile ?? null) : (row.host_profile ?? null),
      error: null,
    });
  },
  setPeer: (peer) => set({ peer }),
  fail: (error) => set({ status: 'error', error, roomId: null, code: null, role: null }),
  reset: () => set({ status: 'idle', roomId: null, code: null, role: null, peer: null, error: null }),
}));
