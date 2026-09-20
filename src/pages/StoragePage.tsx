import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useNavigate } from 'react-router-dom';
import { clearOfflineCache, formatBytes, offlineStats } from '@/library/offlineCache';
import { getAllLocalTracks } from '@/library/localLibrary';
import { clearPicCache, picCacheStats } from '@/music/source/track-resolver';
import { notify } from '@/utils/notify';
import './storage.css';

interface Usage {
  count: number;
  bytes: number;
}

/**
 * Storage manager: shows what the app keeps on disk and lets the user reclaim
 * it. The local music library is listed read-only on purpose - those are the
 * user's own files, so deleting them is a deliberate action taken on the local
 * music page, not a side effect of "free up space".
 */
export function StoragePage() {
  const navigate = useNavigate();
  const [audio, setAudio] = useState<Usage>({ count: 0, bytes: 0 });
  const [pics, setPics] = useState<Usage>({ count: 0, bytes: 0 });
  const [localCount, setLocalCount] = useState(0);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);

  const refresh = useCallback(async () => {
    setAudio(await offlineStats());
    setPics(picCacheStats());
    try {
      setLocalCount((await getAllLocalTracks()).length);
    } catch {
      setLocalCount(0);
    }
    try {
      const info = await navigator.storage?.estimate?.();
      if (info) setEstimate({ usage: info.usage ?? 0, quota: info.quota ?? 0 });
    } catch {
      /* estimate() is best-effort */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runClear = async (what: 'audio' | 'pics', message: string) => {
    setBusy(what);
    try {
      if (what === 'audio') await clearOfflineCache();
      else clearPicCache();
      await refresh();
      notify(message);
    } catch {
      notify('清理失败，请稍后重试');
    } finally {
      setBusy(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirmingAll) {
      setConfirmingAll(true);
      return;
    }
    setConfirmingAll(false);
    setBusy('all');
    try {
      await clearOfflineCache();
      clearPicCache();
      await refresh();
      notify('缓存已全部清理');
    } catch {
      notify('清理失败，请稍后重试');
    } finally {
      setBusy(null);
    }
  };

  const reclaimed = audio.bytes + pics.bytes;
  const quotaPercent =
    estimate && estimate.quota > 0 ? Math.min(100, (estimate.usage / estimate.quota) * 100) : null;

  return (
    <div className="storage-page">
      <div className="storage-head">
        <div className="storage-head__title">存储管理</div>
        <div className="storage-head__sub">
          可清理 {formatBytes(reclaimed)} · 本地曲库 {localCount} 首
        </div>
      </div>

      {quotaPercent !== null ? (
        <div className="storage-quota">
          <div className="storage-quota__bar">
            <div className="storage-quota__fill" style={{ width: quotaPercent.toFixed(1) + '%' }} />
          </div>
          <div className="storage-quota__text">
            浏览器已用 {formatBytes(estimate!.usage)} / {formatBytes(estimate!.quota)}
          </div>
        </div>
      ) : null}

      <div className="storage-list">
        <div className="storage-row">
          <div className="storage-row__icon">
            <Icon name="download" size={17} />
          </div>
          <div className="storage-row__body">
            <div className="storage-row__title">离线音频缓存</div>
            <div className="storage-row__desc">
              {audio.count} 首 · {formatBytes(audio.bytes)} · 播放过的歌曲自动缓存，清理后重新播放会再次下载
            </div>
          </div>
          <button
            className="am-btn am-btn--secondary am-btn--sm"
            disabled={!audio.count || busy !== null}
            onClick={() => void runClear('audio', '离线音频缓存已清理')}
          >
            {busy === 'audio' ? '清理中…' : '清理'}
          </button>
        </div>

        <div className="storage-row">
          <div className="storage-row__icon">
            <Icon name="album" size={17} />
          </div>
          <div className="storage-row__body">
            <div className="storage-row__title">封面图片缓存</div>
            <div className="storage-row__desc">
              {pics.count} 张 · 约 {formatBytes(pics.bytes)} · 清理后封面需要重新加载
            </div>
          </div>
          <button
            className="am-btn am-btn--secondary am-btn--sm"
            disabled={!pics.count || busy !== null}
            onClick={() => void runClear('pics', '封面缓存已清理')}
          >
            {busy === 'pics' ? '清理中…' : '清理'}
          </button>
        </div>

        <div className="storage-row storage-row--muted">
          <div className="storage-row__icon">
            <Icon name="music" size={17} />
          </div>
          <div className="storage-row__body">
            <div className="storage-row__title">本地曲库</div>
            <div className="storage-row__desc">{localCount} 首 · 你自己的音乐文件，不在此处清理</div>
          </div>
          <button className="am-btn am-btn--ghost am-btn--sm" onClick={() => navigate('/local')}>
            去管理
          </button>
        </div>
      </div>

      <button
        className={'am-btn am-btn--md ' + (confirmingAll ? 'am-btn--danger' : 'am-btn--secondary')}
        disabled={busy !== null || reclaimed === 0}
        onClick={() => void handleClearAll()}
        onBlur={() => setConfirmingAll(false)}
      >
        <Icon name="trash" size={15} />
        {confirmingAll ? '确认清理全部缓存？' : '清理全部缓存'}
      </button>
    </div>
  );
}
