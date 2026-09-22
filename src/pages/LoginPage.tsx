import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Icon } from '@/components/Icon';
import { useAuthStore } from '@/store/useAuthStore';
import { useNeteaseAuthStore } from '@/store/useNeteaseAuthStore';
import { useNeteaseQrLogin, type QrState } from '@/hooks/useNeteaseQrLogin';
import './login-page.css';

/**
 * The sign-in page.
 *
 * A full page rather than a card in the middle of one. The app is a music
 * player and this is its front door; a small floating box reads as an
 * interruption, and there is no reason for the door to be smaller than the
 * room.
 *
 * Two columns on a wide screen - what this account is on the left, the act of
 * signing in on the right - and one column on a phone, where there is only room
 * for the act and the explanation becomes three short lines above it.
 *
 * Nothing slides. The layout is fixed and the states change in place, because a
 * page that moves while someone is holding a phone up to a code is a page that
 * is harder to use at the exact moment it matters.
 */


/**
 * Hands the login URL to the Netease app.
 *
 * The code's payload is an ordinary https URL, and the Netease app registers
 * that host - so opening it wakes the app and asks the user to confirm, with no
 * second device and no camera involved.
 *
 * The packaged app cannot navigate to it: assigning to location would replace
 * the app itself with a web page and there would be no way back. So the OS is
 * asked to open it, through the same opener plugin the update flow uses. In a
 * browser a new tab is the equivalent, and if nothing handles the URL the page
 * simply opens and the QR is still there to scan.
 */
async function openInNeteaseApp(url: string): Promise<void> {
  const { isTauri } = await import('@/lib/apiTransport');
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

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

/** What the account gives you. Three lines, the same on both layouts. */
const POINTS = [
  { icon: 'music' as const, text: '用网易云 App 扫一扫即可，不用记密码' },
  { icon: 'user' as const, text: '头像和昵称直接来自网易云，不用另外填写' },
  { icon: 'check' as const, text: '不登录也能用：本地音乐和其他音源都不受影响' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const netease = useNeteaseAuthStore((s) => s.user);
  // The code is on the page, so the flow starts with the page. Waiting for a
  // tap would mean showing an empty square until someone pressed a button that
  // has nothing left to do.
  const qr = useNeteaseQrLogin(!netease);

  const signedIn = Boolean(netease);
  const nickname = netease?.nickname ?? user?.nickname ?? '';

  return (
    <div className="signin">
      <div className="signin__inner">
        {/* Left on a wide screen; the header block on a phone. */}
        <section className="signin__intro">
          <div className="signin__mark">
            <img src="/flyme-mark.jpg" alt="" />
          </div>
          <h1 className="signin__title">Flyme 账号</h1>
          <p className="signin__lead">
            {signedIn
              ? '已登录 · ' + nickname
              : '登录后收藏、歌单和播放记录会跟着你的账号走。'}
          </p>

          <ul className="signin__points">
            {POINTS.map((point) => (
              <li key={point.text}>
                <Icon name={point.icon} size={16} />
                <span>{point.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Right on a wide screen; below the intro on a phone. */}
        <section className="signin__panel">
          <div className="signin__panel-head">
            <span className="signin__panel-title">{signedIn ? '当前账号' : '扫码登录'}</span>
            {signedIn ? <span className="signin__badge">已登录</span> : null}
          </div>

          {/*
            The code lives on the page, not behind a button.

            It was a sheet, and a sheet is a good answer to "how do I fit this
            in" - but the code is the whole point of the page, so hiding it
            behind one more tap was hiding the feature. The fixed square keeps
            the layout still while the states change inside it.
          */}
          <div className="signin__code">
            {signedIn ? (
              <div className="signin__signedin">
                <div className="signin__avatar">
                  {netease?.avatarUrl || user?.avatarUrl ? (
                    <img src={netease?.avatarUrl ?? user?.avatarUrl} alt="" />
                  ) : (
                    <Icon name="user" size={30} />
                  )}
                </div>
                <div className="signin__signedin-name">{nickname}</div>
                <div className="signin__signedin-sub">头像和昵称来自网易云账号</div>
              </div>
            ) : (
              <div className="signin__frame">
                {qr.qrValue && qr.state !== 'expired' && qr.state !== 'error' ? (
                  <QRCodeSVG value={qr.qrValue} size={188} level="M" includeMargin={false} />
                ) : (
                  <button
                    className="signin__placeholder"
                    onClick={() => qr.restart()}
                    disabled={qr.state === 'loading'}
                  >
                    {qr.state === 'loading' ? '获取二维码…' : '点一下重新获取'}
                  </button>
                )}

                {/*
                  A veil over the code rather than replacing it, so the user can
                  see that the thing they were looking at is the thing that
                  expired.
                */}
                {qr.state === 'expired' || qr.state === 'error' ? (
                  <button className="signin__veil" onClick={() => qr.restart()}>
                    <Icon name="refresh" size={22} />
                    <span>点一下刷新</span>
                  </button>
                ) : null}

                {qr.state === 'success' ? (
                  <div className="signin__veil signin__veil--ok">
                    <Icon name="check" size={26} />
                    <span>登录成功</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {!signedIn ? (
            <div className={'signin__status signin__status--' + qr.state}>
              {qr.message || statusText(qr.state)}
            </div>
          ) : null}

          <div className="signin__actions">
            {signedIn ? (
              <button className="signin__primary" onClick={() => navigate('/')}>
                开始听歌
              </button>
            ) : (
              <button
                className="signin__primary"
                disabled={!qr.qrValue}
                onClick={() => void openInNeteaseApp(qr.qrValue)}
              >
                在网易云 App 中打开
              </button>
            )}
            <button className="signin__ghost" onClick={() => navigate('/')}>
              {signedIn ? '返回' : '先不登录，直接使用'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
