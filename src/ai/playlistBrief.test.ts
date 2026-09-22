import { describe, expect, it } from 'vitest';
import { buildPlaylistPrompt, parseRequestedTracks } from './playlistBrief';

describe('buildPlaylistPrompt', () => {
  it('asks for more tracks than requested, so the unfindable ones do not matter', () => {
    const messages = buildPlaylistPrompt({ theme: '适合下雨天', size: 20 });
    const system = messages[0].content;
    // 20 * 1.5
    expect(system).toContain('30 首');
  });

  it('clamps a silly size rather than passing it through', () => {
    expect(buildPlaylistPrompt({ theme: 'x', size: 500 })[0].content).toContain('50 首');
    // 1 * 1.5 rounds to 2, and the floor is 5.
    expect(buildPlaylistPrompt({ theme: 'x', size: 1 })[0].content).toContain('5 首');
  });

  it('carries the theme and the steer into the user turn', () => {
    const messages = buildPlaylistPrompt({ theme: '深夜写代码', size: 10, avoid: '不要人声' });
    expect(messages[1].content).toContain('深夜写代码');
    expect(messages[1].content).toContain('不要人声');
  });

  it('omits the steer entirely when there is none', () => {
    const messages = buildPlaylistPrompt({ theme: '清晨', size: 10 });
    expect(messages[1].content).not.toContain('避免');
  });
});

describe('parseRequestedTracks', () => {
  it('reads a bare array', () => {
    expect(parseRequestedTracks('[{"title":"晴天","artist":"周杰伦"}]')).toEqual([
      { title: '晴天', artist: '周杰伦' },
    ]);
  });

  it('reads through a code fence', () => {
    const reply = '好的，这是歌单：\n```json\n[{"title":"海阔天空","artist":"Beyond"}]\n```\n希望喜欢！';
    expect(parseRequestedTracks(reply)).toEqual([{ title: '海阔天空', artist: 'Beyond' }]);
  });

  it('reads through a sentence with no fence', () => {
    const reply = '为你挑了这些：[{"title":"起风了","artist":"买辣椒也用券"}]';
    expect(parseRequestedTracks(reply)).toEqual([{ title: '起风了', artist: '买辣椒也用券' }]);
  });

  it('reads an object that wraps the array', () => {
    expect(parseRequestedTracks('{"tracks":[{"title":"A","artist":"B"}]}')).toEqual([
      { title: 'A', artist: 'B' },
    ]);
  });

  it('accepts the field names a model substitutes', () => {
    expect(parseRequestedTracks('[{"name":"A","singer":"B"}]')).toEqual([{ title: 'A', artist: 'B' }]);
  });

  it('joins an artist array', () => {
    expect(parseRequestedTracks('[{"title":"A","artist":["B","C"]}]')).toEqual([
      { title: 'A', artist: 'B C' },
    ]);
  });

  it('recovers the picks from a reply that narrated them', () => {
    // Unparseable as JSON, but the objects are still in there and are still
    // what the user asked for.
    const reply = '第一首是 {"title":"A","artist":"B"}，第二首是 {"title":"C","artist":"D"}';
    expect(parseRequestedTracks(reply)).toEqual([
      { title: 'A', artist: 'B' },
      { title: 'C', artist: 'D' },
    ]);
  });

  it('drops entries with no title instead of inventing one', () => {
    expect(parseRequestedTracks('[{"artist":"B"},{"title":"A","artist":"B"}]')).toEqual([
      { title: 'A', artist: 'B' },
    ]);
  });

  it('keeps a track whose artist is missing - the title can still be searched', () => {
    expect(parseRequestedTracks('[{"title":"A"}]')).toEqual([{ title: 'A', artist: '' }]);
  });

  it('returns nothing for an empty or hopeless reply', () => {
    expect(parseRequestedTracks('')).toEqual([]);
    expect(parseRequestedTracks('抱歉，我无法完成这个请求。')).toEqual([]);
  });
});
