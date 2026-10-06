import type { MusicTrack } from '@/music/source/types';

export interface CandidateTrack {
  track: MusicTrack;
  score: number;
  reasons: string[];
  stage?: string;
  selected?: boolean;
  skipped?: boolean;
}

export interface CandidatePoolSnapshot {
  query: string;
  createdAt: number;
  candidates: CandidateTrack[];
}

export interface CandidatePool {
  query: string;
  createdAt: number;
  candidates: CandidateTrack[];
}

const keyOf = (track: MusicTrack): string => `${track.source}:${track.id}`;

function normalized(text: string): string {
  return text.toLowerCase().replace(/[\s\-_/·・]/g, '');
}

function scoreTrack(track: MusicTrack, query: string, dislikes: string[]): { score: number; reasons: string[] } {
  const haystack = normalized(`${track.name} ${track.artist.join(' ')} ${track.album}`);
  const tokens = query.split(/[\s,，。！？!?.]+/).map(normalized).filter(Boolean);
  const reasons: string[] = [];
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += token.length > 2 ? 8 : 3;
      reasons.push(`命中${token}`);
    }
  }
  const hitDislike = dislikes.find((word) => haystack.includes(normalized(word)));
  if (hitDislike) {
    score -= 100;
    reasons.push(`回避${hitDislike}`);
  }
  if (track.picUrl || track.palette) score += 1;
  if (track.duration && track.duration > 0) score += 1;
  return { score, reasons };
}

export function createCandidatePool(query: string, tracks: MusicTrack[], dislikes: string[] = []): CandidatePool {
  const seen = new Set<string>();
  const candidates: CandidateTrack[] = [];
  for (const track of tracks) {
    const key = keyOf(track);
    if (seen.has(key)) continue;
    seen.add(key);
    const scored = scoreTrack(track, query, dislikes);
    candidates.push({ track, score: scored.score, reasons: scored.reasons });
  }
  candidates.sort((a, b) => b.score - a.score || a.track.name.localeCompare(b.track.name));
  return { query, createdAt: Date.now(), candidates };
}

export function addCandidates(pool: CandidatePool, tracks: MusicTrack[], query = pool.query, dislikes: string[] = [], stage?: string): CandidatePool {
  const previousStages = new Map(pool.candidates.map((item) => [keyOf(item.track), item.stage]));
  const next = createCandidatePool(query, [...pool.candidates.map((item) => item.track), ...tracks], dislikes);
  const newKeys = new Set(tracks.map(keyOf));
  for (const item of next.candidates) item.stage = newKeys.has(keyOf(item.track)) && stage ? stage : previousStages.get(keyOf(item.track));
  return next;
}

export function selectCandidate(pool: CandidatePool, index: number): CandidateTrack | null {
  if (!Number.isInteger(index) || index < 0 || index >= pool.candidates.length) return null;
  const item = pool.candidates[index];
  item.selected = true;
  return item;
}

export function markCandidateSkipped(pool: CandidatePool, index: number): CandidateTrack | null {
  if (!Number.isInteger(index) || index < 0 || index >= pool.candidates.length) return null;
  const item = pool.candidates[index];
  item.skipped = true;
  return item;
}

export function pickBestCandidate(pool: CandidatePool, options: { stage?: string; exclude?: Set<string> } = {}): CandidateTrack | null {
  const excluded = options.exclude ?? new Set<string>();
  return pool.candidates.find((item) => !item.selected && !item.skipped && (!options.stage || !item.stage || item.stage === options.stage) && !excluded.has(keyOf(item.track))) ?? null;
}

export function poolSnapshot(pool: CandidatePool, limit = 20): CandidatePoolSnapshot {
  return {
    query: pool.query,
    createdAt: pool.createdAt,
    candidates: pool.candidates.slice(0, limit).map((item) => ({ ...item, track: { ...item.track, artist: [...item.track.artist] } })),
  };
}

export function candidatePoolText(pool: CandidatePool, limit = 12): string {
  return pool.candidates.slice(0, limit).map((item, index) => `${index}. ${item.track.name} - ${item.track.artist.join('/')} [score=${item.score}]`).join('\n');
}
