import type { MusicTrack } from '@/music/source/types';
import type { FeatureCard } from '@/audio/analysis';
import { loadListeningEvents, type ListeningEvent } from './listeningEvents';

export interface TasteProfileWindow {
  days: number;
  events: number;
  artistAffinity: Record<string, number>;
  sourceAffinity: Record<string, number>;
  skipPenalty: Record<string, number>;
  completionBoost: Record<string, number>;
  repeatBoost: Record<string, number>;
  featureCenter: number[];
}

export interface TasteProfile {
  generatedAt: number;
  shortTerm: TasteProfileWindow;
  longTerm: TasteProfileWindow;
  favoriteArtists: string[];
  avoidArtists: string[];
}

function emptyWindow(days: number): TasteProfileWindow {
  return { days, events: 0, artistAffinity: {}, sourceAffinity: {}, skipPenalty: {}, completionBoost: {}, repeatBoost: {}, featureCenter: [] };
}

function add(map: Record<string, number>, key: string, value: number): void {
  if (key) map[key] = (map[key] ?? 0) + value;
}

function artistKey(track: MusicTrack): string {
  return track.artist.map((artist) => artist.trim().toLocaleLowerCase()).filter(Boolean).join(' / ');
}

function buildWindow(events: ListeningEvent[], cards: FeatureCard[], days: number, now: number): TasteProfileWindow {
  const window = emptyWindow(days);
  const cutoff = now - days * 86_400_000;
  const selected = events.filter((event) => event.at >= cutoff);
  window.events = selected.length;
  const vectors: Array<{ vector: number[]; weight: number }> = [];
  const cardByKey = new Map(cards.map((card) => [`${card.track.source}:${card.track.id}`, card]));
  for (const event of selected) {
    const artist = artistKey(event.track);
    const key = `${event.track.source}:${event.track.id}`;
    const weight = event.type === 'completed' ? 2 : event.type === 'liked' ? 4 : event.type === 'repeated' ? 3 : event.type === 'skipped' ? -3 : event.type === 'disliked' ? -6 : event.type === 'manuallyQueued' ? 1.5 : 1;
    add(window.artistAffinity, artist, weight);
    add(window.sourceAffinity, event.track.source, weight);
    if (event.type === 'skipped' || event.type === 'disliked') add(window.skipPenalty, key, event.type === 'disliked' ? 4 : 1);
    if (event.type === 'completed') add(window.completionBoost, key, 1);
    if (event.type === 'repeated') add(window.repeatBoost, key, 1);
    const card = cardByKey.get(key);
    if (card && weight > 0) vectors.push({ vector: card.vector, weight });
  }
  if (vectors.length) {
    const length = Math.max(...vectors.map((item) => item.vector.length));
    window.featureCenter = Array.from({ length }, (_, index) => {
      const total = vectors.reduce((sum, item) => sum + (item.vector[index] ?? 0) * item.weight, 0);
      const divisor = vectors.reduce((sum, item) => sum + item.weight, 0);
      return divisor > 0 ? total / divisor : 0;
    });
  }
  return window;
}

export function buildAiTasteProfile(cards: FeatureCard[] = [], events = loadListeningEvents(), now = Date.now()): TasteProfile {
  const shortTerm = buildWindow(events, cards, 30, now);
  const longTerm = buildWindow(events, cards, 365, now);
  const affinity = new Map<string, number>();
  for (const [artist, value] of Object.entries(longTerm.artistAffinity)) affinity.set(artist, value + (shortTerm.artistAffinity[artist] ?? 0) * 1.8);
  const favoriteArtists = [...affinity.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([artist]) => artist);
  const avoidArtists = [...affinity.entries()].filter(([, value]) => value < -2).sort((a, b) => a[1] - b[1]).slice(0, 10).map(([artist]) => artist);
  return { generatedAt: now, shortTerm, longTerm, favoriteArtists, avoidArtists };
}

export function scoreTrackByTaste(track: MusicTrack, profile: TasteProfile, card?: FeatureCard): { score: number; reasons: string[] } {
  const key = `${track.source}:${track.id}`;
  const artist = artistKey(track);
  const reasons: string[] = [];
  let score = 0;
  const affinity = (profile.shortTerm.artistAffinity[artist] ?? 0) * 2 + (profile.longTerm.artistAffinity[artist] ?? 0);
  if (affinity > 0) { score += Math.min(18, affinity); reasons.push('符合最近常听艺人'); }
  if (affinity < 0) { score += Math.max(-25, affinity); reasons.push('命中跳过/不喜欢信号'); }
  const completed = profile.longTerm.completionBoost[key] ?? 0;
  const skipped = (profile.shortTerm.skipPenalty[key] ?? 0) * 3 + (profile.longTerm.skipPenalty[key] ?? 0);
  if (completed) { score += Math.min(8, completed * 2); reasons.push('过去完整听完过'); }
  if (skipped) { score -= Math.min(20, skipped); reasons.push('最近跳过过'); }
  if (card && profile.shortTerm.featureCenter.length) {
    const n = Math.min(card.vector.length, profile.shortTerm.featureCenter.length);
    let distance = 0;
    for (let i = 0; i < n; i += 1) distance += Math.abs(card.vector[i] - profile.shortTerm.featureCenter[i]);
    const featureScore = Math.max(-5, 8 - distance * 2);
    score += featureScore;
    if (featureScore > 2) reasons.push('听感接近最近口味');
  }
  return { score, reasons };
}

export function renderAiTasteProfile(profile: TasteProfile): string {
  return `短期偏好：${profile.favoriteArtists.slice(0, 5).join('、') || '样本不足'}；长期偏好：${profile.favoriteArtists.slice(5, 10).join('、') || '样本不足'}；回避：${profile.avoidArtists.join('、') || '暂无'}`;
}
