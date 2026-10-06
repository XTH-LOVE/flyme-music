import { describe, expect, it } from 'vitest';
import { parseRss } from './rss';

describe('rss parser', () => {
  it.skipIf(typeof DOMParser === 'undefined')('parses podcast enclosures and resolves relative urls', () => {
    const feed = parseRss(
      '<rss><channel><title>示例</title><item><guid>1</guid><title>第一期</title><enclosure url="audio.mp3"/></item></channel></rss>',
      'https://example.com/feed.xml',
    );
    expect(feed.title).toBe('示例');
    expect(feed.episodes[0]?.audioUrl).toBe('https://example.com/audio.mp3');
  });
});
