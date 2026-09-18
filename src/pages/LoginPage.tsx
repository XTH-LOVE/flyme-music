import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useAuthStore, isValidPassword } from '@/store/useAuthStore';
import { notify } from '@/utils/notify';
import './login-page.css';

/**
 * 全屏账号登录页（QQ 音乐风格）：大圆角输入框、超大登录按钮、
 * 协议勾选与底部快捷入口。登录/注册共用本页，只保留账号密码方式。
 */
export function LoginPage() {
  const navigate = useNavigate();
  const loginUsername = useAuthStore((s) => s.loginUsername);
  const registerUsername = useAuthStore((s) => s.registerUsername);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Gate the button with the exact same rule the store enforces, so a 6-7
  // char password can no longer be submitted and then rejected.
  const canSubmit = username.trim().length >= 2 && isValidPassword(password, mode) && agreed && !busy;

  const submit = async () => {
    if (busy) return;
    if (!agreed) {
      setMsg('请先阅读并同意服务协议和隐私政策');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const result =
        mode === 'login'
          ? await loginUsername(username.trim(), password)
          : await registerUsername(username.trim(), username.trim(), password);
      if (result.ok) {
        notify(mode === 'login' ? '欢迎回来' : '注册成功，欢迎加入');
        navigate('/me');
      } else {
        setMsg(result.message ?? '操作失败，请稍后再试');
      }
    } catch {
      setMsg('网络异常，请稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page login-page">
      <button className="login-page__back" onClick={() => navigate(-1)} aria-label="返回">
        <Icon name="chevronLeft" size={24} />
      </button>
      <button className="login-page__back login-page__back--right" onClick={() => navigate('/settings')} aria-label="扫码登录">
        <Icon name="settings" size={20} />
      </button>

      <h1 className="login-page__title">{mode === 'login' ? '登录账号' : '注册账号'}</h1>

      <div className="login-page__form">
        <input
          className="login-page__field"
          value={username}
          placeholder={mode === 'login' ? '输入账号名' : '设置账号名（中文/字母/数字）'}
          autoComplete="username"
          maxLength={20}
          onChange={(e) => setUsername(e.target.value)}
        />
        <div className="login-page__pw">
          <input
            className="login-page__field"
            type={showPassword ? 'text' : 'password'}
            value={password}
            placeholder={mode === 'login' ? '输入密码' : '设置密码（8 位以上，含字母和数字）'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            maxLength={64}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="login-page__eye" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>
            <Icon name={showPassword ? 'close' : 'check'} size={16} />
          </button>
        </div>
      </div>

      {msg ? <div className="login-page__msg" role="alert">{msg}</div> : null}

      <button className={'login-page__submit' + (canSubmit ? ' login-page__submit--ready' : '')} disabled={busy} onClick={() => void submit()}>
        {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
      </button>

      <div className="login-page__agree">
        <button
          className={'login-page__agree-dot' + (agreed ? ' login-page__agree-dot--on' : '')}
          onClick={() => setAgreed((v) => !v)}
          aria-label={agreed ? '已同意协议' : '同意协议'}
        >
          {agreed ? <span className="login-page__agree-dot-inner" /> : null}
        </button>
        <span>
          已阅读并同意<b>服务协议</b>和<b>隐私政策</b>
        </span>
      </div>

      <div className="login-page__switch">
        {mode === 'login' ? (
          <button className="login-page__quick" onClick={() => setMode('register')}>
            <span className="login-page__quick-icon"><Icon name="user" size={22} /></span>
            <span>注册账号</span>
          </button>
        ) : (
          <button className="login-page__quick" onClick={() => setMode('login')}>
            <span className="login-page__quick-icon"><Icon name="user" size={22} /></span>
            <span>返回登录</span>
          </button>
        )}
        <button className="login-page__quick" onClick={() => navigate('/settings')}>
          <span className="login-page__quick-icon"><Icon name="music" size={22} /></span>
          <span>扫码登录网易云</span>
        </button>
      </div>
    </div>
  );
}
