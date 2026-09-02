import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import './components.css';
import './nav-glass.css';

const items: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: '首页', icon: 'home' },
  { to: '/library', label: '排行榜', icon: 'flame' },
  { to: '/discover', label: '发现', icon: 'compass' },
  { to: '/me', label: '我的', icon: 'user' },
];

/** Mobile floating liquid-glass navigation pill (Halcyon GlassPill style). */
export function BottomNavigation() {
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => 'bottom-nav__item' + (isActive ? ' bottom-nav__item--active' : '')}
        >
          <Icon name={item.icon} size={21} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
