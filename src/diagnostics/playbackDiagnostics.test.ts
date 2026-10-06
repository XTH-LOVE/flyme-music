import { describe, expect, it } from 'vitest';
import { collectPlaybackDiagnostics } from './playbackDiagnostics';

describe('playback diagnostics', () => {
  it('returns an empty snapshot when idle', async () => {
    await expect(collectPlaybackDiagnostics(null)).resolves.toEqual({
      track: null,
      source: null,
      lyrics: null,
      prefetch: null,
      cached: false,
      downloads: expect.any(Object),
      urlError: null,
    });
  });
});
