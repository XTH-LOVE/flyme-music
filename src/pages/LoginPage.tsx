import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Icon } from '@/components/Icon';
import { useAuthStore } from '@/store/useAuthStore';
import { useNeteaseAuthStore } from '@/store/useNeteaseAuthStore';
import { useNeteaseQrLogin, type QrState } from '@/hooks/useNeteaseQrLogin';
import './login-page.css';

/**
 * Signing in, without leaving the page.
 *
 * This used to be a card that told you to go to Settings and scan a code there,
 * which was two navigations and a lost place for a single step. The scan now
 * happens here.
 *
 * The QR is shown in a sheet rather than inline because it needs the room: a
 * code is unreadable below a certain size, and a card with a readable code in
 * it would be a card with nothing else.
 */

/** The line under the code, which is the only thing that changes during a scan. */
function statusText(state: QrState): string {
  switch (state) {
    case 'loading':
      return '正在获取二维码…';
    case 'waiting':
      return '打开网易云音乐，扫一扫';
    case 'scanned':
      return '已扫描，请在手机上确认';
    case 'expired':
      return '二维码已过期';
    case 'error':
      return '二维码获取失败';
    case 'success':
      return '登录成功';
    default:
      return '';
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const netease = useNeteaseAuthStore((s) => s.user);
  const [sheetOpen, setSheetOpen] = useState(false);
  const qr = useNeteaseQrLogin(sheetOpen && !netease);

  const signedIn = Boolean(netease);
  const nickname = netease?.nickname ?? user?.nickname ?? '';

  return (
    <div className="login-page">
      <div className="login-page__card">
        <div className="login-page__brand">
          <img className="login-page__mark" src="/flyme-mark.jpg" alt="" />
          <div className="login-page__title">Flyme 账号</div>
          <div className="login-page__sub">
            {signedIn ? '已登录 · ' + nickname : '使用网易云账号登录'}
          </div>
        </div>

        {signedIn ? (
          <div className="login-page__hint">
            <p>
              <Icon name="check" size={15} />
              <span>头像和昵称来自你的网易云账号，不需要另外填写。</span>
            </p>
            <p>
              <Icon name="check" size={15} />
              <span>要更换账号，先退出再重新扫码。</span>
            </p>
          </div>
        ) : (
          <div className="login-page__hint">
            <p>
              <Icon name="check" size={15} />
              <span>用网易云 App 扫一扫即可，不用记密码。</span>
            </p>
            <p>
              <Icon name="check" size={15} />
              <span>头像和昵称直接来自网易云，不用另外填写。</span>
            </p>
            <p>
              <Icon name="check" size={15} />
              <span>不登录也能用：本地音乐和其他音源都不受影响。</span>
            </p>
          </div>
        )}

        {signedIn ? (
          <button className="login-page__ghost" onClick={() => navigate('/')}>
            返回
          </button>
        ) : (
          <button className="login-page__submit" onClick={() => setSheetOpen(true)}>
            扫码登录
          </button>
        )}

        {!signedIn ? (
          <button className="login-page__ghost" onClick={() => navigate('/')}>
            先不登录，直接使用
          </button>
        ) : null}
      </div>

      {sheetOpen ? (
        <div
          className="login-qr"
          role="dialog"
          aria-modal="true"
          aria-label="扫码登录"
          onClick={() => setSheetOpen(false)}
        >
          <div className="login-qr__panel" onClick={(event) => event.stopPropagation()}>
            <div className="login-qr__head">
              <span className="login-qr__title">扫码登录</span>
              <button
                className="login-qr__close"
                onClick={() => setSheetOpen(false)}
                aria-label="关闭"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            {/*
              The frame keeps its size through every state. Without that the
              panel jumps as the code arrives and again when it expires, which
              makes the whole thing feel unstable at the exact moment the user
              is holding a phone up to it.
            */}
            <div className="login-qr__frame">
              {qr.qrValue && qr.state !== 'expired' && qr.state !== 'error' ? (
                <QRCodeSVG value={qr.qrValue} size={196} level="M" includeMargin={false} />
              ) : (
                <button
                  className="login-qr__placeholder"
                  onClick={() => qr.restart()}
                  disabled={qr.state === 'loading'}
                >
                  {qr.state === 'loading' ? '获取二维码…' : '点一下重新获取'}
                </button>
              )}

              {/*
                A veil over the code when it can no longer be used, rather than
                replacing it - the user can see that the thing they were looking
                at is the thing that expired.
              */}
              {qr.state === 'expired' || qr.state === 'error' ? (
                <div className="login-qr__veil" onClick={() => qr.restart()}>
                  <Icon name="refresh" size={22} />
                  <span>点一下刷新</span>
                </div>
              ) : null}

              {qr.state === 'success' ? (
                <div className="login-qr__veil login-qr__veil--ok">
                  <Icon name="check" size={26} />
                  <span>登录成功</span>
                </div>
              ) : null}
            </div>

            <div className={'login-qr__status login-qr__status--' + qr.state}>
              {qr.message || statusText(qr.state)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
