import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { usePlaylistStore } from '@/store/usePlaylistStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import './layout.css';

const navItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '首页', icon: 'home' },
  { to: '/library', label: '排行榜', icon: 'flame' },
  { to: '/discover', label: '发现', icon: 'compass' },
  { to: '/search', label: '搜索', icon: 'search' },
  { to: '/ai', label: '一起听', icon: 'mic' },
];

const myItems: { to: string; label: string; icon: IconName }[] = [
  { to: '/me', label: '我的', icon: 'user' },
  { to: '/stats', label: '统计', icon: 'clock' },
  { to: '/playlists', label: '歌单广场', icon: 'library' },
  { to: '/settings', label: '设置', icon: 'settings' },
];

/** Desktop HyperOS-style sidebar with clear hierarchy. */
export function Sidebar() {
  const userPlaylists = usePlaylistStore((s) => s.playlists);
  const current = usePlayerStore((s) => s.current);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-name">Aurora Music</span>
      </div>

      <nav className="sidebar__nav">
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

      <div className="sidebar__divider" />

      <div className="sidebar__playlists">
        <div className="sidebar__section-title">我的音乐</div>
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

        {userPlaylists.length ? (
          <>
            <div className="sidebar__divider" />
            <div className="sidebar__section-title">自建歌单</div>
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
