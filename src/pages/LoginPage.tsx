import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useAuthStore } from '@/store/useAuthStore';
import './login-page.css';

/**
 * Where signing in happens, which is now Settings.
 *
 * The app used to have its own account - a second one for the same person,
 * holding a nickname and an avatar that the NetEase account already has. Since
 * that account is needed anyway to play anything from that source, the app's
 * identity is that account now, and the sign-in is the QR scan in Settings.
 *
 * This page stays because it is a route people have bookmarked and a link the
 * UI still points at; rather than a form that cannot succeed, it says where to
 * go and offers to go there.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="login-page">
      <div className="login-page__card">
        <div className="login-page__brand">
          <img className="login-page__mark" src="/flyme-mark.jpg" alt="" />
          <div className="login-page__title">Flyme 账号</div>
          <div className="login-page__sub">
            {user ? '已登录：' + user.nickname : '使用网易云账号登录'}
          </div>
        </div>

        <div className="login-page__hint">
          <p>
            <Icon name="check" size={15} />
            <span>应用不再单独注册账号，登录的就是网易云账号。</span>
          </p>
          <p>
            <Icon name="check" size={15} />
            <span>头像和昵称直接来自网易云，不需要另外填写。</span>
          </p>
          <p>
            <Icon name="check" size={15} />
            <span>不登录也能使用：本地音乐、其他音源和大多数功能都不受影响。</span>
          </p>
        </div>

        <button
          className="am-btn am-btn--primary login-page__submit"
          onClick={() => navigate('/settings')}
        >
          {user ? '前往设置管理账号' : '去设置里扫码登录'}
        </button>

        <button className="login-page__ghost" onClick={() => navigate('/')}>
          先不登录，直接使用
        </button>
      </div>
    </div>
  );
}
