import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { generatePlaylistFromTheme, type GeneratedPlaylist } from '@/ai/generatePlaylist';
import { aiConfigured } from '@/store/useAiStore';
import { useAiStore } from '@/store/useAiStore';
import { notify } from '@/utils/notify';
import './ai-playlist.css';

/**
 * Describe a playlist, get a playlist.
 *
 * One field and one button. The interesting part is what it says afterwards:
 * how many tracks were found out of how many were named, and which ones were
 * not. A playlist that quietly comes back short teaches the user that the
 * feature is unreliable; one that says "12 首，没找到 3 首" teaches them what it
 * actually does.
 */

const PRESETS = [
  '适合下雨天的歌',
  '深夜写代码，不要太吵',
  '90 年代粤语金曲',
  '开车时听的，节奏明快',
];

export function AiPlaylistBuilder() {
  const configured = useAiStore((s) => aiConfigured(s));
  const [theme, setTheme] = useState('');
  const [size, setSize] = useState(20);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GeneratedPlaylist | null>(null);

  const run = async () => {
    if (!theme.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const made = await generatePlaylistFromTheme({ theme: theme.trim(), size });
      setResult(made);
      notify('已创建歌单「' + made.name + '」，' + made.found.length + ' 首');
    } catch (error) {
      notify(error instanceof Error ? error.message : '生成失败');
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <div className="aip aip--off">
        <Icon name="music" size={18} />
        <div>
          <div className="aip__title">AI 生成歌单</div>
          <div className="aip__sub">先去设置里配置 AI，就能用一句话生成歌单。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="aip">
      <div className="aip__head">
        <Icon name="music" size={18} />
        <span className="aip__title">AI 生成歌单</span>
      </div>
      <div className="aip__sub">描述想要的感觉，AI 会挑歌并建好歌单。</div>

      <div className="aip__row">
        <input
          className="aip__input"
          value={theme}
          placeholder="例如：适合下雨天的歌"
          onChange={(event) => setTheme(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void run();
          }}
          disabled={busy}
        />
        <button className="aip__go" onClick={() => void run()} disabled={busy || !theme.trim()}>
          {busy ? '生成中…' : '生成'}
        </button>
      </div>

      {/*
        Presets rather than a blank field alone: describing a mood is a skill,
        and an empty box teaches people that they are bad at it.
      */}
      {!theme && !result ? (
        <div className="aip__presets">
          {PRESETS.map((preset) => (
            <button key={preset} className="aip__preset" onClick={() => setTheme(preset)}>
              {preset}
            </button>
          ))}
        </div>
      ) : null}

      <div className="aip__size">
        <span>想要 {size} 首</span>
        <input
          type="range"
          min={10}
          max={50}
          step={5}
          value={size}
          onChange={(event) => setSize(Number(event.target.value))}
          disabled={busy}
        />
      </div>

      {result ? (
        <div className="aip__result">
          <div className="aip__result-line">
            已建歌单「{result.name}」，共 <strong>{result.found.length}</strong> 首
          </div>
          <ul className="aip__tracks">
            {result.found.slice(0, 8).map((track) => (
              <li key={track.source + ':' + track.id}>{track.name}</li>
            ))}
            {result.found.length > 8 ? <li className="aip__more">…还有 {result.found.length - 8} 首</li> : null}
          </ul>
          {result.missing.length ? (
            <div className="aip__missing">
              没找到：{result.missing.slice(0, 5).join('、')}
              {result.missing.length > 5 ? ' 等 ' + result.missing.length + ' 首' : ''}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
