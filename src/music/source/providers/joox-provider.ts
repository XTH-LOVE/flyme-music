import { BaseMusicProvider } from '../base-provider';
import type { MusicSource } from '../types';

/** Joox source - all capabilities inherited from the GD API base provider. */
export class JooxProvider extends BaseMusicProvider {
  source = 'joox' as MusicSource;
}
