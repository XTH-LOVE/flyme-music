import type { MusicSource } from './types';
import { JooxProvider } from './providers/joox-provider';
import { NeteaseProvider } from './providers/netease-provider';
import { QqProvider } from './providers/qq-provider';
import { KuwoProvider } from './providers/kuwo-provider';
import { HigequProvider } from './providers/higequ-provider';
import { BilibiliProvider } from './providers/bilibili-provider';
import { MockTrackProvider } from './providers/mock-provider';
import type { BaseMusicProvider } from './base-provider';

export type TrackProvider = BaseMusicProvider | MockTrackProvider;

/**
 * Singleton provider factory (mirrors Otter's MusicProviderFactory).
 * Remote sources: netease, joox, qq, kuwo (GD API) and higequ (HTML-scraped).
 */
class MusicProviderFactory {
  private instances = new Map<string, TrackProvider>();

  getProvider(source: MusicSource): TrackProvider {
    const cached = this.instances.get(source);
    if (cached) return cached;

    let provider: TrackProvider;
    switch (source) {
      case 'netease':
        provider = new NeteaseProvider();
        break;
      case 'joox':
        provider = new JooxProvider();
        break;
      case 'qq':
        provider = new QqProvider();
        break;
      case 'kuwo':
        provider = new KuwoProvider();
        break;
      case 'higequ':
        provider = new HigequProvider();
        break;
      case 'bilibili':
        provider = new BilibiliProvider();
        break;
      case 'mock':
        provider = new MockTrackProvider();
        break;
      default:
        throw new Error('不支持的音乐源: ' + source);
    }

    this.instances.set(source, provider);
    return provider;
  }
}

export const musicProviderFactory = new MusicProviderFactory();

export function getTrackProvider(source: MusicSource): TrackProvider {
  return musicProviderFactory.getProvider(source);
}
