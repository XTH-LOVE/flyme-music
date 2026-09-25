import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { checkBrowserSupport } from '@/utils/browserSupport';
import './browser-warning.css';

/**
 * Says so, when the browser cannot draw the app.
 *
 * The alternative is what was happening: covers with no height, controls
 * welded together, and no indication that anything other than the app is at
 * fault. A page that looks broken and says nothing is indistinguishable from a
 * broken app.
 *
 * Dismissible, because the layout is still partly usable and someone may prefer
 * to carry on. The message names the browser rather than the missing CSS
 * feature: "圆角封面" is what the user sees, `aspect-ratio` is not.
 */
export function BrowserWarning() {
  const [dismissed, setDismissed] = useState(false);
  const [report] = useState(checkBrowserSupport);

  if (report.ok || dismissed) return null;

  return (
    <div className="browser-warning" role="status">
      <Icon name="refresh" size={16} />
      <div className="browser-warning__body">
        <div className="browser-warning__title">这个浏览器版本太旧</div>
        <div className="browser-warning__text">
          页面可能显示不全（封面缺失、内容重叠）。换成 Chrome、Edge、Safari
          或系统自带浏览器的最新版本就好了。
        </div>
      </div>
      <button
        className="browser-warning__close"
        onClick={() => setDismissed(true)}
        aria-label="关闭"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
