import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';

const mainEntries = new Set(['/', '/library', '/discover', '/me']);

function fallbackFor(pathname: string): string {
  if (pathname === '/settings' || pathname === '/stats' || pathname === '/playlists' || pathname.startsWith('/my-playlist/')) {
    return '/me';
  }
  return '/';
}

/** Consistent back affordance for secondary pages, including direct links. */
export function PageBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  if (mainEntries.has(location.pathname)) return null;

  const goBack = () => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallbackFor(location.pathname), { replace: true });
    }
  };

  return (
    <button className="page-back" type="button" onClick={goBack} aria-label="返回">
      <Icon name="chevronLeft" size={18} />
      <span>返回</span>
    </button>
  );
}
