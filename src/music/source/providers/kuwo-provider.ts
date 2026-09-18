import { BaseMusicProvider } from '../base-provider';
import type { MusicSource } from '../types';

/** Kuwo source - all capabilities inherited from the GD API base provider. */
export class KuwoProvider extends BaseMusicProvider {
  source = 'kuwo' as MusicSource;
}
