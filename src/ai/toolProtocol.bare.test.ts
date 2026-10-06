import { describe, expect, it } from 'vitest';
import { parseNormalizedToolCalls, stripToolSyntax } from './toolProtocol';

describe('bare tool syntax', () => {
  it('parses a model that omits the ::tool marker', () => {
    const calls = parseNormalizedToolCalls('find_similar_by_sound {}');
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('find_similar_by_sound');
  });

  it('removes bare tool syntax from visible text', () => {
    expect(stripToolSyntax('我来换一首\nfind_similar_by_sound {}')).toBe('我来换一首');
  });
});
