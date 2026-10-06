import type { MusicTrack } from '@/music/source/types';
import type { PlayLogEntry } from '@/store/useLibraryStore';

export interface AiSkillContext {
  current: MusicTrack | null;
  playLog: PlayLogEntry[];
  text: string;
}

export interface AiSkill {
  id: string;
  label: string;
  description: string;
  matches: (text: string) => boolean;
  run: (ctx: AiSkillContext) => Promise<string> | string;
}

const skills: AiSkill[] = [
  {
    id: 'listening-report', label: '听歌报告', description: '总结最近的听歌记录',
    matches: (text) => /听歌报告|最近听了什么|总结.*听歌|listening report/i.test(text),
    run: ({ playLog }) => localReport(playLog),
  },
  {
    id: 'now-playing', label: '当前歌曲介绍', description: '介绍正在播放的歌曲',
    matches: (text) => /当前这首|正在播放|now playing|这首歌怎么样/i.test(text),
    run: ({ current }) => current ? `现在播放的是《${current.name}》，${current.artist.join('/')}演唱，来自${current.album || '未知专辑'}。` : '现在没有正在播放的歌曲。',
  },
  {
    id: 'focus-mode', label: '专注模式', description: '生成专注音乐计划',
    matches: (text) => /专注模式|写代码|学习模式|focus mode/i.test(text),
    run: () => '可以为你安排一段低人声、低干扰、能量平稳的专注音乐。告诉我想听多久即可。',
  },
];

function localReport(playLog: PlayLogEntry[]): string {
  if (!playLog.length) return '你还没听过歌，先去放一首，我再给你写报告。';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = playLog.filter((item) => item.ts >= today.getTime()).length;
  const songs = new Map<string, number>();
  const artists = new Map<string, number>();
  for (const item of playLog) {
    songs.set(item.key, (songs.get(item.key) ?? 0) + 1);
    for (const artist of item.artist.split('/').map((value) => value.trim()).filter(Boolean)) artists.set(artist, (artists.get(artist) ?? 0) + 1);
  }
  const topSong = [...songs.entries()].sort((a, b) => b[1] - a[1])[0];
  const topArtist = [...artists.entries()].sort((a, b) => b[1] - a[1])[0];
  const songName = topSong ? playLog.find((item) => item.key === topSong[0])?.name : '-';
  return `累计播放 ${playLog.length} 次，今天听了 ${todayCount} 首。最常循环《${songName ?? '-'}》，最常听歌手是 ${topArtist?.[0] ?? '-'}，共听过 ${songs.size} 首不同的歌。`;
}

export function registerAiSkill(skill: AiSkill): void {
  if (!skill.id || skills.some((item) => item.id === skill.id)) return;
  skills.push(skill);
}

export function listAiSkills(): AiSkill[] {
  return [...skills];
}

export function matchAiSkill(text: string): AiSkill | null {
  return skills.find((skill) => skill.matches(text)) ?? null;
}

export async function runAiSkill(text: string, ctx: Omit<AiSkillContext, 'text'>): Promise<{ skill: AiSkill; reply: string } | null> {
  const skill = matchAiSkill(text);
  if (!skill) return null;
  return { skill, reply: await skill.run({ ...ctx, text }) };
}
