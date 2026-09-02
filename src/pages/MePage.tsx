import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { SongListItem } from '@/components/SongListItem';
import { TrackListItem } from '@/components/TrackListItem';
import { MusicCard } from '@/components/MusicCard';
import { ArtistCard } from '@/components/ArtistCard';
import { TrackCover } from '@/components/TrackCover';
import { NetPlaylistCard } from '@/components/NetPlaylistCard';
import { Chip } from '@/design-system/components/Chip';
import { Dialog } from '@/design-system/components/Dialog';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { Cover } from '@/design-system/components/Cover';
import { fallbackPalette } from '@/utils/palette';
import { useSongs, useAllAlbums, useAllArtists } from '@/music/musicStore';
import { useNeteaseRecommend } from '@/music/netease/useNetease';
import { songToTrack, type MusicTrack } from '@/music/source/types';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { useNeteaseAuthStore } from '@/store/useNeteaseAuthStore';
import { useAuthStore } from '@/store/useAuthStore';
import { getNeteaseCloudSongs, getNeteaseLikedSongs, getNeteaseUserPlaylists, type NetPlaylistSummary, type NeteaseCloudSong } from '@/music/netease/netease-api';
import './pages.css';

type Tab = 'recent' | 'favorite' | 'mine' | 'songs' | 'albums' | 'artists' | 'playlists' | 'netease';

const tabs: { key: Tab; label: string }[] = [
  { key: 'recent', label: '最近播放' },
  { key: 'favorite', label: '我喜欢' },
  { key: 'mine', label: '我的歌单' },
  { key: 'songs', label: '歌曲' },
  { key: 'albums', label: '专辑' },
  { key: 'artists', label: '艺术家' },
  { key: 'playlists', label: '推荐歌单' },
];

/** 我的：个人中心 + 原音乐库的全部内容。 */
export function MePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('recent');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authType, setAuthType] = useState<'username' | 'email'>('username');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileNickname, setProfileNickname] = useState('');
  const [profileMsg, setProfileMsg] = useState('');

  const recentTracks = useLibraryStore((s) => s.recentTracks);
  const legacyRecentIds = useLibraryStore((s) => s.recentSongIds);
  const favoriteIds = useLibraryStore((s) => s.favoriteSongIds);
  const { data: legacySongs } = useSongs(recentTracks.length ? undefined : legacyRecentIds);
  const { data: favoriteSongs } = useSongs(favoriteIds);
  const { data: allAlbums, loading: albumsLoading } = useAllAlbums();
  const { data: allArtists, loading: artistsLoading } = useAllArtists();
  const { data: netPlaylists, loading: netLoading } = useNeteaseRecommend();
  const userPlaylists = usePlaylistStore((s) => s.playlists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const neteaseAuth = useNeteaseAuthStore();
  const localAuth = useAuthStore();

  const submitAuth = async () => {
    setAuthMsg('');
    const result = authType === 'username'
      ? (authMode === 'login' ? await localAuth.loginUsername(authUsername, authPassword) : await localAuth.registerUsername(authDisplayName, authUsername, authPassword))
      : (authMode === 'login' ? await localAuth.login(authUsername, authPassword) : await localAuth.register(authUsername, authPassword));
    if (result.ok) {
      setAuthMsg('');
      setAuthPassword('');
      setAuthUsername('');
      setAuthDisplayName('');
      setAuthOpen(false);
    } else {
      setAuthMsg(result.message ?? '操作失败');
    }
  };
  const openProfile = () => { if (!localAuth.user) { setAuthOpen(true); return; } setProfileNickname(localAuth.user.nickname); setProfileMsg(''); setProfileOpen(true); };
  const [accountPlaylists, setAccountPlaylists] = useState<NetPlaylistSummary[]>([]);
  const [cloudSongs, setCloudSongs] = useState<NeteaseCloudSong[]>([]);
  const [likedSongs, setLikedSongs] = useState<MusicTrack[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');

  useEffect(() => {
    if (!neteaseAuth.user) {
      setAccountPlaylists([]);
      setCloudSongs([]);
      setLikedSongs([]);
      return;
    }
    let cancelled = false;
    setAccountLoading(true);
    setAccountError('');
    Promise.all([
      getNeteaseUserPlaylists(neteaseAuth.user.id),
      getNeteaseCloudSongs(),
      getNeteaseLikedSongs(neteaseAuth.user.id),
    ]).then(([playlists, cloud, liked]) => {
      if (cancelled) return;
      setAccountPlaylists(playlists);
      setCloudSongs(cloud);
      setLikedSongs(liked);
    }).catch((error) => {
      if (!cancelled) setAccountError(error instanceof Error ? error.message : '同步网易云内容失败');
    }).finally(() => {
      if (!cancelled) setAccountLoading(false);
    });
    return () => { cancelled = true; };
  }, [neteaseAuth.user]);

  const refreshNeteaseContent = async () => {
    if (!neteaseAuth.user) return;
    setAccountLoading(true);
    setAccountError('');
    try {
      const [playlists, cloud, liked] = await Promise.all([
        getNeteaseUserPlaylists(neteaseAuth.user.id),
        getNeteaseCloudSongs(),
        getNeteaseLikedSongs(neteaseAuth.user.id),
      ]);
      setAccountPlaylists(playlists); setCloudSongs(cloud); setLikedSongs(liked); setTab('netease');
    } catch (error) { setAccountError(error instanceof Error ? error.message : '同步网易云内容失败'); }
    finally { setAccountLoading(false); }
  };

  const recents = useMemo(
    () => (recentTracks.length ? recentTracks : (legacySongs ?? []).map(songToTrack)),
    [recentTracks, legacySongs],
  );
  const allSongs = [...(legacySongs ?? []), ...(favoriteSongs ?? [])];

  return (
    <div className="page">
      <div className="me-hero">
        {localAuth.user?.avatarUrl ? <img className="me-hero__avatar me-hero__avatar--image" src={localAuth.user.avatarUrl} alt="" /> : <div className="me-hero__avatar"><Icon name="user" size={28} /></div>}
        <button className="me-profile-button" onClick={openProfile}>
          <h1 className="me-hero__name">{localAuth.user?.nickname || '登录'}</h1>
          <p className="me-hero__sub">{localAuth.user ? '@' + localAuth.user.username : '登录后同步你的音乐与资料'}</p>
        </button>
        <button className="am-btn am-btn--secondary am-btn--sm" style={{ marginLeft: 'auto' }} onClick={() => navigate('/settings')}>
          <Icon name="settings" size={15} />
          设置
        </button>
        {!localAuth.user ? <button className="am-btn am-btn--primary am-btn--sm" onClick={() => setAuthOpen(true)}>登录 / 注册</button> : <button className="am-btn am-btn--ghost am-btn--sm" onClick={() => localAuth.logout()}>退出</button>}
      </div>

      {!localAuth.user ? <button className="me-login-row" onClick={() => setAuthOpen(true)}><span className="me-login-row__icon"><Icon name="user" size={18} /></span><span><strong>登录 Aurora 账号</strong><small>跨设备同步歌单、收藏与个人资料</small></span><Icon name="chevronRight" size={18} /></button> : null}


      <div className="me-stats">
        <button className="me-stat" onClick={() => setTab('favorite')}>
          <span className="me-stat__value">{favoriteIds.length}</span>
          <span className="me-stat__label">我喜欢的歌</span>
        </button>
        <div className="me-stat__divider" />
        <button className="me-stat" onClick={() => setTab('recent')}>
          <span className="me-stat__value">{recents.length}</span>
          <span className="me-stat__label">最近播放</span>
        </button>
        <div className="me-stat__divider" />
        <button className="me-stat" onClick={() => setTab('mine')}>
          <span className="me-stat__value">{userPlaylists.length}</span>
          <span className="me-stat__label">自建歌单</span>
        </button>
      </div>

      <div className="chip-row">
        {neteaseAuth.user ? <Chip active={tab === 'netease'} onClick={() => setTab('netease')}>网易云</Chip> : null}
        {tabs.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        {tab === 'netease' && (
          <div className="netease-account-panel">
            <div className="netease-account-panel__head">
              <div>
                <div className="settings-row__title">{neteaseAuth.user?.nickname} 的网易云</div>
                <div className="settings-row__desc">歌单与云盘内容已从网易云同步</div>
              </div>
              <button className="am-btn am-btn--ghost am-btn--sm" onClick={() => void refreshNeteaseContent()} disabled={accountLoading}>{accountLoading ? '同步中…' : '刷新'}</button>
            </div>
            {accountError ? <div className="settings-account-note">{accountError}</div> : null}
            <div className="settings-row__title" style={{ margin: '14px 0 10px' }}>我的歌单</div>
            {accountPlaylists.length ? <div className="grid-cards">{accountPlaylists.slice(0, 12).map((pl) => <NetPlaylistCard key={pl.id} playlist={pl} />)}</div> : <EmptyState icon="library" title={accountLoading ? '正在读取歌单' : '暂无可显示的歌单'} description="登录网易云后可同步创建和收藏的歌单" />}
            <div className="settings-row__title" style={{ margin: '22px 0 10px' }}>云盘歌曲</div>
            {cloudSongs.length ? <div className="song-list">{cloudSongs.slice(0, 50).map((item, i) => <TrackListItem key={item.track.id + ':' + i} track={item.track} context={cloudSongs.map((x) => x.track)} />)}</div> : <EmptyState icon="music" title={accountLoading ? '正在读取云盘' : '暂无云盘歌曲'} description="网易云云盘中的歌曲会显示在这里" />}
            <div className="settings-row__title" style={{ margin: '22px 0 10px' }}>我喜欢的网易云歌曲</div>
            {likedSongs.length ? <div className="song-list">{likedSongs.slice(0, 50).map((track, i) => <TrackListItem key={track.id + ':' + i} track={track} context={likedSongs} />)}</div> : <EmptyState icon="heart" title={accountLoading ? '正在读取收藏' : '暂无收藏歌曲'} description="网易云收藏的歌曲会显示在这里" />}
          </div>
        )}
        {tab === 'recent' &&
          (recents.length ? (
            <div className="song-list">
              {recents.map((track, i) => (
                <TrackListItem key={track.source + ':' + track.id + ':' + i} track={track} context={recents} />
              ))}
            </div>
          ) : (
            <EmptyState icon="clock" title="还没有播放记录" description="播放任意歌曲后会出现在这里" />
          ))}

        {tab === 'favorite' &&
          (favoriteSongs && favoriteSongs.length ? (
            <div className="song-list">
              {favoriteSongs.map((s) => (
                <SongListItem key={s.id} song={s} context={favoriteSongs} />
              ))}
            </div>
          ) : (
            <EmptyState icon="heart" title="还没有喜欢的歌" description="点击歌曲旁的爱心收藏到这里" />
          ))}

        {tab === 'mine' && (
          <>
            <button className="am-btn am-btn--secondary am-btn--md create-pl-btn" onClick={() => { setNewName(''); setCreateOpen(true); }}>
              <Icon name="more" size={16} />
              新建歌单
            </button>
            {userPlaylists.length ? (
              <div className="grid-cards" style={{ marginTop: 16 }}>
                {userPlaylists.map((pl) => {
                  const first = pl.tracks[0];
                  return (
                    <button key={pl.id} className="user-pl-card" onClick={() => navigate('/my-playlist/' + pl.id)}>
                      <div className="user-pl-card__cover">
                        {first ? (
                          <TrackCover track={first} radius="0" bare />
                        ) : (
                          <Cover palette={fallbackPalette(pl.id)} title={pl.name} radius="0" />
                        )}
                      </div>
                      <div className="user-pl-card__title">{pl.name}</div>
                      <div className="user-pl-card__subtitle">{pl.tracks.length} 首</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon="library" title="还没有自建歌单" description="搜索歌曲后通过右侧菜单加入歌单" />
            )}
          </>
        )}

        {tab === 'songs' &&
          (allSongs.length ? (
            <div className="song-list">
              {allSongs
                .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
                .map((s) => (
                  <SongListItem key={s.id} song={s} context={allSongs} />
                ))}
            </div>
          ) : (
            <EmptyState title="曲库空空如也" description="播放或收藏歌曲后会出现在这里" />
          ))}

        {tab === 'albums' &&
          (albumsLoading ? (
            <div className="grid-cards">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={180} radius="var(--am-radius-xl)" />
              ))}
            </div>
          ) : (
            <div className="grid-cards">
              {(allAlbums ?? []).map((al) => (
                <MusicCard key={al.id} palette={al.palette} title={al.title} subtitle={al.artistName} to={'/album/' + al.id} />
              ))}
            </div>
          ))}

        {tab === 'artists' &&
          (artistsLoading ? (
            <div className="grid-cards">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={140} radius="var(--am-radius-xl)" />
              ))}
            </div>
          ) : (
            <div className="grid-artists">
              {(allArtists ?? []).map((ar) => (
                <ArtistCard key={ar.id} artist={ar} />
              ))}
            </div>
          ))}

        {tab === 'playlists' &&
          (netLoading && !netPlaylists ? (
            <div className="grid-cards">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} height={180} radius="var(--am-radius-xl)" />
              ))}
            </div>
          ) : (
            <div className="grid-cards">
              {(netPlaylists ?? []).slice(0, 12).map((pl) => (
                <NetPlaylistCard key={pl.id} playlist={pl} />
              ))}
            </div>
          ))}
      </div>

      <Dialog open={createOpen} title="新建歌单" onClose={() => setCreateOpen(false)}>
        <input
          className="picker-create__input"
          style={{ width: '100%', marginBottom: 16 }}
          placeholder="歌单名称"
          value={newName}
          autoFocus
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) {
              const pid = createPlaylist(newName);
              setCreateOpen(false);
              navigate('/my-playlist/' + pid);
            }
          }}
        />
        <button
          className="am-btn am-btn--primary am-btn--md am-btn--block"
          disabled={!newName.trim()}
          onClick={() => {
            const pid = createPlaylist(newName);
            setCreateOpen(false);
            navigate('/my-playlist/' + pid);
          }}
        >
          创建
        </button>
      </Dialog>
      <Dialog open={authOpen} title={authMode === 'login' ? '登录 Aurora 账号' : '创建 Aurora 账号'} onClose={() => setAuthOpen(false)}>
        <div className="auth-dialog-list">
          <div className="settings-account-tabs"><button className={'quality-chip' + (authMode === 'login' ? ' quality-chip--active' : '')} onClick={() => setAuthMode('login')}>登录</button><button className={'quality-chip' + (authMode === 'register' ? ' quality-chip--active' : '')} onClick={() => setAuthMode('register')}>注册</button></div>
          <div className="settings-account-tabs"><button className={'quality-chip' + (authType === 'username' ? ' quality-chip--active' : '')} onClick={() => setAuthType('username')}>账号密码</button><button className={'quality-chip' + (authType === 'email' ? ' quality-chip--active' : '')} onClick={() => setAuthType('email')}>邮箱密码</button></div>
          {authMode === 'register' && authType === 'username' ? <label className="auth-field"><span>昵称（可选）</span><input className="picker-create__input" value={authDisplayName} placeholder="默认显示 Aurora 听友" onChange={(e) => setAuthDisplayName(e.target.value)} /></label> : null}
          <label className="auth-field"><span>{authType === 'username' ? '账号名' : '邮箱'}</span><input className="picker-create__input" type={authType === 'email' ? 'email' : 'text'} value={authUsername} placeholder={authType === 'username' ? '支持中文、字母、数字或下划线' : 'you@example.com'} autoComplete={authType === 'email' ? 'email' : 'username'} onChange={(e) => setAuthUsername(e.target.value)} /></label>
          <label className="auth-field"><span>密码</span><input className="picker-create__input" type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authPassword} placeholder="6 位数字" onChange={(e) => setAuthPassword(e.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
          <button className="am-btn am-btn--primary am-btn--block" onClick={() => void submitAuth()}>{authMode === 'login' ? '登录' : '注册并登录'}</button>
          {authMsg ? <div className="settings-account-note">{authMsg}</div> : null}
          <button className="am-btn am-btn--ghost am-btn--block" onClick={() => { setAuthOpen(false); navigate('/settings'); }}>使用网易云扫码登录</button>
        </div>
      </Dialog>
      <Dialog open={profileOpen} title="个人资料" onClose={() => setProfileOpen(false)}>
        <div className="auth-dialog-list">
          <label className="auth-field"><span>昵称</span><input className="picker-create__input" value={profileNickname} maxLength={32} onChange={(e) => setProfileNickname(e.target.value)} /></label>
          <label className="auth-field"><span>头像</span><input className="picker-create__input" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; setProfileMsg('上传中…'); void localAuth.uploadAvatar(file).then((r) => setProfileMsg(r.ok ? '头像已更新' : r.message || '头像上传失败')); }} /></label>
          {profileMsg ? <div className="settings-account-note">{profileMsg}</div> : null}
          <button className="am-btn am-btn--primary am-btn--block" onClick={() => { void localAuth.updateProfile({ nickname: profileNickname }); setProfileOpen(false); }}>保存资料</button>
        </div>
      </Dialog>
    </div>
  );
}
