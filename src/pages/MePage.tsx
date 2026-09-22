import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { SongListItem } from '@/components/SongListItem';
import { TrackListItem } from '@/components/TrackListItem';
import { TrackCover } from '@/components/TrackCover';
import { PlaylistArt } from '@/components/PlaylistArt';
import { resizeToSquareJpeg } from '@/utils/imageResize';
import { NetPlaylistCard } from '@/components/NetPlaylistCard';
import { Chip } from '@/design-system/components/Chip';
import { Dialog } from '@/design-system/components/Dialog';
import { EmptyState } from '@/design-system/components/EmptyState';
import { Skeleton } from '@/design-system/components/Skeleton';
import { useSongs } from '@/music/musicStore';
import { useNeteaseRecommend } from '@/music/netease/useNetease';
import { songToTrack, type MusicTrack } from '@/music/source/types';
import { useLibraryStore } from '@/store/useLibraryStore';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { useNeteaseAuthStore } from '@/store/useNeteaseAuthStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useAiStore } from '@/store/useAiStore';
import { getNeteaseCloudSongs, getNeteaseLikedSongs, getNeteaseUserPlaylists, type NetPlaylistSummary, type NeteaseCloudSong } from '@/music/netease/netease-api';
import { exportBackup, readBackupFile, restoreBackupToStorage } from '@/utils/backup';
import { notify } from '@/utils/notify';
import './pages.css';

type Tab = 'recent' | 'favorite' | 'mine' | 'songs' | 'playlists' | 'netease';

const tabs: { key: Tab; label: string }[] = [
  { key: 'recent', label: '最近播放' },
  { key: 'favorite', label: '我喜欢' },
  { key: 'mine', label: '我的歌单' },
  { key: 'songs', label: '歌曲' },
  { key: 'playlists', label: '推荐歌单' },
];

/** 我的：个人中心 + 原音乐库的全部内容。 */
export function MePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('recent');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [profileNickname, setProfileNickname] = useState('');
  const heroAvatarRef = useRef<HTMLInputElement>(null);
  const [nickOpen, setNickOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const recentTracks = useLibraryStore((s) => s.recentTracks);
  const legacyRecentIds = useLibraryStore((s) => s.recentSongIds);
  const favoriteIds = useLibraryStore((s) => s.favoriteSongIds);
  const playLog = useLibraryStore((s) => s.playLog);
  const dislikes = useAiStore((s) => s.dislikes);
  const { data: legacySongs } = useSongs(recentTracks.length ? undefined : legacyRecentIds);
  const { data: favoriteSongs } = useSongs(favoriteIds);
  // Rendered from the stored tracks, not from the ids: `useSongs` can only
  // answer for mock songs, so anything liked from an online source resolved to
  // nothing and the list stayed empty. `favoriteSongs` is kept only as the
  // fallback for ids saved before tracks were stored.
  const favoriteTracks = useLibraryStore((s) => s.favoriteTracks);
  const { data: netPlaylists, loading: netLoading } = useNeteaseRecommend();
  const userPlaylists = usePlaylistStore((s) => s.playlists);
  const createPlaylist = usePlaylistStore((s) => s.createPlaylist);
  const neteaseAuth = useNeteaseAuthStore();
  const localAuth = useAuthStore();


  const [backupMsg, setBackupMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setBackupMsg('');
    try {
      await exportBackup({
        favorites: favoriteIds,
        recentTracks,
        playLog,
        dislikes,
        playlists: userPlaylists,
      });
      setBackupMsg('已导出备份文件');
    } catch (error) {
      setBackupMsg(error instanceof Error ? error.message : '导出失败');
    }
  };

  const handleImport = async (file: File | undefined) => {
    setBackupMsg('');
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      if (!backup) {
        setBackupMsg('不是有效的 Flyme 备份文件');
        return;
      }
      restoreBackupToStorage(backup);
      notify('已导入备份，正在刷新…');
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      setBackupMsg(error instanceof Error ? error.message : '导入失败');
    }
  };
  const onHeroAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    notify('正在上传头像…');
    void (async () => {
      try {
        const blob = await resizeToSquareJpeg(file);
        const r = await localAuth.uploadAvatar(blob);
        notify(r.ok ? '头像已更新' : r.message || '头像上传失败');
      } catch (err) {
        notify(err instanceof Error ? err.message : '头像上传失败');
      } finally {
        setAvatarUploading(false);
      }
    })();
    e.target.value = '';
  };

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
        <button
          className="me-hero__avatar me-hero__avatar--edit"
          onClick={() => (localAuth.user ? heroAvatarRef.current?.click() : navigate('/login'))}
          aria-label="更换头像"
          title={localAuth.user ? '点击更换头像' : '登录后可设置头像'}
        >
          {localAuth.user?.avatarUrl ? <img className="me-hero__avatar me-hero__avatar--image" src={localAuth.user.avatarUrl} alt="" style={avatarUploading ? { opacity: 0.55 } : undefined} /> : <Icon name="user" size={30} />}
          {localAuth.user ? <span className="me-hero__avatar-cam"><Icon name="music" size={12} /></span> : null}
        </button>
        <input ref={heroAvatarRef} type="file" accept="image/*" hidden onChange={onHeroAvatarPick} />
        <button className="me-profile-button" onClick={() => (localAuth.user ? setNickOpen(true) : navigate('/login'))} aria-label="修改昵称">
          <h1 className="me-hero__name">{localAuth.user?.nickname || '登录'}</h1>
          {localAuth.user ? <p className="me-hero__sub">@{localAuth.user.username}</p> : null}
        </button>
        <button className="am-btn am-btn--secondary am-btn--sm" style={{ marginLeft: 'auto' }} onClick={() => navigate('/settings')}>
          <Icon name="settings" size={15} />
          设置
        </button>
        {!localAuth.user ? <button className="am-btn am-btn--primary am-btn--sm" onClick={() => navigate('/login')}>登录 / 注册</button> : <button className="am-btn am-btn--ghost am-btn--sm" onClick={() => localAuth.logout()}>退出</button>}
      </div>



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

      {/*
        Entries for the pages the phone layout has no other way to reach.
        The bottom bar has four slots and the desktop sidebar has eleven; the
        ones that lost out were reachable only by typing a URL, which on a phone
        nobody does. They live here, under the profile, which is where a phone
        user looks for them.
      */}
      <div className="me-links">
        {(
          [
            ['/albums', 'album', '专辑墙'],
            ['/stats', 'flame', '听歌统计'],
            ['/ai', 'music', '一起听'],
            ['/playlists', 'queue', '歌单广场'],
            ['/storage', 'download', '存储管理'],
          ] as const
        ).map(([to, icon, label]) => (
          <button key={to} className="me-link" onClick={() => navigate(to)}>
            <Icon name={icon} size={18} />
            <span>{label}</span>
            <Icon name="chevronRight" size={15} />
          </button>
        ))}
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
          (favoriteTracks.length ? (
            <>
              <div className="backup-bar">
                <span className="backup-bar__hint">收藏、歌单与听歌记录仅保存在本机</span>
                <div className="backup-bar__actions">
                  <button className="am-btn am-btn--ghost am-btn--sm" onClick={() => void handleExport()}>
                    <Icon name="download" size={14} />
                    导出备份
                  </button>
                  <button className="am-btn am-btn--ghost am-btn--sm" onClick={() => fileInputRef.current?.click()}>
                    <Icon name="arrowRight" size={14} />
                    导入备份
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      void handleImport(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              {backupMsg ? <div className="settings-account-note">{backupMsg}</div> : null}
              <div className="song-list">
                {(favoriteTracks.length ? favoriteTracks : []).map((track, index) => (
                  <TrackListItem
                    key={track.id}
                    track={track}
                    index={index}
                    context={favoriteTracks}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="backup-bar">
                <span className="backup-bar__hint">收藏、歌单与听歌记录仅保存在本机</span>
                <div className="backup-bar__actions">
                  <button className="am-btn am-btn--ghost am-btn--sm" onClick={() => void handleExport()}>
                    <Icon name="download" size={14} />
                    导出备份
                  </button>
                  <button className="am-btn am-btn--ghost am-btn--sm" onClick={() => fileInputRef.current?.click()}>
                    <Icon name="arrowRight" size={14} />
                    导入备份
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      void handleImport(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              {backupMsg ? <div className="settings-account-note">{backupMsg}</div> : null}
              <EmptyState icon="heart" title="还没有喜欢的歌" description="点击歌曲旁的爱心收藏到这里" />
            </>
          ))}

        {tab === 'mine' && (
          <>
            <button className="am-btn am-btn--secondary am-btn--md create-pl-btn" onClick={() => navigate('/local')}>
              <Icon name="music" size={16} />
              本地音乐
            </button>
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
                          <PlaylistArt name={pl.name} seed={pl.id} radius="0" />
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
      <Dialog open={nickOpen} title="修改昵称" onClose={() => setNickOpen(false)}>
        <div className="auth-dialog-list">
          <label className="auth-field">
            <span>新昵称</span>
            <input className="picker-create__input" value={profileNickname} maxLength={32} placeholder="输入新的昵称" onChange={(e) => setProfileNickname(e.target.value)} />
          </label>
          <button className="am-btn am-btn--primary am-btn--block" onClick={() => { void localAuth.updateProfile({ nickname: profileNickname }).then(() => { notify('昵称已更新'); setNickOpen(false); }); }}>保存</button>
        </div>
      </Dialog>
    </div>
  );
}
