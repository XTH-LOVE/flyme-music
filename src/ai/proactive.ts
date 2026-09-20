import { chatOnce } from './aiClient';
import { memoryBlock, type AiMemory } from './memory';
import { PERSONA_PROMPTS, buildLocalReport } from './aiTools';
import type { AiPersona } from '@/store/useAiStore';
import type { PlayLogEntry } from '@/store/useLibraryStore';

export type ProactiveKind = 'greeting' | 'weekly' | 'milestone' | 'dj';

export interface SessionState {
  startedAt: number;
  /** First artist of each track played this session, in order. */
  artists: string[];
  /** Milestone variants already fired this session. */
  milestoneKinds: string[];
  /** artists.length at the last DJ interlude, so the next one waits DJ_EVERY_SONGS. */
  djCount?: number;
}

export interface ProactiveInput {
  now: number;
  enabled: boolean;
  greetingDay: string | null;
  lastWeekly: number | null;
  lastGlobal: number | null;
  session: SessionState | null;
  playLog: { ts: number; artist: string; name: string }[];
}

const DAY = 86_400_000;
const GLOBAL_COOLDOWN_MS = 30 * 60_000;
const WEEK_MS = 7 * DAY;
const SESSION_MINUTES_THRESHOLD = 60;
/** Drop a DJ interlude every N session tracks (gated by the global cooldown too). */
const DJ_EVERY_SONGS = 5;

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/**
 * Pure trigger evaluation. Everything is decidable from local data:
 * no emotion guessing, no external sources. Order matters - greeting and
 * weekly are mount-time checks, milestone rides on track changes.
 */
export function evaluateTriggers(input: ProactiveInput): ProactiveKind[] {
  const { now, enabled } = input;
  if (!enabled) return [];
  const kinds: ProactiveKind[] = [];
  const cooling = Boolean(input.lastGlobal && now - input.lastGlobal < GLOBAL_COOLDOWN_MS);
  if (input.greetingDay !== dayKey(now) && !cooling) kinds.push('greeting');
  if ((!input.lastWeekly || now - input.lastWeekly >= WEEK_MS) && !cooling) kinds.push('weekly');
  const s = input.session;
  if (s && s.milestoneKinds.length < 2 && !cooling) {
    const minutes = (now - s.startedAt) / 60_000;
    if (minutes >= SESSION_MINUTES_THRESHOLD && !s.milestoneKinds.includes('milestone:minutes')) {
      kinds.push('milestone');
    } else {
      const last3 = s.artists.slice(-3);
      const streak =
        last3.length === 3 && last3.every((a) => a && a === last3[0]) && !s.milestoneKinds.includes('milestone:artist');
      if (streak) kinds.push('milestone');
    }
  }
  if (s && !cooling) {
    const sinceDj = s.artists.length - (s.djCount ?? 0);
    if (s.artists.length >= DJ_EVERY_SONGS && sinceDj >= DJ_EVERY_SONGS) kinds.push('dj');
  }
  return kinds;
}

/* ---------------- Data assembly ---------------- */

export type TimeBucket = '凌晨' | '早上' | '午后' | '傍晚' | '深夜';

export function timeBucket(ts: number): TimeBucket {
  const h = new Date(ts).getHours();
  if (h < 5) return '凌晨';
  if (h < 11) return '早上';
  if (h < 17) return '午后';
  if (h < 22) return '傍晚';
  return '深夜';
}

export interface WeekAggregates {
  total: number;
  activeDays: number;
  topSongs: string[];
  topArtists: string[];
  newArtists: string[];
}

function topCounts(counts: Map<string, number>, n: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function aggregateWeek(
  playLog: { ts: number; artist: string; name: string }[],
  now: number,
): WeekAggregates {
  const weekAgo = now - WEEK_MS;
  const week = playLog.filter((e) => e.ts >= weekAgo);
  const beforeArtists = new Set(
    playLog.filter((e) => e.ts < weekAgo).map((e) => e.artist.trim()).filter(Boolean),
  );
  const songs = new Map<string, number>();
  const artists = new Map<string, number>();
  const days = new Set<string>();
  for (const e of week) {
    songs.set(e.name, (songs.get(e.name) ?? 0) + 1);
    const artist = e.artist.split('/')[0]?.trim() ?? '';
    if (artist) artists.set(artist, (artists.get(artist) ?? 0) + 1);
    days.add(dayKey(e.ts));
  }
  const newArtists = [...artists.keys()].filter((a) => !beforeArtists.has(a));
  return {
    total: week.length,
    activeDays: days.size,
    topSongs: topCounts(songs, 3),
    topArtists: topCounts(artists, 3),
    newArtists: newArtists.slice(0, 3),
  };
}

function weekDataText(agg: WeekAggregates): string {
  return (
    '上周听歌数据：共播放 ' + agg.total + ' 次，活跃 ' + agg.activeDays + ' 天。' +
    '最常听歌曲：' + (agg.topSongs.join('、') || '无') +
    '。最常听歌手：' + (agg.topArtists.join('、') || '无') +
    (agg.newArtists.length ? '。新发现的歌手：' + agg.newArtists.join('、') : '')
  );
}

/* ---------------- Storage-backed gates ---------------- */

const GREETING_KEY = 'aurora.proactive.greeting';
const WEEKLY_KEY = 'aurora.proactive.weekly';
const GLOBAL_KEY = 'aurora.proactive.global';
const SESSION_KEY = 'aurora.proactive.session';

function readJson<T>(store: Storage, key: string): T | null {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(store: Storage, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* optional feature */
  }
}

function readGreetingDay(): string | null {
  try {
    return localStorage.getItem(GREETING_KEY);
  } catch {
    return null;
  }
}

function markGreeting(now: number): void {
  try {
    localStorage.setItem(GREETING_KEY, dayKey(now));
  } catch {
    /* ignore */
  }
}

function readWeekly(): number | null {
  const v = readJson<number | null>(localStorage, WEEKLY_KEY);
  return typeof v === 'number' ? v : null;
}

function readGlobal(): number | null {
  const v = readJson<number | null>(localStorage, GLOBAL_KEY);
  return typeof v === 'number' ? v : null;
}

function markGlobal(now: number): void {
  writeJson(localStorage, GLOBAL_KEY, now);
}

function readSession(): SessionState | null {
  return readJson<SessionState>(sessionStorage, SESSION_KEY);
}

/* ---------------- Generation ---------------- */

function localGreeting(bucket: TimeBucket): string {
  const pool: Record<TimeBucket, string[]> = {
    凌晨: ['夜这么深还没睡，来首安静的歌陪着吧。', '凌晨好，我在呢，想听点什么？'],
    早上: ['早上好，用一首轻快的歌开启今天吧。', '早安，今天的第一个音符想交给谁？'],
    午后: ['午后好，适合来点舒服的旋律。', '下午啦，放首歌给自己充充电。'],
    傍晚: ['傍晚了，让音乐陪你收个尾。', '晚上好，今天想从哪首歌开始？'],
    深夜: ['夜深了，声音调小一点，我来陪你。', '深夜电台已就位，今天想听什么？'],
  };
  const list = pool[bucket];
  return list[Math.floor(Date.now() / 60000) % list.length];
}

function localMilestone(minutes: boolean, artist: string | null): string {
  return minutes
    ? '已经连续听了一个小时了，记得让耳朵休息一下。'
    : '连着听好几首' + (artist ?? '同一位歌手') + '了，要不要我再多排几首？';
}

const DJ_LOCAL_LINES = [
  '刚那首不错吧，我接着往下排了几首氛围相近的，不用管我，听就好。',
  '这首听完我把节奏顺了顺，接下来交给运气和旋律。',
  '我在这儿守着队列呢，切歌的事交给我，你只管听。',
];

function localDj(artist: string | null): string {
  const line = DJ_LOCAL_LINES[Math.floor(Date.now() / 60000) % DJ_LOCAL_LINES.length];
  return artist ? '刚才循环到' + artist + '，' + line : line;
}

async function generateText(
  kind: ProactiveKind,
  persona: AiPersona,
  memoryInfo: string,
  dataText: string,
  model: string,
): Promise<string | null> {
  const task =
    kind === 'greeting'
      ? '写一句不超过 40 字的问候，自然结合时段与用户的听歌偏好。不要列表、不要 emoji。'
      : kind === 'milestone'
        ? '写 1-2 句关心或提议（连续听歌较久，或连续听了同一位歌手），口语化。不要列表和 emoji。'
        : kind === 'dj'
          ? '写 1-2 句电台串场：轻轻承接刚才的歌手或歌，再自然引出接下来继续听的音乐氛围。像电台 DJ 顺频道，不要报幕腔。不要列表和 emoji。'
          : '根据数据写 4-6 句上周听歌报告：点名最常听的歌曲与歌手、发现的新口味，并结合长期偏好给一句鼓励或建议。语气自然有温度，不要列表和 emoji。';
  try {
    const text = await chatOnce(
      { model },
      [
        {
          role: 'system',
          content:
            PERSONA_PROMPTS[persona] +
            ' ' +
            task +
            (memoryInfo ? '\n你对用户的长期了解：' + memoryInfo : ''),
        },
        { role: 'user', content: dataText },
      ],
      undefined,
      { maxTokens: kind === 'weekly' ? 500 : 90 },
    );
    const t = text.trim();
    return t || null;
  } catch {
    return null;
  }
}

/* ---------------- Engine-facing API ---------------- */

function buildDataText(
  kind: ProactiveKind,
  playLog: { ts: number; artist: string; name: string }[],
  session: SessionState | null,
  now: number,
): string {
  if (kind === 'greeting') {
    const yesterday = now - DAY;
    const yStart = dayKey(yesterday);
    const yesterdayPlays = playLog.filter((e) => dayKey(e.ts) === yStart);
    const yTop = yesterdayPlays.length
      ? '昨天听了 ' + yesterdayPlays.length + ' 首，最近一首是《' + yesterdayPlays[yesterdayPlays.length - 1].name + '》'
      : '昨天没有听歌记录';
    return '现在是' + timeBucket(now) + '。' + yTop + '。';
  }
  if (kind === 'milestone' && session) {
    const minutes = Math.round((now - session.startedAt) / 60_000);
    const artist = session.artists[session.artists.length - 1] ?? '';
    const streak = session.artists.slice(-3);
    const isStreak = streak.length === 3 && streak.every((a) => a && a === streak[0]);
    return '这个会话已经连续听了约 ' + minutes + ' 分钟' + (isStreak ? '，最近连续 3 首都是 ' + artist : '，当前歌手是 ' + artist) + '。';
  }
  if (kind === 'dj' && session) {
    const recent = session.artists.slice(-5).filter(Boolean);
    const current = session.artists[session.artists.length - 1] ?? '';
    return '这个会话刚听完 ' + session.artists.length + ' 首，最近的歌手依次是：' + (recent.join('、') || current) + '。现在在听 ' + (current || '（未知）') + '。';
  }
  return weekDataText(aggregateWeek(playLog, now));
}

/** AI text for a trigger, or a local-template fallback when AI is unavailable. */
export async function generateProactive(
  kind: ProactiveKind,
  opts: { persona: AiPersona; model: string; aiReady: boolean; memories: AiMemory[]; playLog: PlayLogEntry[]; session: SessionState | null },
): Promise<{ text: string; usedAi: boolean }> {
  const now = Date.now();
  const memoryInfo = memoryBlock(opts.memories);
  const dataText = buildDataText(kind, opts.playLog, opts.session, now);
  if (opts.aiReady && opts.model.trim()) {
    const text = await generateText(kind, opts.persona, memoryInfo, dataText, opts.model);
    if (text) return { text, usedAi: true };
  }
  if (kind === 'greeting') return { text: localGreeting(timeBucket(now)), usedAi: false };
  if (kind === 'milestone') {
    const minutes = opts.session ? (now - opts.session.startedAt) / 60_000 >= 60 : true;
    const artist = opts.session?.artists[opts.session.artists.length - 1] ?? null;
    return { text: localMilestone(minutes, artist), usedAi: false };
  }
  if (kind === 'dj') {
    const artist = opts.session?.artists[opts.session.artists.length - 1] ?? null;
    return { text: localDj(artist), usedAi: false };
  }
  return { text: buildLocalReport(opts.playLog), usedAi: false };
}

/** Mount-time gate check: which mount-time triggers should fire right now? */
export function mountTriggers(now: number, enabled: boolean): ProactiveKind[] {
  return evaluateTriggers({
    now,
    enabled,
    greetingDay: readGreetingDay(),
    lastWeekly: readWeekly(),
    lastGlobal: readGlobal(),
    session: readSession(),
    playLog: [],
  });
}

/** Track-change gate check for milestone triggers. */
export function milestoneTrigger(now: number, enabled: boolean, playLog: { ts: number; artist: string; name: string }[]): boolean {
  return evaluateTriggers({
    now,
    enabled,
    greetingDay: readGreetingDay(),
    lastWeekly: readWeekly(),
    lastGlobal: readGlobal(),
    session: readSession(),
    playLog,
  }).includes('milestone');
}

/** Track-change gate check for DJ interludes. */
export function djTrigger(now: number, enabled: boolean): boolean {
  return evaluateTriggers({
    now,
    enabled,
    greetingDay: readGreetingDay(),
    lastWeekly: readWeekly(),
    lastGlobal: readGlobal(),
    session: readSession(),
    playLog: [],
  }).includes('dj');
}

/** Record that a proactive message of this kind was just shown. */
export function markFired(kind: ProactiveKind, variant: string, now: number): void {
  markGlobal(now);
  if (kind === 'greeting') markGreeting(now);
  if (kind === 'weekly') writeJson(localStorage, WEEKLY_KEY, now);
  if (kind === 'milestone') {
    const s = readSession();
    if (s && !s.milestoneKinds.includes(variant)) {
      s.milestoneKinds.push(variant);
      writeJson(sessionStorage, SESSION_KEY, s);
    }
  }
  if (kind === 'dj') {
    const s = readSession();
    if (s) {
      s.djCount = s.artists.length;
      writeJson(sessionStorage, SESSION_KEY, s);
    }
  }
}

/** Session bookkeeping on every track change (call with the track's artist). */
export function trackSession(artist: string | null, now: number): SessionState {
  let s = readSession();
  if (!s || typeof s.startedAt !== 'number') {
    s = { startedAt: now, artists: [], milestoneKinds: [] };
  }
  if (artist) s.artists.push(artist);
  s.artists = s.artists.slice(-10);
  writeJson(sessionStorage, SESSION_KEY, s);
  return s;
}
