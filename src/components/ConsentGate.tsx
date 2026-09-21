import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { BottomSheet } from '@/design-system/components/BottomSheet';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDocument } from '@/legal/documents';
import { AUTHOR } from '@/legal/AboutSection';
import './consent.css';

/**
 * The first-launch agreement, shown before anything else the app does.
 *
 * It is a gate rather than a checkbox on the sign-in page because the app works
 * without an account: anonymous users search, stream and use the AI, and those
 * are exactly the paths the policy has to describe. A checkbox that only
 * registered users ever see covers the wrong people.
 *
 * Consent is recorded as a version and a timestamp, not a boolean. When the
 * policy changes the version changes with it, and the gate returns - which is
 * the only way to be able to say which text a given person agreed to.
 */
const CONSENT_KEY = 'aurora.consent';

/** Bump when the policy text changes materially; a typo is not a new version. */
const POLICY_VERSION = '2026-09-21';

export function hasConsented(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version === POLICY_VERSION;
  } catch {
    return false;
  }
}

function recordConsent(): void {
  try {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ version: POLICY_VERSION, at: new Date().toISOString() }),
    );
  } catch {
    /* private mode: they will be asked again, which is the safe direction */
  }
}

export function ConsentGate({ onAgree }: { onAgree: () => void }) {
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState<LegalDocument | null>(null);

  return (
    <div className="consent">
      <div className="consent__body">
        <img className="consent__mark" src="/flyme-mark.jpg" alt="" />
        <h1 className="consent__title">Flyme Music</h1>
        <p className="consent__by">
          由 <strong>{AUTHOR}</strong> 设计与开发
        </p>

        <p className="consent__intro">
          一个 HyperOS 风格的音乐播放器。多音源搜索与播放、本地音乐与标签解析、逐字歌词、
          AI 伴听解读、听歌报告，网页版 / Windows / Android 共用同一套代码。
        </p>

        {/* The one paragraph that matters. A wall of clauses gets scrolled past;
            a sentence about what does and does not leave the device gets read. */}
        <div className="consent__key">
          <p className="consent__key-line">
            <Icon name="check" size={15} />
            <span>
              <strong>我们不会上传你的歌单、收藏和播放记录</strong>，它们只存在这台设备上。
            </span>
          </p>
          <p className="consent__key-line">
            <Icon name="check" size={15} />
            <span>没有广告，没有第三方统计埋点。</span>
          </p>
          <p className="consent__key-line">
            <Icon name="check" size={15} />
            <span>
              使用在线播放、AI 解读、一起听等功能时需要联网，具体见下方文档。
            </span>
          </p>
        </div>

        <button className="consent__check" onClick={() => setChecked((v) => !v)}>
          <span className={'consent__dot' + (checked ? ' consent__dot--on' : '')}>
            {checked ? <Icon name="check" size={12} /> : null}
          </span>
          <span className="consent__check-text">
            我已阅读并同意
            <button
              className="consent__link"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(TERMS_OF_SERVICE);
              }}
            >
              《用户协议》
            </button>
            与
            <button
              className="consent__link"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(PRIVACY_POLICY);
              }}
            >
              《隐私政策》
            </button>
          </span>
        </button>
      </div>

      {/* Disabled rather than absent: a greyed button tells the user there is
          one step left, where a missing one just looks broken. */}
      <div className="consent__foot">
        <button
          className="am-btn am-btn--primary consent__go"
          disabled={!checked}
          onClick={() => {
            recordConsent();
            onAgree();
          }}
        >
          同意并继续
        </button>
        <p className="consent__note">
          不同意将无法使用本应用。你的选择会被记录，以便日后核对。
        </p>
      </div>

      <BottomSheet
        open={open !== null}
        title={open?.title ?? ''}
        onClose={() => setOpen(null)}
        variant="drawer"
      >
        {open ? (
          <article className="legal-doc">
            <p className="legal-doc__updated">更新日期：{open.updated}</p>
            {open.sections.map((section) => (
              <section key={section.heading} className="legal-doc__section">
                <h3 className="legal-doc__heading">{section.heading}</h3>
                {section.body.map((paragraph, index) => (
                  <p key={index} className="legal-doc__paragraph">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </article>
        ) : null}
      </BottomSheet>
    </div>
  );
}
