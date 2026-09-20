import { BaseMusicProvider } from '../base-provider';
import { resolveViaJoox } from '../joox-fallback';
import type { MusicSource, MusicTrack } from '../types';

/**
 * Kuwo source.
 *
 * Search comes from the GD aggregator, but its `url` endpoint returns an empty
 * url for every kuwo id at every bitrate, so playback is resolved through Joox
 * by song name + artist - the same approach QQ already uses. If the aggregator
 * ever fixes kuwo streams, dropping this override restores native playback.
 */
export class KuwoProvider extends BaseMusicProvider {
  source = 'kuwo' as MusicSource;

  async getUrl(track: MusicTrack, br = 192): Promise<string | null> {
    return resolveViaJoox(track, br);
  }
}
