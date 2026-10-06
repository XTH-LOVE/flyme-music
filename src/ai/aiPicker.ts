import type { MusicTrack } from '@/music/source/types';
import { candidatePoolText, pickBestCandidate, type CandidatePool } from './candidatePool';
import type { PlaylistStage } from './playlistPlanner';

export interface PickerDecision {
  track: MusicTrack | null;
  reason: string;
  confidence: number;
  prompt: string;
}

export function buildPickerPrompt(pool: CandidatePool, stage?: PlaylistStage, recent: MusicTrack[] = []): string {
  const recentText = recent.length ? recent.map((track) => `${track.name}-${track.artist.join('/')}`).join('、') : '无';
  return [
    '你是音乐电台的下一首选择器。只能从候选池的编号中选择一个，不要编造歌曲。',
    stage ? `当前阶段：${stage.label}，时长 ${stage.minutes} 分钟，节奏 ${stage.tempo}，能量 ${stage.energy}。` : '',
    `最近已播放：${recentText}`,
    '候选池：',
    candidatePoolText(pool),
    '只输出 JSON：{"index":数字,"reason":"不超过30字"}',
  ].filter(Boolean).join('\n');
}

export function pickNextTrack(pool: CandidatePool, stage?: PlaylistStage, recent: MusicTrack[] = []): PickerDecision {
  const recentKeys = new Set(recent.map((track) => `${track.source}:${track.id}`));
  const selected = pickBestCandidate(pool, { stage: stage?.id, exclude: recentKeys });
  if (selected) {
    selected.selected = true;
    return { track: selected.track, reason: selected.reasons.join('、') || '候选池排序最高', confidence: Math.max(0.35, Math.min(0.99, 0.55 + selected.score / 100)), prompt: buildPickerPrompt(pool, stage, recent) };
  }
  return { track: null, reason: '候选池没有可用歌曲', confidence: 0, prompt: buildPickerPrompt(pool, stage, recent) };
}

export function parsePickerDecision(text: string): { index: number; reason: string } | null {
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[0]) as Record<string, unknown>;
    const index = Number(value.index);
    if (!Number.isInteger(index) || index < 0) return null;
    return { index, reason: typeof value.reason === 'string' ? value.reason.slice(0, 80) : 'AI 选择' };
  } catch {
    return null;
  }
}
