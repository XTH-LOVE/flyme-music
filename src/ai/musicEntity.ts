import type { MusicTrack } from '@/music/source/types';

export interface MusicEntity {
  key: string;
  title: string;
  artists: string[];
  albums: string[];
  tracks: MusicTrack[];
  sources: string[];
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/(?:（|\()[^）)]*(?:live|现场|remix|混音|伴奏|instrumental|version|版)[^）)]*(?:）|\))/gi, '')
    .replace(/\b(feat\.?|ft\.?).*$/i, '')
    .replace(/[\s\-_·・'’“”".,!?！？:：/\\]+/g, '')
    .trim();
}

export function musicEntityKey(track: Pick<MusicTrack, 'name' | 'artist' | 'album'>): string {
  const artist = track.artist.map(normalize).filter(Boolean).sort().join('+');
  return `${normalize(track.name)}|${artist}|${normalize(track.album)}`;
}

export function mergeMusicEntities(tracks: MusicTrack[]): MusicEntity[] {
  const grouped = new Map<string, MusicEntity>();
  for (const track of tracks) {
    const key = musicEntityKey(track);
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.tracks.some((item) => item.source === track.source && item.id === track.id)) existing.tracks.push(track);
      if (!existing.sources.includes(track.source)) existing.sources.push(track.source);
      if (!existing.albums.includes(track.album)) existing.albums.push(track.album);
    } else {
      grouped.set(key, {
        key,
        title: track.name,
        artists: [...track.artist],
        albums: track.album ? [track.album] : [],
        tracks: [track],
        sources: [track.source],
      });
    }
  }
  return [...grouped.values()];
}

export function dedupeCanonicalTracks(tracks: MusicTrack[]): MusicTrack[] {
  const entities = mergeMusicEntities(tracks);
  const priority: Record<string, number> = { local: 0, mock: 1, netease: 2, qq: 3, kuwo: 4, joox: 5, bilibili: 6, higequ: 7 };
  return entities.map((entity) => [...entity.tracks].sort((a, b) => (priority[a.source] ?? 99) - (priority[b.source] ?? 99))[0]);
}

export function entitySearchText(entity: MusicEntity): string {
  return `${entity.title} ${entity.artists.join(' / ')} ${entity.albums.join(' / ')}`.trim();
}
