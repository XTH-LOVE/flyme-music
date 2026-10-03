import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import './layout.css';

const navItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '首页', icon: 'home' },
  { to: '/discover', label: '发现', icon: 'compass' },
  { to: '/search', label: '搜索', icon: 'search' },
  { to: '/library', label: '排行榜', icon: 'flame' },
];

const myItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/me', label: '我的音乐', icon: 'user' },
  { to: '/history', label: '最近播放', icon: 'clock' },
  { to: '/stats', label: '听歌统计', icon: 'monitor' },
  { to: '/playlists', label: '歌单广场', icon: 'library' },
];

const toolItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/local', label: '本地音乐', icon: 'music' },
  { to: '/ai', label: 'AI 伴听', icon: 'mic' },
  { to: '/storage', label: '存储与缓存', icon: 'download' },
  { to: '/settings', label: '设置', icon: 'settings' },
];

/** Desktop HyperOS-style sidebar with clear hierarchy. */
export function Sidebar() {
  const userPlaylists = usePlaylistStore((s) => s.playlists);
  const current = usePlayerStore((s) => s.current);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-mark" aria-hidden="true">
          <Icon name="music" size={18} />
        </div>
        <div>
          <div className="sidebar__brand-name">Flyme Music</div>
          <div className="sidebar__brand-subtitle">聆听你的每一首歌</div>
        </div>
      </div>

      <nav className="sidebar__nav">
        <div className="sidebar__section-title">探索</div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              'sidebar__item' + (isActive ? ' sidebar__item--active' : '')
            }
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__playlists">
        <div className="sidebar__section-title">你的音乐</div>
        {myItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              'sidebar__item' + (isActive ? ' sidebar__item--active' : '')
            }
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </NavLink>
        ))}

        <div className="sidebar__section">
          <div className="sidebar__section-title">工具</div>
          {toolItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                'sidebar__item' + (isActive ? ' sidebar__item--active' : '')
              }
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {userPlaylists.length ? (
          <>
            <div className="sidebar__section sidebar__section--playlists">
              <div className="sidebar__section-title">我的歌单</div>
            {userPlaylists.slice(0, 4).map((pl) => (
              <NavLink
                key={pl.id}
                to={'/my-playlist/' + pl.id}
                className={({ isActive }) =>
                  'sidebar__pl' + (isActive ? ' sidebar__pl--active' : '')
                }
              >
                {pl.name}
              </NavLink>
            ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="sidebar__footer">
        {current ? (
          <div className="sidebar__playing">
            <span className="sidebar__playing-label">正在播放</span>
            <span className="sidebar__playing-title">{current.name}</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
