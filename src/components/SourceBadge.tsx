import { sourceLabels } from '@/music/source/types';
import type { MusicSource } from '@/music/source/types';
import './source.css';

export function SourceBadge({ source }: { source: MusicSource }) {
  if (source === 'mock') return null;
  return <span className={'source-badge source-badge--' + source}>{sourceLabels[source]}</span>;
}
