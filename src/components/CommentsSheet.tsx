import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { BottomSheet } from '@/design-system/components/BottomSheet';
import { Skeleton } from '@/design-system/components/Skeleton';
import { getHotComments, type NetComment } from '@/music/netease/netease-api';
import { formatPlays } from '@/utils/format';
import './actions.css';

interface CommentsSheetProps {
  open: boolean;
  trackName: string;
  songId: string;
  onClose: () => void;
}

/** Real hot comments from Netease. */
export function CommentsSheet({ open, trackName, songId, onClose }: CommentsSheetProps) {
  const [comments, setComments] = useState<NetComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setComments(null);
    setError(null);
    getHotComments(songId)
      .then((list) => {
        if (alive) setComments(list);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [open, songId]);

  const renderBody = () => {
    if (!comments && !error) {
      return (
        <div className="comments-list">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="comment-row">
              <Skeleton width={38} height={38} radius="50%" />
              <div style={{ flex: 1 }}>
                <Skeleton width={90} height={12} />
                <Skeleton width="80%" height={12} className="mt8" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (error) {
      return <div className="comments-empty">评论加载失败：{error}</div>;
    }
    const list = comments ?? [];
    if (!list.length) {
      return <div className="comments-empty">还没有热评</div>;
    }
    return (
      <div className="comments-list">
        {list.map((c, i) => (
          <div key={i} className="comment-row">
            {c.avatarUrl ? (
              <img className="comment-avatar" src={c.avatarUrl} alt={c.nickname} loading="lazy" />
            ) : (
              <div className="comment-avatar comment-avatar--placeholder">
                <Icon name="user" size={18} />
              </div>
            )}
            <div className="comment-body">
              <div className="comment-head">
                <span className="comment-user">{c.nickname}</span>
                <span className="comment-like">
                  <Icon name="heart" size={12} />
                  {formatPlays(c.likedCount)}
                </span>
              </div>
              <div className="comment-content">{c.content}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <BottomSheet open={open} title={'评论 · ' + trackName} onClose={onClose}>
      {renderBody()}
    </BottomSheet>
  );
}
