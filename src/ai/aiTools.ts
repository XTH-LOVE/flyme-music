import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore, type PlayLogEntry } from '@/store/useLibraryStore';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { useAiStore } from '@/store/useAiStore';
import {
  analyzeTrack,
  describeSimilarity,
  listCachedCards,
  rankSimilar,
  renderFactCard,
  summarizeFactCard,
} from '@/audio/analysis';
import { useThemeStore, type ThemeMode } from '@/store/useThemeStore';
import { navigateAppRoute } from '@/app/navigation';
import { fetchLyricLines, lyricLineAt } from '@/utils/currentLyric';
import { searchAllSources, countSkippedCovers } from './musicSearch';
import { upsertMemories } from './memory';
import type { AiMemoryCategory } from './memory';
import type { MusicTrack } from '@/music/source/types';
import type { AiPersona, AiPlaylistInfo } from '@/store/useAiStore';

export interface ToolResult {
  reply: string;
  tracks?: MusicTrack[];
  playlist?: AiPlaylistInfo;
  played?: boolean;
  /** machine-readable result fed back to the model in the agent loop */
  fact?: Record<string, unknown>;
}

/** Scratchpad for one agent run: latest search results act as the candidate pool. */
export interface ToolCtx {
  found: MusicTrack[];
}

const APP_ROUTES = new Set(['/', '/library', '/discover', '/search', '/playlists', '/me', '/stats', '/settings', '/ai', '/local', '/login']);

function isAllowedAppRoute(path: string): boolean {
  if (APP_ROUTES.has(path)) return true;
  return /^\/(playlist|my-playlist|ne-playlist|album|artist)\/[^/]+$/.test(path)
    || /^\/chart\/(netease|qq)\/[^/]+$/.test(path);
}

function pageName(pathname: string): string {
  if (pathname === '/') return '首页';
  if (pathname === '/library') return '排行榜';
  if (pathname === '/discover') return '发现';
  if (pathname === '/search') return '搜索';
  if (pathname === '/playlists') return '歌单广场';
  if (pathname === '/me') return '我的';
  if (pathname === '/stats') return '听歌统计';
  if (pathname === '/settings') return '设置';
  if (pathname === '/ai') return '一起听';
  if (pathname === '/local') return '本地音乐';
  if (pathname === '/login') return '登录';
  if (pathname.startsWith('/ne-album/')) return '专辑详情';
  if (pathname.startsWith('/ne-artist/')) return '歌手主页';
  if (pathname.startsWith('/chart/')) return '榜单详情';
  if (pathname.startsWith('/album/')) return '专辑详情';
  if (pathname.startsWith('/artist/')) return '艺术家详情';
  if (pathname.startsWith('/my-playlist/')) return '我的歌单详情';
  return '歌单详情';
}

export function buildPageContext(pathname: string, snapshot: ReturnType<typeof usePlayerStore.getState>): string {
  const routePath = pathname.split('?')[0];
  const actions = ['get_app_state', 'navigate', 'open_player', 'toggle_lyrics', 'control'];
  if (routePath === '/search') actions.push('search_tracks');
  if (routePath === '/me' || routePath.startsWith('/my-playlist/')) actions.push('create_playlist');
  if (routePath === '/settings') actions.push('set_theme');
  return JSON.stringify({
    route: pathname,
    page: pageName(routePath),
    availableActions: actions,
    player: {
      status: snapshot.status,
      current: snapshot.current
        ? { name: snapshot.current.name, artist: snapshot.current.artist.join('/'), source: snapshot.current.source }
        : null,
      currentTime: Math.round(snapshot.currentTime),
      duration: Math.round(snapshot.duration),
      queueLength: snapshot.queue.length,
      queueIndex: snapshot.queueIndex,
      shuffle: snapshot.shuffle,
      repeat: snapshot.repeat,
      lyricsMode: snapshot.lyricsMode,
    },
  });
}

export function requiresAgentConfirmation(call: Record<string, unknown>): boolean {
  return String(call.tool ?? '') === 'create_playlist';
}

/* ---------------- Personas ---------------- */

export const PERSONA_PROMPTS: Record<AiPersona, string> = {
  gentle:
    '你叫 Aurora，是温柔体贴的听歌陪伴者。语气轻柔自然，像老朋友一样陪用户听歌、聊歌、找歌。',
  sharp:
    '你叫 Aurora，是毒舌但专业的乐评人。语气犀利幽默，敢吐槽也真心推荐，聊音乐有见解。',
  chuuni:
    '你叫 Aurora，是中二病晚期的深夜电台 DJ。语气夸张热血，爱用感叹号和电台口癖，把每首歌都当成命运的安排。',
};

/* ---------------- Mood / genre keyword map ---------------- */

const MOOD_KEYWORDS: [string[], string][] = [
  [['开心', '高兴', '嗨', '兴奋', '活力'], '欢快 活力'],
  [['丧', '难过', '伤心', '失恋', '孤独', 'emo'], '治愈 伤感'],
  [['专注', '学习', '工作', '写作业'], '纯音乐 专注'],
  [['助眠', '睡觉', '晚安', '安静', '平静'], '轻音乐 助眠'],
  [['放松', '惬意', '慵懒', '舒适'], '轻快 放松'],
  [['深夜', '夜晚', '失眠'], '深夜 安静'],
  [['日语', '日系', '二次元'], '日语'],
  [['国风', '古风', '中国风'], '国风 古风'],
  [['摇滚'], '摇滚'],
  [['民谣'], '民谣'],
  [['电子', '电音', 'edm'], '电子'],
  [['说唱', 'rap', '嘻哈'], '说唱'],
  [['粤语'], '粤语'],
  [['韩语', '韩流', 'kpop'], '韩语'],
  [['欧美', '英文'], '欧美热门'],
  [['经典', '老歌', '怀旧'], '经典老歌'],
  [['情歌', '甜'], '甜蜜情歌'],
];

export function matchMoodKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [words, kw] of MOOD_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return kw;
  }
  return null;
}

/* ---------------- Context builders ---------------- */

export function listeningStatsBlock(playLog: PlayLogEntry[]): string {
  if (!playLog.length) return '（暂无听歌记录）';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayCount = playLog.filter((e) => e.ts >= today.getTime()).length;
  const songs = new Map<string, number>();
  for (const e of playLog) songs.set(e.key, (songs.get(e.key) ?? 0) + 1);
  const top = [...songs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, n]) => {
      const e = playLog.find((x) => x.key === key);
      return (e?.name ?? key) + '(' + n + '次)';
    });
  return '累计播放 ' + playLog.length + ' 首，今日 ' + todayCount + ' 首，常听：' + top.join('、');
}

export function buildSystemPrompt(
  persona: AiPersona,
  current: MusicTrack | null,
  currentTime: number,
  stats: string,
  lyricSnippet: string,
  dislikes: string[],
  appContext = '',
  memoryInfo = '',
): string {
  return (
    PERSONA_PROMPTS[persona] +
    '\n你在 Aurora Music「一起听」页面内，搜歌会并行查网易云与 Joox 双音源，结果自动按原版优先排序（翻唱/现场/伴奏排后）。' +
    '\n当前歌曲：' +
    (current
      ? current.name + ' - ' + current.artist.join('/') + '（已播 ' + Math.round(currentTime) + ' 秒）'
      : '（未在播放）') +
    (lyricSnippet ? '\n当前歌词：' + lyricSnippet : '') +
    (appContext ? '\n当前应用状态：' + appContext : '') +
    (memoryInfo ? '\n你对用户的长期了解（可自然引用，别罗列、别提"记忆"二字）：' + memoryInfo : '') +
    '\n用户听歌记录：' + stats +
    (dislikes.length ? '\n用户不喜欢（搜索时回避）：' + dislikes.join('、') : '') +
    '\n你可以真正操作播放器和 Aurora 页面。工具用法：单独一行输出 ::tool {"tool":"名字",...}。' +
    '\n工具清单：' +
    '\n· search_tracks {"query":"关键词","count":8,"artist":"可选"} —— 双音源搜索，结果进入候选池并按序号返回' +
    '\n· play {"indices":[0,2]} —— 播放候选池里的歌（缺省播第一首）；也可 {"query":"歌名"} 现搜现放' +
    '\n· create_playlist {"title":"歌单名","indices":[..]} —— 用候选池里挑好的歌建歌单；也可 {"title":"..","query":"主题"} 直接建' +
    '\n· queue_similar {} · control {"action":"toggle|next|previous|volume_up|volume_down|lyrics"} · radio {"mood":"心情"}' +
    '\n· get_app_state {} —— 读取当前路由、页面和播放器状态' +
    '\n· navigate {"to":"/settings 或其他 Aurora 路由"} —— 打开应用页面' +
    '\n· open_player {} —— 打开全屏播放器 · toggle_lyrics {} —— 切换歌词页 · set_theme {"mode":"light|dark|system"}' +
    '\n· analyze_song {} —— 本地实测当前歌的音频特征（速度/调性/动态/音色/频段/结构），连同歌词交给你写分析 · find_similar_by_sound {} —— 按**听感**找相似（非关键词） · report {} · dislike {"word":"回避的歌手或风格"} · remember {"category":"artist|genre|mood|fact","content":"要长期记住的事"} —— 用户交代偏好或约定时用' +
    '\n\n行动准则：' +
    '\n· 你有多轮行动能力：每次工具结果会以「[工具结果]」消息返回给你，看完可以继续调用下一个工具（最多连续 6 次），都做完再答复用户。' +
    '\n· 创建歌单属于需要用户确认的操作；先说明歌单名称和预计歌曲数量，等待确认后再执行。' +
    '\n· 建歌单不要拿主题词原样去搜（会搜出一堆歌名里带这个词的歌）：先拆成 2~3 组不同角度的关键词（场景/风格/语种）各搜一次，再从候选池挑风格搭配多样的歌，用序号建单。' +
    '\n· 分析歌必须先调 analyze_song。它返回的是**本地信号分析出的实测数据**（BPM/调性/动态曲线/频谱/结构边界），不是听感结论。' +
    '\n  写分析时：能引用的数字就用数字（「副歌不是靠音量，是靠 1:12 起的动态抬升」远好过「编曲层层递进」）；' +
    '**绝不描述你没测到的东西**（具体乐器、编制、制作手法、混音细节）——那会变成编造；标了「不确定」的项要么不提要么说明没把握。' +
    '\n· 如果 analyze_song 返回音频分析不可用，就只谈歌词，并明确说明你只有歌词层面的信息。' +
    '\n· 想说"像某首歌"时优先用 find_similar_by_sound，它比的是音频听感；只有它没有结果时才退回关键词搜索，并说明区别。' +
    '\n· 可以在调用工具前用一句话说明你要做什么。全部做完后用你的口吻自然总结，别提"工具/候选池/序号/规则"这些词。不要编造歌曲。'
  );
}

/* ---------------- Tool parsing (no fenced-block literals needed) ---------------- */

/** Parse every ::tool call in one model reply (the agent may batch two). */
export function parseToolCalls(text: string): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  const re = /::tool\s*(\{[\s\S]*?\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const obj = tryParseLoose(m[1]);
    if (obj && typeof obj.tool === 'string') calls.push(obj);
  }
  if (!calls.length) {
    // truncated stream: take everything after ::tool and repair the JSON
    const m2 = text.match(/::tool\s*(\{[\s\S]*)/);
    if (m2) {
      const obj = tryParseLoose(m2[1]);
      if (obj && typeof obj.tool === 'string') calls.push(obj);
    }
  }
  if (!calls.length) {
    const m3 = text.match(/(\{[^{}]*"tool"\s*:[\s\S]*?\})/);
    if (m3) {
      const obj = tryParseLoose(m3[1]);
      if (obj && typeof obj.tool === 'string') calls.push(obj);
    }
  }
  return calls;
}

/** JSON.parse with bracket-balancing repair for truncated model output. */
function tryParseLoose(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    /* fall through to repair */
  }
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let repaired = s;
  if (inStr) repaired += '"';
  while (stack.length) repaired += stack.pop();
  try {
    return JSON.parse(repaired) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseToolCall(text: string): Record<string, unknown> | null {
  return parseToolCalls(text)[0] ?? null;
}

/** Human-readable label for the in-chat action chip. */
export function describeToolCall(call: Record<string, unknown>): string {
  const t = String(call.tool ?? '');
  if (t === 'search_tracks' || t === 'search_and_play') return '搜索「' + String(call.query ?? '') + '」';
  if (t === 'play') return '播放歌曲';
  if (t === 'create_playlist') return '创建歌单「' + String(call.title ?? '') + '」';
  if (t === 'queue_similar') return '找相似歌曲';
  if (t === 'find_similar_by_sound') return '按听感找相似';
  if (t === 'radio') return '开播「' + String(call.mood ?? '') + '」电台';
  if (t === 'analyze_song') return '读取歌词分析';
  if (t === 'control') return '控制播放';
  if (t === 'report') return '整理听歌报告';
  if (t === 'dislike') return '记住不喜欢「' + String(call.word ?? '') + '」';
  if (t === 'remember') return '记住了：' + String(call.content ?? '');
  return '执行操作';
}

export function stripToolCall(text: string): string {
  return text
    .replace(/::tool\s*\{[\s\S]*?\}/g, '')
    .replace(/\{[^{}]*"tool"\s*:[\s\S]*?\}/g, '')
    .trim();
}

/* ---------------- Tool executor ---------------- */

function dedupeTracks(tracks: MusicTrack[]): MusicTrack[] {
  const seen = new Set<string>();
  const out: MusicTrack[] = [];
  for (const t of tracks) {
    const key = t.source + ':' + t.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function trackLine(t: MusicTrack): string {
  return '《' + t.name + '》' + t.artist.join('/');
}

function trackFacts(tracks: MusicTrack[]): Record<string, unknown>[] {
  return tracks.map((t, i) => ({ i, name: t.name, artist: t.artist.join('/') }));
}

/**
 * Multi-angle playlist seeding: never search the raw theme alone (that would
 * return songs whose title contains the theme word). Split into several
 * keyword angles and interleave the results for diversity.
 */
async function playlistTracks(theme: string, count: number, dislikes: string[]): Promise<MusicTrack[]> {
  const base = theme.replace(/的?歌单|的?歌|一些/g, '').trim() || theme;
  const seeds = [base];
  const kw = matchMoodKeyword(theme);
  if (kw) seeds.push(kw);
  const flavors = ['轻音乐', '爵士', '民谣', '钢琴 纯音乐', '流行 热门'];
  for (const f of flavors) {
    if (seeds.length >= 4) break;
    seeds.push(base + ' ' + f);
  }
  const batches = await Promise.all(seeds.map((q) => searchAllSources(q, 8, undefined, dislikes)));
  const seen = new Set<string>();
  const out: MusicTrack[] = [];
  const maxLen = batches.reduce((n, b) => Math.max(n, b.length), 0);
  for (let i = 0; i < maxLen && out.length < count; i++) {
    for (const b of batches) {
      const t = b[i];
      if (!t || seen.has(t.source + ':' + t.id)) continue;
      seen.add(t.source + ':' + t.id);
      out.push(t);
      if (out.length >= count) break;
    }
  }
  return out;
}

export async function executeTool(
  call: Record<string, unknown>,
  ctx: ToolCtx = { found: [] },
): Promise<ToolResult> {
  const tool = String(call.tool ?? '');
  const dislikes = useAiStore.getState().dislikes;

  if (tool === 'get_app_state') {
    const snap = usePlayerStore.getState();
    return {
      reply: '已读取当前页面和播放器状态。',
      fact: { action: 'get_app_state', state: JSON.parse(buildPageContext(window.location.pathname, snap)) },
    };
  }

  if (tool === 'navigate') {
    const to = String(call.to ?? '').trim();
    if (!to || !isAllowedAppRoute(to)) {
      return { reply: '这个页面不在 Aurora 的可访问范围内。', fact: { action: 'navigate', error: 'route_not_allowed', to } };
    }
    if (!navigateAppRoute(to)) {
      return { reply: '页面导航暂时不可用，请稍后再试。', fact: { action: 'navigate', error: 'navigation_unavailable', to } };
    }
    return { reply: '已打开「' + pageName(to) + '」。', fact: { action: 'navigate', to, page: pageName(to) } };
  }

  if (tool === 'open_player') {
    const snap = usePlayerStore.getState();
    if (!snap.current) return { reply: '当前没有正在播放的歌曲。', fact: { action: 'open_player', error: 'no_current_track' } };
    snap.openFullPlayer();
    return { reply: '已打开全屏播放器。', fact: { action: 'open_player', opened: true } };
  }

  if (tool === 'toggle_lyrics') {
    usePlayerStore.getState().toggleLyricsMode();
    return { reply: '已切换歌词页。', fact: { action: 'toggle_lyrics', lyricsMode: usePlayerStore.getState().lyricsMode } };
  }

  if (tool === 'set_theme') {
    const mode = String(call.mode ?? '');
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') {
      return { reply: '主题只支持浅色、深色或跟随系统。', fact: { action: 'set_theme', error: 'invalid_mode', mode } };
    }
    useThemeStore.getState().setMode(mode as ThemeMode);
    return { reply: '已切换为' + (mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '跟随系统') + '主题。', fact: { action: 'set_theme', mode } };
  }

  if (tool === 'search_tracks' || tool === 'search_and_play') {
    const query = String(call.query ?? '').trim();
    const artist = call.artist ? String(call.artist) : undefined;
    const count = Math.min(12, Math.max(3, Number(call.count ?? 8) || 8));
    const wantsPlay = tool === 'search_and_play' ? call.play !== false : call.play === true;
    if (!query) return { reply: '（没拿到搜索词，换种说法试试？）' };
    const tracks = await searchAllSources(query, count, artist, dislikes);
    if (!tracks.length) return { reply: '两个音源都没搜到「' + query + '」，换个关键词试试？' };
    ctx.found = tracks;
    const skipped = countSkippedCovers(tracks, query);
    const top = tracks[0];
    if (wantsPlay) {
      playerController.playTracks(tracks, 0);
      return {
        reply: '已经帮你放上《' + top.name + '》- ' + top.artist.join('/'),
        tracks,
        played: true,
        fact: {
          action: 'play',
          nowPlaying: trackLine(top),
          note: (skipped ? '已把 ' + skipped + ' 个翻唱/现场版本排后；' : '') + '要换歌可从 candidates 里挑序号再调 play',
          candidates: trackFacts(tracks),
        },
      };
    }
    return {
      reply: '搜索「' + query + '」完成，候选池已更新（' + tracks.length + ' 首）',
      tracks,
      fact: { action: 'search', query, poolSize: tracks.length, candidates: trackFacts(tracks) },
    };
  }

  if (tool === 'play') {
    const idxs = Array.isArray(call.indices)
      ? call.indices.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < ctx.found.length)
      : [];
    let list = idxs.length ? dedupeTracks(idxs.map((i) => ctx.found[i])) : ctx.found;
    if (!idxs.length && call.query) {
      const searched = await searchAllSources(String(call.query), 8, undefined, dislikes);
      if (searched.length) {
        ctx.found = searched;
        list = searched;
      }
    }
    if (!list.length) {
      return { reply: '候选池是空的，先 search_tracks 搜一次。', fact: { action: 'play', error: '候选池为空' } };
    }
    playerController.playTracks(list, 0);
    return {
      reply: '已播放《' + list[0].name + '》',
      tracks: list,
      played: true,
      fact: { action: 'play', nowPlaying: trackLine(list[0]), candidates: trackFacts(list) },
    };
  }

  if (tool === 'create_playlist') {
    const title = String(call.title ?? '').trim();
    const idxs = Array.isArray(call.indices)
      ? call.indices.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < ctx.found.length)
      : [];
    const count = Math.min(20, Math.max(5, Number(call.count ?? 12) || 12));
    let tracks: MusicTrack[] = [];
    if (idxs.length) {
      tracks = dedupeTracks(idxs.map((i) => ctx.found[i]));
    } else {
      const query = String(call.query ?? '').trim() || title;
      if (!query) return { reply: '（建歌单需要一个主题，再描述一下？）' };
      tracks = await playlistTracks(query, count, dislikes);
    }
    if (tracks.length < 3) {
      return { reply: '搜到的歌太少，歌单没建成，换个主题试试？', fact: { action: 'create_playlist', error: '候选不足' } };
    }
    const finalTitle = title || String(call.query ?? '灵感') + ' 歌单';
    const store = usePlaylistStore.getState();
    const id = store.createPlaylist(finalTitle);
    store.addBatch(id, tracks);
    return {
      reply: '建好啦！「' + finalTitle + '」一共 ' + tracks.length + ' 首，已存进你的歌单，点卡片可以打开或整单播放：',
      playlist: { id, name: finalTitle, tracks },
      fact: { action: 'create_playlist', title: finalTitle, count: tracks.length, tracks: trackFacts(tracks) },
    };
  }

  if (tool === 'queue_similar') {
    const current = usePlayerStore.getState().current;
    if (!current) return { reply: '现在没在放歌，先放一首我才能帮你找类似的。' };
    const tracks = await searchAllSources(current.artist[0] ?? current.name, 10, current.artist[0], dislikes);
    const similar = tracks
      .filter((t) => !(t.id === current.id && t.source === current.source))
      .slice(0, 8);
    if (!similar.length) return { reply: '没能找到类似的歌…' };
    ctx.found = similar;
    playerController.addToQueue(similar);
    return {
      reply: '把 ' + similar.length + ' 首相似歌曲加进队列了，接着听就好。',
      tracks: similar,
      fact: { action: 'queue_similar', added: similar.length, tracks: trackFacts(similar) },
    };
  }

  if (tool === 'control') {
    const action = String(call.action ?? '');
    const snap = usePlayerStore.getState();
    switch (action) {
      case 'toggle':
        playerController.toggle();
        return { reply: snap.status === 'playing' ? '好，先暂停。' : '继续播放~', fact: { action: 'control', did: 'toggle' } };
      case 'next':
        playerController.next();
        return { reply: '切下一首！', fact: { action: 'control', did: 'next' } };
      case 'previous':
        playerController.previous();
        return { reply: '回到上一首。', fact: { action: 'control', did: 'previous' } };
      case 'volume_up':
        playerController.setVolume(Math.min(1, snap.volume + 0.15));
        return { reply: '声音调大了一点。', fact: { action: 'control', did: 'volume_up' } };
      case 'volume_down':
        playerController.setVolume(Math.max(0, snap.volume - 0.15));
        return { reply: '声音调小了一点。', fact: { action: 'control', did: 'volume_down' } };
      case 'lyrics':
        snap.toggleLyricsMode();
        return { reply: '歌词页切换好啦。', fact: { action: 'control', did: 'lyrics' } };
      default:
        return { reply: '（没听懂要控制什么）', fact: { action: 'control', error: '未知 action' } };
    }
  }

  if (tool === 'radio') {
    const mood = String(call.mood ?? '');
    const kw = matchMoodKeyword(mood) ?? (mood.trim() || '轻松');
    const tracks = await searchAllSources(kw, 10, undefined, dislikes);
    if (!tracks.length) return { reply: '这个心情的歌没搜到，换个心情试试？' };
    ctx.found = tracks;
    playerController.playTracks(tracks, 0);
    return {
      reply: '「' + mood + '」电台开播！给你排了 ' + tracks.length + ' 首。',
      tracks,
      played: true,
      fact: { action: 'radio', mood, nowPlaying: trackLine(tracks[0]), candidates: trackFacts(tracks) },
    };
  }

  if (tool === 'analyze_song') {
    const current = usePlayerStore.getState().current;
    if (!current) return { reply: '现在没在放歌，没法分析。', fact: { action: 'analyze_song', error: '未在播放' } };

    let lyric = '';
    try {
      const lines = await fetchLyricLines(current);
      lyric = lines.map((l) => l.text).filter(Boolean).slice(0, 60).join('\n');
    } catch {
      /* ignore - an instrumental still has audio to analyse */
    }

    // Analyse the audio itself. This is the whole point: the model is given
    // measurements of the actual recording rather than being asked to describe
    // a melody it has never heard.
    let factCard = '';
    let analysisError = '';
    try {
      const card = await analyzeTrack(current);
      if (card) factCard = renderFactCard(card);
      else analysisError = 'no_stream';
    } catch {
      analysisError = 'analysis_failed';
    }

    if (!factCard) {
      // Be explicit rather than letting the model fill the gap with invention.
      return {
        reply: '',
        fact: {
          action: 'analyze_song',
          song: current.name,
          artist: current.artist.join('/'),
          hasLyric: Boolean(lyric),
          lyric,
          audioAnalysis: null,
          note:
            '音频分析不可用（' +
            analysisError +
            '）。**你没有任何音频测量数据**，所以不要描述编曲、配器、制作或旋律走向。' +
            '只能基于歌词与歌名来谈，并明确说明你听到的只是歌词层面的内容。',
        },
      };
    }

    return {
      reply: '',
      fact: {
        action: 'analyze_song',
        song: current.name,
        artist: current.artist.join('/'),
        hasLyric: Boolean(lyric),
        audioAnalysis: factCard,
        lyric,
        note:
          '上面是这首歌的**实测音频特征**。写分析时以它为依据：可以引用具体数字，' +
          '但不要描述没有测到的内容（具体乐器、编制、混音手法）。' +
          '如果某项标了「不确定」，要么不提，要么说明你没把握。',
      },
    };
  }

  if (tool === 'find_similar_by_sound') {
    const current = usePlayerStore.getState().current;
    if (!current) return { reply: '现在没在放歌，没法比对。', fact: { action: 'find_similar_by_sound', error: 'no_current_track' } };

    const target = await analyzeTrack(current);
    if (!target) {
      return {
        reply: '这首歌的音频暂时取不到，没法做听感比对，我改用关键词找找看。',
        fact: { action: 'find_similar_by_sound', error: 'no_analysis' },
      };
    }

    // Rank whatever has already been analysed locally. Nothing new is
    // downloaded here: analysing the whole library on demand would be a
    // multi-minute operation.
    const cached = await listCachedCards();
    const candidates = cached
      .filter((c) => c.trackKey !== target.trackKey)
      .map((c) => ({ item: c, features: c }));
    const ranked = rankSimilar(target, candidates, 8, 0.9);

    if (!ranked.length) {
      return {
        reply: '我听过并分析过的歌里，还没有和这首听感接近的。多放几首我就能比出来了。',
        fact: {
          action: 'find_similar_by_sound',
          song: current.name,
          analyzed: cached.length,
          matches: [],
          note: '这是基于已分析曲库的结果，不是全曲库。不要声称曲库里没有相似歌曲。',
        },
      };
    }

    return {
      reply: '',
      fact: {
        action: 'find_similar_by_sound',
        song: current.name,
        summary: summarizeFactCard(target),
        analyzed: cached.length,
        matches: ranked.map((r) => ({
          name: r.item.name,
          artist: r.item.artist,
          score: Number(r.score.toFixed(3)),
          why: describeSimilarity(r.reason),
        })),
        note: '这是**音频听感**的相似（速度/明暗/频段/节奏密度/动态），不是关键词匹配。说明像在哪，别只说「风格相似」。',
      },
    };
  }

  if (tool === 'report') {
    const report = buildLocalReport(useLibraryStore.getState().playLog);
    return { reply: report, fact: { action: 'report', report } };
  }

  if (tool === 'explain_lyric') {
    const current = usePlayerStore.getState().current;
    const time = usePlayerStore.getState().currentTime;
    if (!current) return { reply: '现在没在放歌，没法解读歌词。' };
    const lines = await fetchLyricLines(current);
    const line = lyricLineAt(lines, time);
    if (!line) return { reply: '这句没有歌词，等下一句试试。' };
    return {
      reply:
        '当前这句是：「' + line.text + '」' + (line.trans ? '（译文：' + line.trans + '）' : '') +
        '\n说说你对这句的感受吧，我陪你聊聊。',
    };
  }

  if (tool === 'remember') {
    const rawCategory = String(call.category ?? 'fact');
    const category = (['artist', 'genre', 'mood', 'fact', 'dislike'].includes(rawCategory) ? rawCategory : 'fact') as AiMemoryCategory;
    const content = String(call.content ?? '').trim();
    if (!content || content.length > 200) {
      return { reply: '（这条想记的内容太长或为空，换个说法？）', fact: { action: 'remember', error: 'bad_content' } };
    }
    void upsertMemories([{ category, content }]).catch(() => undefined);
    return { reply: '记住了：' + content, fact: { action: 'remember', category, content } };
  }

  if (tool === 'dislike') {
    const word = String(call.word ?? '').trim();
    if (!word) return { reply: '（告诉我不喜欢谁/什么风格，我记下来。）' };
    useAiStore.getState().addDislike(word);
    void upsertMemories([{ category: 'dislike', content: word }]).catch(() => undefined);
    return { reply: '记住了，以后找歌会避开「' + word + '」。', fact: { action: 'dislike', avoid: word } };
  }

  return { reply: '（未知工具）' };
}

/* ---------------- Local report ---------------- */

export function buildLocalReport(playLog: PlayLogEntry[]): string {
  if (!playLog.length) return '你还没听过歌，先去放一首，我再给你写报告。';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEntries = playLog.filter((e) => e.ts >= today.getTime());
  const songCount = new Map<string, { name: string; artist: string; n: number }>();
  const artistCount = new Map<string, number>();
  for (const e of playLog) {
    const s = songCount.get(e.key) ?? { name: e.name, artist: e.artist, n: 0 };
    s.n += 1;
    songCount.set(e.key, s);
    for (const a of e.artist.split('/').map((x) => x.trim()).filter(Boolean)) {
      artistCount.set(a, (artistCount.get(a) ?? 0) + 1);
    }
  }
  const topSong = [...songCount.values()].sort((a, b) => b.n - a.n)[0];
  const topArtist = [...artistCount.entries()].sort((a, b) => b[1] - a[1])[0];
  return (
    '📊 听歌报告\n' +
    '累计播放 ' + playLog.length + ' 次，今天听了 ' + todayEntries.length + ' 首。\n' +
    '单曲循环之王：《' + (topSong?.name ?? '-') + '》' + (topSong ? '（' + topSong.n + ' 次）' : '') + '\n' +
    '最爱歌手：' + (topArtist ? topArtist[0] + '（' + topArtist[1] + ' 次）' : '-') + '\n' +
    '共听过 ' + songCount.size + ' 首不同的歌。'
  );
}

/* ---------------- No-key rule engine (v2) ---------------- */

const PLAYLIST_NAME_RE = /(?:建|创建|做|来)(?:一个|个|份)?(.{1,14}?)歌单/;

export async function localAssistant(text: string): Promise<ToolResult> {
  const t = text.trim();
  const snap = usePlayerStore.getState();
  const extrasStore = await import('@/store/useExtrasStore');
  const extras = extrasStore.useExtrasStore.getState();
  const aiStore = useAiStore.getState();

  // Keep imperative playback commands ahead of the generic search branch.
  // "暂停" must be idempotent, while "播放 歌名" must still search.
  if (/(暂停|停止)/.test(t)) { playerController.pause(); return { reply: '好，暂停了。' }; }
  if (/^(继续|恢复)(播放)?(?:一下)?[。！!]?$/i.test(t) && snap.status === 'paused') {
    playerController.toggle();
    return { reply: '继续播放~' };
  }
  if (/下一首|切歌/.test(t)) { playerController.next(); return { reply: '下一首！' }; }
  if (/上一首/.test(t)) { playerController.previous(); return { reply: '回到上一首。' }; }
  if (/大点声|音量.*大/.test(t)) { playerController.setVolume(Math.min(1, snap.volume + 0.15)); return { reply: '调大了。' }; }
  if (/小点声|音量.*小/.test(t)) { playerController.setVolume(Math.max(0, snap.volume - 0.15)); return { reply: '调小了。' }; }
  const speedMatch = t.match(/(\d(?:\.\d+)?)\s*倍速/);
  if (speedMatch) { extras.setSpeed(Number(speedMatch[1])); return { reply: '已切到 ' + speedMatch[1] + ' 倍速。' }; }
  if (/报告/.test(t)) return { reply: buildLocalReport(useLibraryStore.getState().playLog) };
  if (/类似|像这首|再来点/.test(t)) return executeTool({ tool: 'queue_similar' });

  const dislikeMatch = t.match(/(?:不喜欢|讨厌|别放|避开)(.{1,12})/);
  if (dislikeMatch) {
    const word = dislikeMatch[1].replace(/的|了|这种|这类|歌|歌手|音乐|风格|的?歌/g, '').trim() || snap.current?.artist[0] || '';
    if (word) {
      aiStore.addDislike(word);
      return { reply: '记住了，以后避开「' + word + '」。' };
    }
  }

  const playlistMatch = t.match(PLAYLIST_NAME_RE);
  if (playlistMatch) {
    const theme = playlistMatch[1].trim() || '灵感';
    return executeTool({ tool: 'create_playlist', title: theme + ' 歌单', query: theme, count: 12 });
  }

  const kw = matchMoodKeyword(t);
  const wantsPlay = /播放|放一首|放首|我要听|我想听|来一首|给我放/.test(t);
  if (kw || /想听|来点|找.*歌|搜|播放/.test(t)) {
    const cleaned = t.replace(/想听|来点|给我|找|搜|播放|放一首|放首|我要听|我想听|来一首|给我放|的|歌|一些|一首|首|点|我想|我要|听|吧|请|帮我|一下|想|要|来|点|几|些|好|吗|呢|啊|哦|呀|～|~/g, '').trim();
    const query = kw ?? (cleaned || '热门');
    return executeTool({ tool: 'search_and_play', query, count: 8, play: wantsPlay });
  }

  return {
    reply:
      '我（本地模式）能做的：\n· 「播放周杰伦 晴天」→ 双音源找原版直接放\n· 「建个雨天歌单」→ 真的帮你建好保存\n· 「暂停 / 下一首 / 1.5倍速」→ 播控\n· 「不喜欢 xxx」→ 以后避开\n填上 AI Key 后，还能陪你聊歌、解读歌词、按心情开电台。',
  };
}
