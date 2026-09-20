import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { Cover } from '@/design-system/components/Cover';
import { ProxyImg } from '@/components/ProxyImg';
import { fallbackPalette } from '@/utils/palette';
import { formatPlays } from '@/utils/format';
import { getNeteasePlaylistDetail } from '@/music/netease/netease-api';
import { playerController } from '@/player';
import { coverTransitionName, markCoverTransition } from '@/lib/coverTransition';
import type { NetPlaylistSummary } from '@/music/netease/netease-api';
import './components.css';
import './net-playlist.css';

/** Real online playlist card (Netease) with hover play. */
export function NetPlaylistCard({ playlist }: { playlist: NetPlaylistSummary }) {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) return;
    setPlaying(true);
    try {
      const detail = await getNeteasePlaylistDetail(playlist.id);
      if (detail.tracks.length) playerController.playTracks(detail.tracks, 0);
    } catch {
      /* keep silent; card still navigates */
    } finally {
      setPlaying(false);
    }
  };

  return (
    <button
      className="music-card"
      onClick={() => {
        markCoverTransition(playlist.id);
        navigate('/ne-playlist/' + playlist.id, { viewTransition: true });
      }}
    >
      <div
        className="music-card__cover"
        style={{ viewTransitionName: coverTransitionName(playlist.id) }}
      >
        <Cover palette={fallbackPalette(playlist.id)} bare radius="var(--am-radius-xl)" />
        {playlist.coverUrl ? (
          <ProxyImg src={playlist.coverUrl} alt={playlist.name} className="net-pl-cover" />
        ) : null}
        {playlist.playCount > 0 ? (
          <span className="net-pl-plays">▶ {formatPlays(playlist.playCount)}</span>
        ) : null}
        <span className="card-playbtn" role="button" aria-label="播放歌单" onClick={handlePlay}>
          <Icon name={playing ? 'more' : 'play'} size={18} />
        </span>
      </div>
      <div className="music-card__title">{playlist.name}</div>
      <div className="music-card__subtitle">
        {playlist.trackCount} 首{playlist.description ? ' · ' + playlist.description : ''}
      </div>
    </button>
  );
}
