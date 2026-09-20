// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicTrack } from '@/music/source/types';
import { playerController } from '@/player';

/**
 * The analysis tools were added without any coverage of the dispatch layer, and
 * the branches that matter most are the ones where data is *missing*: each must
 * tell the model it has nothing, because the alternative is a model describing
 * an arrangement it never measured.
 */

const h = vi.hoisted(() => ({
  current: null as MusicTrack | null,
  analyzeTrack: vi.fn(),
  listCachedCards: vi.fn(),
  rankSimilar: vi.fn(),
  liveStatus: vi.fn(),
  readLiveWindow: vi.fn(),
  buildTasteProfile: vi.fn(),
  fetchLyricLines: vi.fn(),
  addToQueue: vi.fn(),
  searchAllSources: vi.fn(),
}));

vi.mock('@/player', () => ({
  playerController: {
    addToQueue: h.addToQueue,
    playTracks: vi.fn(),
    setVolume: vi.fn(),
    seek: vi.fn(),
    toggle: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    clearUpNext: vi.fn(),
  },
}));

vi.mock('@/store/usePlayerStore', () => ({
  usePlayerStore: {
    getState: () => ({
      current: h.current,
      status: 'playing',
      currentTime: 0,
      duration: 200,
      volume: 0.8,
      queue: [],
      queueIndex: -1,
      shuffle: false,
      repeat: 'off',
      fullPlayerOpen: false,
      lyricsMode: false,
      openFullPlayer: vi.fn(),
      toggleLyricsMode: vi.fn(),
    }),
  },
}));

vi.mock('@/audio/analysis', () => ({
  analyzeTrack: h.analyzeTrack,
  listCachedCards: h.listCachedCards,
  rankSimilar: h.rankSimilar,
  liveStatus: h.liveStatus,
  readLiveWindow: h.readLiveWindow,
  buildTasteProfile: h.buildTasteProfile,
  describeLiveWindow: () => '响度 -18 dB，谱重心 1840 Hz（中性）',
  describeSimilarity: () => '速度接近、音色明暗接近',
  renderFactCard: () => '【实测音频特征】速度：约 92 BPM',
  renderTasteProfile: () => '【本地听感画像】基于已分析过的 6 首歌',
  summarizeFactCard: () => '92 BPM · A小调',
  MIN_PROFILE_TRACKS: 5,
}));

vi.mock('@/utils/currentLyric', () => ({
  fetchLyricLines: h.fetchLyricLines,
  lyricLineAt: () => null,
}));

vi.mock('./musicSearch', () => ({
  searchAllSources: (...args: unknown[]) => h.searchAllSources(...args),
  countSkippedCovers: () => 0,
}));

vi.mock('./memory', () => ({
  upsertMemories: vi.fn(async () => undefined),
}));

const { executeTool } = await import('./aiTools');

function track(id = 't1'): MusicTrack {
  return {
    id,
    name: 'Song',
    artist: ['Artist'],
    album: 'Album',
    pic_id: 'p',
    url_id: 'u',
    lyric_id: 'l',
    source: 'netease',
  };
}

const factOf = (result: { fact?: unknown }) => result.fact as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  h.current = track();
  h.fetchLyricLines.mockResolvedValue([{ time: 0, text: 'line one' }]);
  h.liveStatus.mockReturnValue({ available: true, reason: 'ok', message: '' });
  h.listCachedCards.mockResolvedValue([]);
  h.rankSimilar.mockReturnValue([]);
  h.buildTasteProfile.mockReturnValue(null);
  h.searchAllSources.mockResolvedValue([]);
});

describe('analyze_song', () => {
  it('hands the model the measured card when analysis succeeds', async () => {
    h.analyzeTrack.mockResolvedValue({ trackKey: 'k', vector: [1] });
    const result = await executeTool({ tool: 'analyze_song' });
    const fact = factOf(result);
    expect(fact.audioAnalysis).toContain('实测音频特征');
    expect(String(fact.note)).toContain('不要描述没有测到的内容');
  });

  it('states plainly that there is no audio data when analysis fails', async () => {
    // The whole point of the feature: a model with no measurements must be told
    // so, not left to fill the gap with an invented arrangement.
    h.analyzeTrack.mockResolvedValue(null);
    const result = await executeTool({ tool: 'analyze_song' });
    const fact = factOf(result);
    expect(fact.audioAnalysis).toBeNull();
    expect(String(fact.note)).toContain('你没有任何音频测量数据');
    expect(String(fact.note)).toContain('不要描述编曲');
  });

  it('still passes the lyrics through when the audio cannot be analysed', async () => {
    h.analyzeTrack.mockResolvedValue(null);
    const result = await executeTool({ tool: 'analyze_song' });
    expect(factOf(result).lyric).toContain('line one');
  });

  it('reports the failure reason', async () => {
    h.analyzeTrack.mockRejectedValue(new Error('boom'));
    const result = await executeTool({ tool: 'analyze_song' });
    expect(String(factOf(result).note)).toContain('analysis_failed');
  });

  it('refuses when nothing is playing', async () => {
    h.current = null;
    const result = await executeTool({ tool: 'analyze_song' });
    expect(result.reply).toContain('没在放歌');
    expect(h.analyzeTrack).not.toHaveBeenCalled();
  });
});

describe('describe_moment', () => {
  it('returns the live reading when available', async () => {
    h.readLiveWindow.mockReturnValue({ windowMs: 46, rmsDb: -18, centroidHz: 1840, bands: { low: 0.3, mid: 0.5, high: 0.2 }, flux: 0.1, rmsTrendDb: 0, centroidTrendHz: 0 });
    const result = await executeTool({ tool: 'describe_moment' });
    const fact = factOf(result);
    expect(fact.available).toBe(true);
    expect(String(fact.reading)).toContain('谱重心');
  });

  it('passes the user-facing reason through when unavailable', async () => {
    h.liveStatus.mockReturnValue({
      available: false,
      reason: 'not_wired',
      message: '当前音频没有接入 Web Audio…开启「节奏频谱」…',
    });
    const result = await executeTool({ tool: 'describe_moment' });
    expect(result.reply).toContain('节奏频谱');
    expect(factOf(result).available).toBe(false);
    expect(factOf(result).reason).toBe('not_wired');
  });

  it('tells the model not to describe the current moment when it has no data', async () => {
    h.liveStatus.mockReturnValue({ available: false, reason: 'not_wired', message: 'x' });
    const result = await executeTool({ tool: 'describe_moment' });
    expect(String(factOf(result).note)).toContain('没有实时音频数据');
    expect(String(factOf(result).note)).toContain('不要描述');
  });

  it('never reports unavailable as a silent zero reading', async () => {
    h.liveStatus.mockReturnValue({ available: false, reason: 'not_playing', message: '没在播放' });
    const result = await executeTool({ tool: 'describe_moment' });
    expect(factOf(result).reading).toBeUndefined();
    expect(h.readLiveWindow).not.toHaveBeenCalled();
  });
});

describe('taste_profile', () => {
  it('refuses below the minimum sample and says how many are needed', async () => {
    h.listCachedCards.mockResolvedValue([{ trackKey: 'a' }, { trackKey: 'b' }]);
    const result = await executeTool({ tool: 'taste_profile' });
    expect(result.reply).toContain('2 首');
    expect(result.reply).toContain('5');
    expect(factOf(result).profile).toBeNull();
  });

  it('returns the profile once there is enough to go on', async () => {
    h.listCachedCards.mockResolvedValue(new Array(6).fill({ trackKey: 'x' }));
    h.buildTasteProfile.mockReturnValue({ trackCount: 6 });
    const result = await executeTool({ tool: 'taste_profile' });
    expect(String(factOf(result).profile)).toContain('本地听感画像');
    expect(String(factOf(result).note)).toContain('样本量');
  });
});

describe('find_similar_by_sound', () => {
  it('queues acoustic matches when they exist', async () => {
    h.analyzeTrack.mockResolvedValue({ trackKey: 'k', vector: [1] });
    const other = track('t2');
    h.listCachedCards.mockResolvedValue([{ trackKey: 'other', track: other }]);
    h.rankSimilar.mockReturnValue([{ item: other, score: 0.95, reason: {} }]);
    const result = await executeTool({ tool: 'find_similar_by_sound' });
    expect(factOf(result).matches).toHaveLength(1);
    expect(String(factOf(result).note)).toContain('音频听感');
  });

  it('admits the pool is partial rather than claiming nothing exists', async () => {
    h.analyzeTrack.mockResolvedValue({ trackKey: 'k', vector: [1] });
    h.listCachedCards.mockResolvedValue([]);
    h.rankSimilar.mockReturnValue([]);
    const result = await executeTool({ tool: 'find_similar_by_sound' });
    expect(result.reply).toContain('还没有');
    expect(String(factOf(result).note)).toContain('不是全曲库');
  });

  it('says so when the track itself cannot be analysed', async () => {
    h.analyzeTrack.mockResolvedValue(null);
    const result = await executeTool({ tool: 'find_similar_by_sound' });
    expect(factOf(result).error).toBe('no_analysis');
  });
});

describe('queue_similar', () => {
  it('labels the method so keyword results are not passed off as acoustic', async () => {
    // Falling back is fine; calling the fallback "similar sounding" is not.
    h.analyzeTrack.mockResolvedValue(null); // no acoustic index to work from
    h.searchAllSources.mockResolvedValue([track('t9'), track('t10')]);
    const result = await executeTool({ tool: 'queue_similar' });
    expect(factOf(result).method).toBe('keyword');
    expect(String(factOf(result).note)).toContain('不是听感相似');
  });

  it('reports a fact even when the keyword search finds nothing', async () => {
    // Every other tool tells the model what happened; this one used to return a
    // bare string, leaving the caller to guess.
    h.analyzeTrack.mockResolvedValue(null);
    h.searchAllSources.mockResolvedValue([]);
    const result = await executeTool({ tool: 'queue_similar' });
    expect(factOf(result).added).toBe(0);
    expect(factOf(result).method).toBe('keyword');
  });

  it('prefers acoustic matches when the index has them', async () => {
    h.analyzeTrack.mockResolvedValue({ trackKey: 'k', vector: [1] });
    const matches = [track('a'), track('b'), track('c')];
    h.listCachedCards.mockResolvedValue(matches.map((t) => ({ trackKey: t.id, track: t })));
    h.rankSimilar.mockReturnValue(matches.map((item) => ({ item, score: 0.95, reason: {} })));
    const result = await executeTool({ tool: 'queue_similar' });
    expect(factOf(result).method).toBe('acoustic');
    expect(h.searchAllSources).not.toHaveBeenCalled();
  });
});

describe('control seek', () => {
  beforeEach(() => {
    vi.mocked(playerController.seek).mockClear();
  });

  it('seeks to a boundary the analysis measured', async () => {
    const result = await executeTool({ tool: 'control', action: 'seek', seconds: 58 });
    expect(playerController.seek).toHaveBeenCalledWith(58);
    expect(result.reply).toContain('0:58');
  });

  it('clamps a boundary past the end of the track', async () => {
    // The mocked snapshot reports duration 200; seeking past it would stop the
    // element at the end instead of playing anything.
    await executeTool({ tool: 'control', action: 'seek', seconds: 500 });
    expect(playerController.seek).toHaveBeenCalledWith(199);
  });

  it('refuses a seek with no usable timestamp', async () => {
    // The prompt says seconds must come from measured boundaries; a missing or
    // malformed value must not become a silent jump to zero.
    const missing = await executeTool({ tool: 'control', action: 'seek' });
    expect(playerController.seek).not.toHaveBeenCalled();
    expect(missing.reply).toContain('不知道');

    await executeTool({ tool: 'control', action: 'seek', seconds: -3 });
    expect(playerController.seek).not.toHaveBeenCalled();
  });
});
