import { useCallback, useEffect, useRef, useState } from 'react';
import { checkNeteaseQr, getNeteaseQrKey, getNeteaseUser } from '@/music/netease/netease-auth';
import { useNeteaseAuthStore } from '@/store/useNeteaseAuthStore';

/**
 * The Netease sign-in, as a self-contained flow.
 *
 * Extracted from the settings page so the sign-in page can offer it directly.
 * Sending someone to Settings to scan a code, then back, is two navigations and
 * a lost place for something that is one step.
 *
 * The polling rules are the ones the settings page already used, and they are
 * worth stating because they are not obvious:
 *
 *  - 803 means signed in. Polling stops immediately, so a later 800 cannot
 *    overwrite a success with an expiry.
 *  - 802 means scanned but not confirmed, which is a different state to "still
 *    waiting" and is shown as such - the person has done something and wants to
 *    see that it registered.
 *  - 800 means the code expired, and the flow stops rather than polling a dead
 *    key forever.
 *
 * The interval is 2.5s. Faster would be a request every second for something
 * that changes at human speed.
 */

export type QrState = 'idle' | 'loading' | 'waiting' | 'scanned' | 'expired' | 'success' | 'error';

const POLL_INTERVAL_MS = 2500;
const FIRST_POLL_MS = 1200;

export interface NeteaseQrLogin {
  state: QrState;
  /** What to draw in the QR box; empty until the key arrives. */
  qrValue: string;
  message: string;
  /** Restarts the flow, for an expired code or a manual retry. */
  restart: () => void;
}

export function useNeteaseQrLogin(enabled: boolean): NeteaseQrLogin {
  const [state, setState] = useState<QrState>('idle');
  const [qrKey, setQrKey] = useState('');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  // A ref, not state: the effect that runs the flow must not re-run when the
  // timer is replaced, or every poll would restart the whole thing.
  const timer = useRef<number | undefined>(undefined);

  const restart = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const begin = async () => {
      setState('loading');
      setMessage('');
      setQrKey('');
      try {
        const key = await getNeteaseQrKey();
        if (cancelled) return;
        setQrKey(key);
        setState('waiting');

        const poll = async () => {
          try {
            const result = await checkNeteaseQr(key);
            if (cancelled) return;

            if (result.code === 803) {
              const cookie = (result.cookie || result.data?.cookie || '').trim();
              setState('success');
              if (!cookie) {
                setMessage('扫码成功，但未获取到登录凭据，请重新扫码');
                return;
              }
              try {
                const user = await getNeteaseUser(cookie);
                if (cancelled) return;
                // Read the action off the store rather than closing over the
                // whole object: its identity changes on every update, and
                // depending on it would restart the poll on each tick.
                useNeteaseAuthStore.getState().setSession(cookie, user);
                setMessage('登录成功');
              } catch {
                if (!cancelled) setMessage('扫码成功，但获取账号资料失败，请稍后重试');
              }
              return;
            }

            if (result.code === 802) setState('scanned');
            else if (result.code === 800) {
              setState('expired');
              setMessage('二维码已过期，点一下重新获取');
              return;
            }
          } catch {
            if (!cancelled) setState('error');
          }
          if (!cancelled) timer.current = window.setTimeout(poll, POLL_INTERVAL_MS);
        };

        timer.current = window.setTimeout(poll, FIRST_POLL_MS);
      } catch (error) {
        if (cancelled) return;
        setState('error');
        setMessage(error instanceof Error ? error.message : '获取二维码失败');
      }
    };

    void begin();
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [enabled, attempt]);

  return {
    state,
    qrValue: qrKey ? 'https://music.163.com/login?codekey=' + encodeURIComponent(qrKey) : '',
    message,
    restart,
  };
}
