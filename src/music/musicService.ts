import type { MusicProvider } from './provider';
import { MockMusicProvider } from './mock/provider';
import { getTrackProvider } from './source/factory';
import type { MusicSource } from './source/types';

/**
 * Active library provider (browse/detail data).
 * Online sources (netease / joox) are reached through the source factory.
 */
let activeProvider: MusicProvider = new MockMusicProvider();

export function getMusicProvider(): MusicProvider {
  return activeProvider;
}

export function setMusicProvider(provider: MusicProvider): void {
  activeProvider = provider;
}

export { getTrackProvider };
export type { MusicSource };
