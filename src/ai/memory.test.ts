import { describe, expect, it } from 'vitest';
import { mergeMemories, memoryBlock, parseMemoryOps, type AiMemory } from './memory';

const mem = (i: number, category: AiMemory['category'], content: string, weight = 1, lastSeenAt = 1000): AiMemory => ({
  id: 'id' + i, category, content, weight, lastSeenAt,
});

describe('mergeMemories', () => {
  it('adds a brand-new memory', () => {
    const { list, changed } = mergeMemories([], [{ category: 'artist', content: '周杰伦' }], 2000);
    expect(changed).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ category: 'artist', content: '周杰伦', weight: 1, lastSeenAt: 2000 });
  });

  it('reinforces an exact duplicate (category+content, trimmed) instead of duplicating', () => {
    const { list, changed } = mergeMemories(
      [mem(0, 'artist', '周杰伦')],
      [{ category: 'artist', content: ' 周杰伦 ' }],
      2000,
    );
    expect(changed).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0].weight).toBe(2);
    expect(list[0].lastSeenAt).toBe(2000);
  });

  it('same content under a different category is a separate memory', () => {
    const { list } = mergeMemories(
      [mem(0, 'artist', '周杰伦')],
      [{ category: 'genre', content: '周杰伦' }],
      2000,
    );
    expect(list).toHaveLength(2);
  });

  it('enforces the 50-entry cap, evicting lowest weight then oldest', () => {
    let list: AiMemory[] = [];
    for (let i = 0; i < 49; i++) list = mergeMemories(list, [{ category: 'fact', content: '事' + i }], 1000 + i).list;
    list = mergeMemories(list, [{ category: 'fact', content: '重要' }], 1049).list;
    const important = list.find((m) => m.content === '重要')!;
    important.weight = 5;
    const { list: after } = mergeMemories(list, [{ category: 'fact', content: '压轴新条目' }], 3000);
    expect(after).toHaveLength(50);
    expect(after.some((m) => m.content === '压轴新条目')).toBe(true);
    expect(after.some((m) => m.content === '事0')).toBe(false);
    expect(after.some((m) => m.content === '重要')).toBe(true);
  });

  it('returns changed=false for empty ops', () => {
    expect(mergeMemories([mem(0, 'mood', '深夜')], [], 2000).changed).toBe(false);
  });
});

describe('parseMemoryOps', () => {
  it('parses a clean JSON array', () => {
    expect(parseMemoryOps('[{"category":"artist","content":"周杰伦"}]')).toEqual([
      { category: 'artist', content: '周杰伦' },
    ]);
  });

  it('parses JSON embedded in chatty output', () => {
    const out = '好的，我记下来了：```json\n[{"category":"genre","content":"国风"}]\n```';
    expect(parseMemoryOps(out)).toEqual([{ category: 'genre', content: '国风' }]);
  });

  it('drops invalid categories and oversized/empty content', () => {
    const raw = JSON.stringify([
      { category: 'nope', content: 'x' },
      { category: 'fact', content: '' },
      { category: 'fact', content: '长'.repeat(201) },
      { category: 'mood', content: '深夜学习' },
    ]);
    expect(parseMemoryOps(raw)).toEqual([{ category: 'mood', content: '深夜学习' }]);
  });

  it('returns [] on garbage / truncated output', () => {
    expect(parseMemoryOps('我今天不想记东西')).toEqual([]);
    expect(parseMemoryOps('[{"category":"fact","content":"截断')).toEqual([]);
  });
});

describe('memoryBlock', () => {
  it('compresses by category with Chinese labels, artist first', () => {
    const block = memoryBlock([
      mem(0, 'genre', '国风'), mem(1, 'artist', '周杰伦'), mem(2, 'fact', '周五想听新专辑'),
    ]);
    expect(block).toContain('喜欢的歌手：周杰伦');
    expect(block).toContain('喜欢的风格：国风');
    expect(block).toContain('交代过的事：周五想听新专辑');
    expect(block.indexOf('喜欢的歌手')).toBeLessThan(block.indexOf('交代过的事'));
  });

  it('returns empty string when no memories', () => {
    expect(memoryBlock([])).toBe('');
  });
});
