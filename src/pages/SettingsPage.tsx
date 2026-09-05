import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Icon, type IconName } from '@/components/Icon';
import { SectionHeader } from '@/design-system/components/SectionHeader';
import { useThemeStore, type ThemeMode } from '@/store/useThemeStore';
import { useSettingsStore, type AudioQuality } from '@/store/useSettingsStore';
import { useAiStore, type AiPersona } from '@/store/useAiStore';
import { getAiStatus, listAiModels } from '@/ai/aiClient';
import {
  DEFAULT_MUSIC_API_URL,
  getMusicApiUrls,
  setMusicApiUrls,
} from '@/music/source';
import './pages.css';
import { useNeteaseAuthStore } from '@/store/useNeteaseAuthStore';
import { checkNeteaseQr, getNeteaseQrKey, getNeteaseUser } from '@/music/netease/netease-auth';
import {
  notificationsSupported,
  nowPlayingPermission,
  requestNowPlayingPermission,
} from '@/utils/nowPlayingNotify';

const themeOptions: { key: ThemeMode; label: string; icon: IconName }[] = [
  { key: 'light', label: '浅色', icon: 'sun' },
  { key: 'dark', label: '深色', icon: 'moon' },
  { key: 'system', label: '跟随系统', icon: 'monitor' },
];

const qualityOptions: { key: AudioQuality; label: string }[] = [
  { key: 'standard', label: '标准音质' },
  { key: 'high', label: '高品质' },
  { key: 'lossless', label: '无损' },
];

const personaOptions: { key: AiPersona; label: string; desc: string }[] = [
  { key: 'gentle', label: '温柔陪伴', desc: '轻柔自然，像老朋友' },
  { key: 'sharp', label: '毒舌乐评人', desc: '犀利幽默，敢吐槽' },
  { key: 'chuuni', label: '中二电台', desc: '热血夸张，深夜DJ' },
];

export function SettingsPage() {
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const settings = useSettingsStore();
  const [apiUrl, setApiUrl] = useState(getMusicApiUrls()[0]);
  const [apiSaved, setApiSaved] = useState(false);

  const ai = useAiStore();
  const [models, setModels] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelMsg, setModelMsg] = useState('');
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [serverEndpoint, setServerEndpoint] = useState('');
  const neteaseAuth = useNeteaseAuthStore();
  const [neteaseLoginMsg, setNeteaseLoginMsg] = useState('');
  const [neteaseQrKey, setNeteaseQrKey] = useState('');
  const [neteaseQrState, setNeteaseQrState] = useState<'idle' | 'loading' | 'waiting' | 'scanned' | 'expired' | 'success' | 'error'>('idle');
  const [neteaseQrVersion, setNeteaseQrVersion] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState(
    () => (notificationsSupported() ? (nowPlayingPermission() as ReturnType<typeof nowPlayingPermission>) : 'unsupported'),
  );

  useEffect(() => {
    if (neteaseAuth.user) return;
    let cancelled = false;
    let timer: number | undefined;
    const begin = async () => {
      setNeteaseQrState('loading');
      setNeteaseLoginMsg('');
      try {
        const key = await getNeteaseQrKey();
        if (cancelled) return;
        setNeteaseQrKey(key);
        setNeteaseQrState('waiting');
        const poll = async () => {
          try {
            const result = await checkNeteaseQr(key);
            if (cancelled) return;
            if (result.code === 803) {
              // Stop polling immediately on success so a later 800 cannot overwrite the UI.
              const loginCookie = (result.cookie || result.data?.cookie || '').trim();
              setNeteaseQrState('success');
              if (!loginCookie) {
                setNeteaseLoginMsg('扫码成功，但未获取到登录凭据，请重新扫码');
                return;
              }
              try {
                const user = await getNeteaseUser(loginCookie);
                if (cancelled) return;
                neteaseAuth.setSession(loginCookie, user);
                setNeteaseLoginMsg('登录成功');
              } catch {
                if (!cancelled) setNeteaseLoginMsg('扫码成功，但获取账号资料失败，请稍后重试');
              }
              return;
            }
            if (result.code === 802) setNeteaseQrState('scanned');
            else if (result.code === 800) {
              setNeteaseQrState('expired');
              setNeteaseLoginMsg('二维码已过期，请重新获取');
              return;
            }
          } catch {
            if (!cancelled) setNeteaseQrState('error');
          }
          if (!cancelled) timer = window.setTimeout(poll, 2500);
        };
        timer = window.setTimeout(poll, 1200);
      } catch (error) {
        if (!cancelled) {
          setNeteaseQrState('error');
          setNeteaseLoginMsg(error instanceof Error ? error.message : '获取二维码失败');
        }
      }
    };
    void begin();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [neteaseAuth.user, neteaseQrVersion]);

  const refreshNeteaseQr = () => {
    setNeteaseQrKey('');
    setNeteaseQrState('idle');
    setNeteaseQrVersion((version) => version + 1);
  };

  const saveApiUrl = () => {
    const value = apiUrl.trim();
    setMusicApiUrls(value ? [value] : [DEFAULT_MUSIC_API_URL]);
    setApiSaved(true);
    window.setTimeout(() => setApiSaved(false), 1500);
  };


  /** Check server-side AI configuration and pull its authorized model list. */
  const testKeyAndFetchModels = async () => {
    setModelLoading(true);
    setModelMsg('');
    setModels([]);
    try {
      const status = await getAiStatus();
      setServerConfigured(status.configured);
      setServerEndpoint(status.endpoint);
      if (!status.configured) {
        setModelMsg('服务端未配置 AI Key');
        return;
      }
      const list = await listAiModels();
      setModels(list);
      const activeModel = status.model && list.includes(status.model) ? status.model : list[0];
      setModelMsg(list.length ? '服务端连接正常，发现 ' + list.length + ' 个模型' + (activeModel && activeModel !== ai.model ? '，已切换到 ' + activeModel : '') : '服务端连接正常，但没有返回模型');
      if (activeModel && activeModel !== ai.model) ai.setConfig({ model: activeModel });
    } catch (e) {
      setModelMsg('测试失败：' + (e as Error).message);
    } finally {
      setModelLoading(false);
    }
  };

  return (
    <div className="page page--narrow">
      <h1 className="page-title">设置</h1>

      <SectionHeader title="外观" />
      <div className="settings-card">
        <div className="theme-options">
          {themeOptions.map((opt) => (
            <button
              key={opt.key}
              className={'theme-option' + (themeMode === opt.key ? ' theme-option--active' : '')}
              onClick={() => setThemeMode(opt.key)}
            >
              <Icon name={opt.icon} size={20} />
              <span>{opt.label}</span>
              {themeMode === opt.key ? <Icon name="check" size={15} className="theme-option__check" /> : null}
            </button>
          ))}
        </div>
      </div>

      <SectionHeader title="AI 伴侣" />
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">服务端 AI 连接</div>
            <div className="settings-row__desc">
              {serverConfigured === true ? '已配置，Key 仅保存在后端环境变量中' : serverConfigured === false ? '未配置后端 AI Key' : 'Key 不会进入浏览器或前端请求'}
              {serverEndpoint ? ' · ' + serverEndpoint : ''}
            </div>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">检查连接与获取模型</div>
            <div className="settings-row__desc">通过本地服务端代理检查配置，不会在页面显示 Key</div>
            <div className="picker-create" style={{ padding: '8px 0 2px' }}>
              <button
                className="am-btn am-btn--primary am-btn--sm"
                onClick={() => void testKeyAndFetchModels()}
              >
                {modelLoading ? '检查中…' : '检查服务端 AI'}
              </button>
            </div>
            {modelMsg ? (
              <div
                className="settings-row__desc"
                style={modelMsg.includes('正常') ? { color: '#2f9e63', fontWeight: 600 } : { color: '#d84f4f' }}
              >
                {modelMsg}
              </div>
            ) : null}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">模型</div>
            <div className="settings-row__desc">测试成功后从列表选择，或手动填写</div>
            <div className="picker-create" style={{ padding: '8px 0 2px' }}>
              {models.length ? (
                <select
                  className="picker-create__input"
                  value={ai.model}
                  onChange={(e) => ai.setConfig({ model: e.target.value })}
                >
                  {!models.includes(ai.model) && ai.model ? (
                    <option value={ai.model}>{ai.model}</option>
                  ) : null}
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="picker-create__input"
                  value={ai.model}
                  placeholder="例如 deepseek-…"
                  onChange={(e) => ai.setConfig({ model: e.target.value })}
                />
              )}
            </div>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">Aurora 性格</div>
            <div className="settings-row__desc">决定她陪你听歌时的语气</div>
          </div>
          <div className="quality-options">
            {personaOptions.map((opt) => (
              <button
                key={opt.key}
                title={opt.desc}
                className={'quality-chip' + (ai.persona === opt.key ? ' quality-chip--active' : '')}
                onClick={() => ai.setConfig({ persona: opt.key })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">切歌陪伴</div>
            <div className="settings-row__desc">每次切歌自动读取歌词并生成 2-4 句歌曲解读（需要已配置 Key）</div>
          </div>
          <Switch checked={ai.companion} onChange={(v) => ai.setConfig({ companion: v })} />
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">主动陪伴</div>
            <div className="settings-row__desc">时段问候、连听关心与每周听歌报告</div>
          </div>
          <Switch checked={ai.proactive} onChange={(v) => ai.setConfig({ proactive: v })} />
        </div>
      </div>

      <SectionHeader title="账号与登录" />
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">网易云音乐</div>
            <div className="settings-row__desc">
              {neteaseAuth.user ? '已登录 · ' + neteaseAuth.user.nickname : '登录后可读取账号歌单和个性化信息'}
            </div>
          </div>
          {neteaseAuth.user?.avatarUrl ? <img className="settings-account-avatar" src={neteaseAuth.user.avatarUrl} alt="" /> : null}
        </div>
        {neteaseAuth.user ? (
          <div className="settings-row">
            <button className="am-btn am-btn--ghost am-btn--sm" onClick={() => neteaseAuth.logout()}>退出网易云登录</button>
          </div>
        ) : (
          <div className="settings-qr-login">
            {neteaseQrKey && neteaseQrState !== 'expired' && neteaseQrState !== 'error' ? <QRCodeSVG value={'https://music.163.com/login?codekey=' + encodeURIComponent(neteaseQrKey)} size={176} includeMargin level="M" /> : <div className="settings-qr-placeholder">{neteaseQrState === 'loading' ? '获取二维码…' : '二维码不可用'}</div>}
            <div className="settings-qr-status">{neteaseQrState === 'waiting' ? '请使用网易云音乐 App 扫码' : neteaseQrState === 'scanned' ? '已扫码，请在手机上确认' : neteaseQrState === 'success' ? '登录成功' : neteaseQrState === 'expired' ? '二维码已过期' : neteaseQrState === 'error' ? '二维码加载失败' : '准备二维码…'}</div>
            {(neteaseQrState === 'expired' || neteaseQrState === 'error') ? <button className="am-btn am-btn--ghost am-btn--sm" onClick={refreshNeteaseQr}>重新获取</button> : null}
          </div>
        )}
        {neteaseLoginMsg ? <div className="settings-account-note">{neteaseLoginMsg}</div> : null}
        <div className="settings-account-note">扫码登录由网易云官方完成，登录凭据仅保存在本机浏览器。</div>
      </div>

      <SectionHeader title="音源" />
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">启用的音源</div>
            <div className="settings-row__desc">网易云音乐 · Joox · 本地曲库（搜索页可切换）</div>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">音乐 API 节点</div>
            <div className="settings-row__desc">失效节点会自动进入 5 分钟冷却并切换备用节点</div>
          </div>
        </div>
        <div className="picker-create" style={{ padding: '0 0 14px' }}>
          <input
            className="picker-create__input"
            value={apiUrl}
            placeholder={DEFAULT_MUSIC_API_URL}
            onChange={(e) => setApiUrl(e.target.value)}
          />
          <button className="am-btn am-btn--primary am-btn--sm" onClick={saveApiUrl}>
            {apiSaved ? '已保存' : '保存'}
          </button>
          <button
            className="am-btn am-btn--ghost am-btn--sm"
            onClick={() => {
              setApiUrl(DEFAULT_MUSIC_API_URL);
              setMusicApiUrls([DEFAULT_MUSIC_API_URL]);
            }}
          >
            恢复默认
          </button>
        </div>
      </div>

      <SectionHeader title="播放" />
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">自动播放下一首</div>
            <div className="settings-row__desc">歌曲结束后继续播放队列</div>
          </div>
          <Switch checked={settings.autoplayNext} onChange={settings.setAutoplayNext} />
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">音质</div>
            <div className="settings-row__desc">更高音质会消耗更多流量</div>
          </div>
          <div className="quality-options">
            {qualityOptions.map((opt) => (
              <button
                key={opt.key}
                className={'quality-chip' + (settings.quality === opt.key ? ' quality-chip--active' : '')}
                onClick={() => settings.setQuality(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">切歌桌面通知</div>
            <div className="settings-row__desc">
              {notificationPermission === 'granted'
                ? '应用在后台时通知当前歌曲（可在系统权限中关闭）'
                : notificationPermission === 'denied'
                  ? '通知权限已被拒绝，请在浏览器/系统设置中放行'
                  : '应用切到后台时通知当前歌曲'}
            </div>
          </div>
          {notificationPermission === 'granted' ? (
            <span className="settings-row__value">已开启</span>
          ) : notificationPermission === 'denied' ? (
            <span className="settings-row__value">已阻止</span>
          ) : notificationPermission === 'unsupported' ? null : (
            <button
              className="am-btn am-btn--secondary am-btn--sm"
              onClick={() => {
                void requestNowPlayingPermission().then((p) => {
                  if (notificationsSupported()) setNotificationPermission(p);
                });
              }}
            >
              开启
            </button>
          )}
        </div>
      </div>

      <SectionHeader title="关于" />
      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">Aurora Music</div>
            <div className="settings-row__desc">版本 0.3.0 · HyperOS 风格现代音乐播放器 · Aurora AI 伴侣</div>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row__body">
            <div className="settings-row__title">音源架构说明</div>
            <div className="settings-row__desc">音源架构参考 Otter Music 的 Provider 工厂设计：搜索支持网易云与 Joox，QQ音乐官方榜曲目通过 Joox 匹配播放</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={'am-switch' + (checked ? ' am-switch--on' : '')}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="am-switch__thumb" />
    </button>
  );
}
