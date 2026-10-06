import type { MusicTrack } from '@/music/source/types';
import { musicEntityKey } from './musicEntity';

export interface MusicVerificationConstraints {
  avoid?: string[];
  maxArtistRepeat?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  maxTracks?: number;
  noDuplicates?: boolean;
}

export interface MusicVerificationResult {
  tracks: MusicTrack[];
  accepted: number;
  rejected: number;
  reasons: string[];
  valid: boolean;
}

function normalized(value: string): string { return value.toLocaleLowerCase().replace(/[\s\-_·・]/g, ''); }

export function verifyMusicCandidates(tracks: MusicTrack[], constraints: MusicVerificationConstraints = {}): MusicVerificationResult {
  const accepted: MusicTrack[] = [];
  const reasons: string[] = [];
  const seen = new Set<string>();
  const artists = new Map<string, number>();
  const avoid = (constraints.avoid ?? []).map(normalized).filter(Boolean);
  let totalDuration = 0;
  for (const track of tracks) {
    const entity = musicEntityKey(track);
    const artist = normalized(track.artist.join(' '));
    const haystack = normalized(`${track.name} ${track.artist.join(' ')} ${track.album}`);
    if (!track.id || !track.name || !track.artist.length) { reasons.push(`丢弃无效歌曲：${track.name || '未知'}`); continue; }
    if (constraints.noDuplicates !== false && seen.has(entity)) { reasons.push(`去重：${track.name}`); continue; }
    if (avoid.some((word) => haystack.includes(word))) { reasons.push(`避开：${track.name}`); continue; }
    const count = artists.get(artist) ?? 0;
    if (constraints.maxArtistRepeat && count >= constraints.maxArtistRepeat) { reasons.push(`艺人重复过多：${track.name}`); continue; }
    const duration = Number(track.duration ?? 0);
    if (constraints.minDurationMinutes && duration > 0 && duration < constraints.minDurationMinutes * 60) { reasons.push(`太短：${track.name}`); continue; }
    if (constraints.maxDurationMinutes && duration > constraints.maxDurationMinutes * 60) { reasons.push(`太长：${track.name}`); continue; }
    if (constraints.maxTracks && accepted.length >= constraints.maxTracks) break;
    seen.add(entity);
    artists.set(artist, count + 1);
    totalDuration += duration;
    accepted.push(track);
  }
  const minTotal = (constraints.minDurationMinutes ?? 0) * 60;
  const maxTotal = (constraints.maxDurationMinutes ?? Number.POSITIVE_INFINITY) * 60;
  const valid = accepted.length > 0 && totalDuration >= minTotal && totalDuration <= maxTotal;
  if (accepted.length === 0) reasons.push('没有通过验证的歌曲');
  return { tracks: accepted, accepted: accepted.length, rejected: tracks.length - accepted.length, reasons, valid };
}
