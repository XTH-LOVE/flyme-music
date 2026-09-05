import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MusicTrack } from '@/music/source/types';

/**
 * Client half of the "listen room" feature. The server side (rooms table,
 * RLS policies, join rpc, realtime publication) ships in
 * supabase/migrations/20260830_listen_rooms.sql.
 *
 * Model: the HOST mirrors its player snapshot into the room row; the GUEST
 * receives realtime row updates and calibrates. Only two seats by design.
 */

export interface RoomProfile {
  nickname: string;
  avatarUrl?: string;
}

export interface ListenRoomRow {
  id: string;
  code: string;
  host_user_id: string;
  guest_user_id: string | null;
  host_profile: RoomProfile | null;
  guest_profile: RoomProfile | null;
  current_track: MusicTrack | null;
  queue: MusicTrack[];
  queue_index: number;
  position_seconds: number;
  is_playing: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface RoomStatePatch {
  current_track: MusicTrack | null;
  queue: MusicTrack[];
  queue_index: number;
  position_seconds: number;
  is_playing: boolean;
}

function assertSupabase(): SupabaseClient {
  if (!supabaseConfigured || !supabase) throw new Error('需要先配置并登录 Aurora 账号');
  return supabase;
}

/** Unambiguous 6-char room code (no 0/O/1/I). */
export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function createRoom(profile: RoomProfile): Promise<ListenRoomRow> {
  const db = assertSupabase();
  const user = (await db.auth.getUser()).data.user;
  if (!user) throw new Error('请先登录 Aurora 账号');
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await db
      .from('listen_rooms')
      .insert({ code, host_user_id: user.id, host_profile: profile })
      .select('*')
      .single();
    if (!error && data) return data as ListenRoomRow;
    // 23505 = unique violation on the code column: reroll and try again.
    if ((error as { code?: string } | null)?.code !== '23505') {
      throw new Error(error?.message ?? '创建房间失败');
    }
  }
  throw new Error('创建房间失败，请重试');
}

export async function joinRoom(code: string, profile: RoomProfile): Promise<ListenRoomRow> {
  const db = assertSupabase();
  const { data, error } = await db.rpc('join_listen_room', {
    p_code: code.trim().toUpperCase(),
    p_profile: profile,
  });
  if (error || !data) throw new Error(error?.message ?? '验证码无效或房间已满');
  return data as unknown as ListenRoomRow;
}

export async function fetchRoom(id: string): Promise<ListenRoomRow | null> {
  const db = assertSupabase();
  const { data } = await db.from('listen_rooms').select('*').eq('id', id).maybeSingle();
  return (data as ListenRoomRow) ?? null;
}

/** Host-only: mirror the local player snapshot into the room row. */
export async function broadcastRoomState(id: string, patch: RoomStatePatch): Promise<void> {
  const db = assertSupabase();
  await db
    .from('listen_rooms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function closeRoom(id: string): Promise<void> {
  const db = assertSupabase();
  await db.from('listen_rooms').delete().eq('id', id);
}

export async function leaveRoomAsGuest(id: string): Promise<void> {
  const db = assertSupabase();
  await db.from('listen_rooms').update({ guest_user_id: null, guest_profile: null }).eq('id', id);
}

/** Realtime updates for one room row (UPDATE events only). */
export function subscribeRoom(
  id: string,
  onUpdate: (row: ListenRoomRow) => void,
): () => void {
  const db = assertSupabase();
  const channel = db
    .channel('listen-room:' + id)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'listen_rooms', filter: 'id=eq.' + id },
      (payload) => {
        // supabase-js v2 renamed the changed row from `row` to `new`; read
        // both so either minor version works.
        const row =
          (payload as unknown as { new?: ListenRoomRow }).new ??
          (payload as unknown as { row?: ListenRoomRow }).row;
        if (row) onUpdate(row);
      },
    )
    .subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}
