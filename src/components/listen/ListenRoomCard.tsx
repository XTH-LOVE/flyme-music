import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useListenStore } from '@/store/useListenStore';
import { hostListenRoom, joinListenRoom, leaveListenRoom } from '@/hooks/useListenRoom';
import { useAuthStore } from '@/store/useAuthStore';
import { Link } from 'react-router-dom';

/**
 * 一起听房间卡片：创建/加入 6 位房间码房间。房主控制播放，客人跟随；
 * 状态经 Supabase Realtime 同步（见 listen/listenRoom.ts）。
 */
export function ListenRoomCard() {
  const status = useListenStore((s) => s.status);
  const code = useListenStore((s) => s.code);
  const role = useListenStore((s) => s.role);
  const peer = useListenStore((s) => s.peer);
  const error = useListenStore((s) => s.error);
  const user = useAuthStore((s) => s.user);
  const [joinCode, setJoinCode] = useState('');
  const [joinOpen, setJoinOpen] = useState(false);

  if (status === 'active' && code) {
    return (
      <div className="ai-side-card listen-card listen-card--on">
        <div className="ai-side-card__title">一起听 · 房间 {code}</div>
        <div className="listen-card__peer">
          {role === 'host' ? '你是房主，对方正在同步收听' : '正在跟随房主收听'}
          {peer ? ' · ' + peer.nickname : role === 'host' ? ' · 等待对方加入…' : ''}
        </div>
        <button
          className="am-btn am-btn--secondary am-btn--sm listen-card__leave"
          onClick={() => void leaveListenRoom()}
        >
          {role === 'host' ? '关闭房间' : '离开房间'}
        </button>
      </div>
    );
  }

  return (
    <div className="ai-side-card listen-card">
      <div className="ai-side-card__title">一起听</div>
      <div className="ai-side-card__desc">
        创建房间把 6 位码告诉朋友，或输入对方的房间码，异地同步听同一首歌。
      </div>
      {status === 'connecting' ? (
        <div className="ai-side-card__desc">连接中…</div>
      ) : status === 'error' ? (
        <div className="ai-side-card__desc listen-card__error">{error}</div>
      ) : joinOpen ? (
        <div className="listen-card__join">
          <input
            className="picker-create__input"
            value={joinCode}
            placeholder="6 位房间码"
            maxLength={6}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && joinCode.length === 6) {
                setJoinOpen(false);
                void joinListenRoom(joinCode);
              }
            }}
          />
          <button
            className="am-btn am-btn--primary am-btn--sm"
            disabled={joinCode.length !== 6}
            onClick={() => {
              setJoinOpen(false);
              void joinListenRoom(joinCode);
            }}
          >
            加入
          </button>
        </div>
      ) : (
        <div className="listen-card__actions">
          <button className="am-btn am-btn--primary am-btn--sm" onClick={() => void hostListenRoom()}>
            <Icon name="music" size={14} />
            创建房间
          </button>
          <button className="am-btn am-btn--secondary am-btn--sm" onClick={() => setJoinOpen(true)}>
            加入房间
          </button>
        </div>
      )}
      {!user ? (
        <Link className="ai-side-card__link" to="/me">
          <Icon name="user" size={14} />
          一起听需要先登录 Aurora 账号
        </Link>
      ) : null}
    </div>
  );
}
