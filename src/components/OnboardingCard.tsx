import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';

const FLAG_KEY = 'aurora.onboarding.v1';

const STEPS: { icon: 'user' | 'settings' | 'mic'; title: string; desc: string; to: string; cta: string }[] = [
  {
    icon: 'user',
    title: '登录账号',
    desc: '扫码登录网易云或注册 Aurora 账号，歌单与收藏多端同步',
    to: '/me',
    cta: '去登录',
  },
  {
    icon: 'settings',
    title: '音质与主题',
    desc: '标准到无损可选，深色模式跟随系统',
    to: '/settings',
    cta: '去设置',
  },
  {
    icon: 'mic',
    title: '试试 Aurora AI',
    desc: '说「播放周杰伦 晴天」或「建个雨天歌单」，她真的会做',
    to: '/ai',
    cta: '去聊天',
  },
];

/** One-time first-run guide: three taps to the features that matter. */
export function OnboardingCard() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(FLAG_KEY) === '1';
    } catch {
      return true;
    }
  });
  const [step, setStep] = useState(0);

  if (dismissed) return null;
  const current = STEPS[step];

  const finish = () => {
    try {
      localStorage.setItem(FLAG_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="onboarding-card" role="region" aria-label="新手引导">
      <button className="onboarding-card__close" onClick={finish} aria-label="关闭引导">
        <Icon name="close" size={15} />
      </button>
      <div className="onboarding-card__head">
        <img src="/aurora-mark.jpg" width={40} height={40} alt="" />
        <div>
          <div className="onboarding-card__title">欢迎来到 Aurora Music</div>
          <div className="onboarding-card__sub">
            {step + 1} / {STEPS.length} · {current.title}
          </div>
        </div>
      </div>
      <div className="onboarding-card__body">
        <div className="onboarding-card__icon">
          <Icon name={current.icon} size={22} />
        </div>
        <p className="onboarding-card__desc">{current.desc}</p>
      </div>
      <div className="onboarding-card__dots" aria-hidden="true">
        {STEPS.map((_, i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <div className="onboarding-card__actions">
        <button className="am-btn am-btn--ghost am-btn--sm" onClick={finish}>
          跳过
        </button>
        {step < STEPS.length - 1 ? (
          <button className="am-btn am-btn--primary am-btn--sm" onClick={() => setStep((s) => s + 1)}>
            下一步
          </button>
        ) : (
          <Link className="am-btn am-btn--primary am-btn--sm" to={current.to} onClick={finish}>
            {current.cta}
          </Link>
        )}
      </div>
    </div>
  );
}
