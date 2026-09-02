import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { TrackCover } from '@/components/TrackCover';
import { playerController } from '@/player';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useLibraryStore } from '@/store/useLibraryStore';
import { useAiStore, aiConfigured, nextAiMsgId, type AiMessage, type AiPersona } from '@/store/useAiStore';
import { chatStreamWithFallback, type AiChatMessage } from '@/ai/aiClient';
import {
  buildSystemPrompt,
  parseToolCalls,
  describeToolCall,
  stripToolCall,
  executeTool,
  localAssistant,
  listeningStatsBlock,
  buildPageContext,
  requiresAgentConfirmation,
  type ToolCtx,
} from '@/ai/aiTools';
import { fetchLyricLines, lyricLineAt } from '@/utils/currentLyric';
import { loadMemories, memoryBlock, scheduleMemoryExtraction } from '@/ai/memory';
import { MemoryPanel } from '@/ai/memoryUi';
import type { MusicTrack } from '@/music/source/types';
import './ai-page.css';

const QUICK = [
  { label: '开心电台', text: '我现在心情很开心，开个心情电台' },
  { label: '深夜电台', text: '深夜了，开个安静的深夜电台' },
  { label: '建个歌单', text: '帮我建个轻松午后的歌单' },
  { label: '听歌报告', text: '给我一份听歌报告' },
  { label: '分析这首歌', text: '帮我分析一下现在这首歌' },
];

const personaLabels: Record<AiPersona, string> = {
  gentle: '温柔陪伴',
  sharp: '毒舌乐评人',
  chuuni: '中二电台',
};

function SongResults({ tracks }: { tracks: MusicTrack[] }) {
  return (
    <div className="ai-songs">
      <button className="ai-songs__all" onClick={() => playerController.playTracks(tracks, 0)}>
        <Icon name="play" size={13} />
        播放全部（{tracks.length} 首）
      </button>
      {tracks.map((t, i) => (
        <div key={t.source + ':' + t.id + '-' + i} className="ai-song">
          <div className="ai-song__cover">
            <TrackCover track={t} bare radius="9px" />
          </div>
          <div className="ai-song__body">
            <div className="ai-song__name">
              {t.name}
              {i === 0 ? <span className="ai-song__badge">原版优选</span> : null}
            </div>
            <div className="ai-song__artist">{t.artist.join(' / ')}</div>
          </div>
          <button className="ai-song__plus" aria-label="加入队列" onClick={() => playerController.addToQueue([t])}>
            <Icon name="queue" size={15} />
          </button>
          <button className="ai-song__play" aria-label="播放" onClick={() => playerController.playTracks(tracks, i)}>
            <Icon name="play" size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function PlaylistCard({ id, name, tracks }: { id: string; name: string; tracks: MusicTrack[] }) {
  const navigate = useNavigate();
  return (
    <div className="ai-pl">
      <div className="ai-pl__collage">
        {tracks.slice(0, 4).map((t, i) => (
          <div key={t.source + ':' + t.id + '-' + i} className="ai-pl__cell">
            <TrackCover track={t} bare radius="0" />
          </div>
        ))}
      </div>
      <div className="ai-pl__body">
        <div className="ai-pl__name">{name}</div>
        <div className="ai-pl__meta">{tracks.length} 首 · Aurora 创建</div>
      </div>
      <button className="ai-pl__open" onClick={() => navigate('/my-playlist/' + id)}>
        打开
      </button>
      <button className="ai-song__play" aria-label="播放歌单" onClick={() => playerController.playTracks(tracks, 0)}>
        <Icon name="play" size={15} />
      </button>
    </div>
  );
}

function MessageView({ m, onRetry }: { m: AiMessage; onRetry?: () => void }) {
  if (m.kind === 'song' && m.tracks?.length) {
    const t = m.tracks[0];
    return (
      <div className="ai-song-event">
        <div className="ai-timeline">
          <span className="ai-timeline__time">
            {new Date(m.ts ?? Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div className="ai-timeline__cover">
            <TrackCover track={t} bare radius="7px" />
          </div>
          <span className="ai-timeline__text">
            正在播放 <b>《{t.name}》</b> {t.artist.join(' / ')}
          </span>
        </div>
        {m.text || m.thought || m.streaming ? (
          <div className="ai-song-event__analysis">
            <span className="ai-song-event__label">
              Aurora 歌曲解读
              {m.analysisStatus === 'pending' ? ' · 分析中' : null}
              {m.analysisStatus === 'ready' ? ' · 已完成' : null}
              {m.analysisStatus === 'error' ? ' · 稍后重试' : null}
              {m.analysisStatus === 'skipped' ? ' · 未启用' : null}
            </span>
            <div className="ai-song-event__text">
              {m.thought ? <div className="ai-song-event__thought">{m.thought}</div> : null}
              {m.text}
              {m.streaming ? <span className="ai-card__cursor" /> : null}
            </div>
            {m.analysisStatus === 'error' && onRetry ? (
              <button className="ai-song-event__retry" onClick={onRetry} type="button">
                <Icon name="arrowRight" size={14} />
                重新分析
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className={'ai-card ai-card--' + m.role + (m.error ? ' ai-card--error' : '')}>
      {m.steps?.length ? (
        <div className="ai-card__steps">
          {m.steps.map((s, i) => (
            <span key={i} className="ai-card__step">
              {s}
            </span>
          ))}
        </div>
      ) : null}
      {m.text ? (
        <div className="ai-card__text">
          {m.text}
          {m.streaming ? <span className="ai-card__cursor" /> : null}
        </div>
      ) : m.streaming ? (
        <div className="ai-card__text">
          <span className="ai-card__cursor" />
        </div>
      ) : null}
      {m.tracks?.length ? <SongResults tracks={m.tracks} /> : null}
      {m.playlist ? <PlaylistCard id={m.playlist.id} name={m.playlist.name} tracks={m.playlist.tracks} /> : null}
    </div>
  );
}

function AiContextPanel({
  current,
  configured,
  model,
  persona,
  dislikes,
  onPersona,
  onOpenPlayer,
  onClose,
}: {
  current: MusicTrack | null;
  configured: boolean;
  model: string;
  persona: AiPersona;
  dislikes: string[];
  onPersona: (persona: AiPersona) => void;
  onOpenPlayer: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ai-context" role="dialog" aria-modal="true" aria-label="AI 上下文">
      <button className="ai-context__scrim" aria-label="关闭上下文" onClick={onClose} />
      <div className="ai-context__panel">
        <div className="ai-context__head">
          <div>
            <div className="ai-context__title">当前上下文</div>
            <div className="ai-context__sub">{configured ? '在线 · ' + model : '本地模式'}</div>
          </div>
          <button className="ai-page__clear" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>
        {current ? (
          <button className="ai-context__now" onClick={onOpenPlayer} type="button">
            <div className="ai-now__cover">
              <TrackCover track={current} bare radius="14px" />
            </div>
            <div className="ai-now__body">
              <div className="ai-now__label">正在播放</div>
              <div className="ai-now__name">{current.name}</div>
              <div className="ai-now__artist">{current.artist.join(' / ')}</div>
            </div>
            <Icon name="chevronRight" size={18} />
          </button>
        ) : (
          <div className="ai-context__empty">暂时没有正在播放的歌曲</div>
        )}
        <div className="ai-context__section">
          <div className="ai-side-card__title">Aurora 人设</div>
          <div className="ai-persona-row">
            {(Object.keys(personaLabels) as AiPersona[]).map((p) => (
              <button key={p} className={'ai-persona' + (persona === p ? ' ai-persona--on' : '')} onClick={() => onPersona(p)}>
                {personaLabels[p]}
              </button>
            ))}
          </div>
          {dislikes.length ? <div className="ai-side-card__desc">已回避：{dislikes.join('、')}</div> : null}
        </div>
        <div className="ai-context__section ai-side-card__desc">
          自动解读会读取当前歌曲的歌词和基础资料，不会在未确认时创建歌单或改变播放队列。
        </div>
      </div>
    </div>
  );
}

/** Aurora listen-together page: chat timeline + playing context + AI actions. */
export function AiPage() {
  const location = useLocation();
  const messages = useAiStore((s) => s.messages);
  const busy = useAiStore((s) => s.busy);
  const setBusy = useAiStore((s) => s.setBusy);
  const activity = useAiStore((s) => s.activity);
  const setActivity = useAiStore((s) => s.setActivity);
  const pushMessage = useAiStore((s) => s.pushMessage);
  const updateMessage = useAiStore((s) => s.updateMessage);
  const clearMessages = useAiStore((s) => s.clearMessages);
  const model = useAiStore((s) => s.model);
  const persona = useAiStore((s) => s.persona);
  const dislikes = useAiStore((s) => s.dislikes);
  const setConfig = useAiStore((s) => s.setConfig);
  const retryAnalysis = useAiStore((s) => s.retryAnalysis);
  const memories = useAiStore((s) => s.memories);
  const setMemories = useAiStore((s) => s.setMemories);
  const setMemoryPanelOpen = useAiStore((s) => s.setMemoryPanelOpen);
  const memoryInfo = memoryBlock(memories);
  const current = usePlayerStore((s) => s.current);
  const openFullPlayer = usePlayerStore((s) => s.openFullPlayer);
  const [input, setInput] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  /** Aborts the in-flight agent loop (stop button / unmount / new message). */
  const abortRef = useRef<AbortController | null>(null);

  const cfg = { model };
  const configured = aiConfigured(cfg);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput('');
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    pushMessage({ id: nextAiMsgId(), role: 'user', text });
    setBusy(true);
    setActivity(configured ? '正在准备分析…' : '正在执行本地操作…');
    try {
      if (!configured) {
        try {
          const res = await localAssistant(text);
          pushMessage({
            id: nextAiMsgId(),
            role: 'ai',
            text: res.reply,
            tracks: res.tracks,
            playlist: res.playlist,
          });
        } catch (err) {
          pushMessage({
            id: nextAiMsgId(),
            role: 'ai',
            error: true,
            text: '本地操作失败：' + (err instanceof Error ? err.message : String(err)),
          });
        }
        return;
      }
      const aiId = nextAiMsgId();
      pushMessage({ id: aiId, role: 'ai', text: '', streaming: true, steps: [] });
      const snap = usePlayerStore.getState();
      const stats = listeningStatsBlock(useLibraryStore.getState().playLog);
      let snippet = '';
      if (snap.current) {
        setActivity('正在读取当前歌曲信息…');
        try {
          const lines = await fetchLyricLines(snap.current);
          snippet = lyricLineAt(lines, snap.currentTime)?.text ?? '';
        } catch {
          /* ignore */
        }
      }
      const history: AiChatMessage[] = [
        {
          role: 'system',
          content: buildSystemPrompt(
            persona,
            snap.current,
            snap.currentTime,
            stats,
            snippet,
            dislikes,
            buildPageContext(location.pathname + location.search, snap),
            memoryInfo,
          ),
        },
        ...messages
          .filter((m) => m.kind !== 'song' && m.text)
          .slice(-8)
          .map((m) => ({
            role: (m.role === 'ai' ? 'assistant' : 'user') as 'assistant' | 'user',
            content: m.text,
          })),
        { role: 'user' as const, content: text },
      ];
      // Agent loop: tool results go back to the model so it can keep acting
      // (search -> pick -> play / build playlist) before answering.
      const ctx: ToolCtx = { found: [] };
      const steps: string[] = [];
      let lastTracks: MusicTrack[] | undefined;
      let lastPlaylist: AiMessage['playlist'];
      let lastReply = '';
      let finalText = '';
      for (let round = 0; round < 6; round++) {
        setActivity(`正在思考并规划下一步（${round + 1}/6）…`);
        let acc = '';
        let full = '';
        try {
          const result = await chatStreamWithFallback(cfg, history, (d) => {
            acc += d;
            const vis = stripToolCall(acc).trim();
            if (vis) updateMessage(aiId, { text: vis });
          }, {
            onModel: (name, index) => {
              setActivity(index ? `首选模型不可用，正在切换到 ${name}…` : `正在等待 ${name} 输出…`);
              updateMessage(aiId, { text: index ? `首选模型不可用，已切换到 ${name}` : `正在使用 ${name}…` });
            },
            onReset: () => { acc = ''; setActivity('正在用备用模型重新生成…'); updateMessage(aiId, { text: '正在用备用模型重新生成…' }); },
          }, ctrl.signal);
          full = result.text;
          if (result.model !== cfg.model) setConfig({ model: result.model });
        } catch (e) {
          if (ctrl.signal.aborted) {
            // User stopped generation: keep whatever was already shown.
            updateMessage(aiId, {
              streaming: false,
              text: finalText || lastReply || '已停止。',
              steps: [...steps],
            });
            return;
          }
          updateMessage(aiId, {
            streaming: false,
            error: true,
              text: '连接失败：' + (e as Error).message + '。去设置页检查服务端 AI 和模型。',
          });
          return;
        }
        const calls = parseToolCalls(full);
        finalText = stripToolCall(full).trim();
        if (!calls.length && finalText) break;
        if (!calls.length && !finalText) {
          // model burned its tokens on reasoning and said nothing: nudge once
          if (round >= 4) break;
          history.push({ role: 'assistant', content: full || '（空回复）' });
          history.push({
            role: 'user',
            content: '（你上一条回复没有任何内容。要么调用 ::tool 工具，要么直接给用户最终回复。）',
          });
          continue;
        }
        history.push({ role: 'assistant', content: full });
        const facts: Record<string, unknown>[] = [];
        // Execute one action at a time so the next model turn can observe the
        // updated route/player state before deciding what to do next.
        for (const call of calls.slice(0, 1)) {
          steps.push(describeToolCall(call));
          setActivity('正在执行：' + describeToolCall(call) + '…');
          updateMessage(aiId, { steps: [...steps], text: finalText });
          if (requiresAgentConfirmation(call)) {
            const title = String(call.title ?? call.query ?? '新歌单').trim() || '新歌单';
            const count = Array.isArray(call.indices) && call.indices.length
              ? call.indices.length
              : Number(call.count ?? 12) || 12;
            const approved = window.confirm('Aurora 准备创建歌单「' + title + '」，预计加入 ' + count + ' 首歌曲。是否继续？');
            if (!approved) {
              facts.push({ action: 'approval_denied', tool: String(call.tool), reason: 'user_denied' });
              continue;
            }
          }
          // A failing tool must not leave the bubble stuck in streaming.
          let res: Awaited<ReturnType<typeof executeTool>>;
          try {
            res = await executeTool(call, ctx);
          } catch (err) {
            res = {
              reply: '',
              fact: { tool: String(call.tool), error: err instanceof Error ? err.message : String(err) },
            };
          }
          if (res.reply) lastReply = res.reply;
          if (res.tracks?.length) {
            ctx.found = res.tracks;
            if (String(call.tool) !== 'search_tracks') lastTracks = res.tracks;
          }
          if (res.playlist) lastPlaylist = res.playlist;
          facts.push(res.fact ?? { note: res.reply });
          const observed = usePlayerStore.getState();
          facts.push({
            action: 'observed_state',
            route: window.location.pathname,
            player: {
              status: observed.status,
              current: observed.current ? observed.current.name : null,
              lyricsMode: observed.lyricsMode,
              queueLength: observed.queue.length,
            },
          });
        }
        history.push({
          role: 'user',
          content:
            '[工具结果] ' +
            JSON.stringify(facts) +
            '\n（如果还需要动手就继续 ::tool，否则现在用你的口吻给用户最终回复，不要再调用工具）',
        });
        updateMessage(aiId, { text: '' });
      }
      updateMessage(aiId, {
        text: finalText || lastReply || '（这次没能整理出回复，再发一次试试）',
        streaming: false,
        steps: [...steps],
        tracks: lastTracks,
        playlist: lastPlaylist,
      });
      // Channel A: quiet background extraction from this turn's dialogue.
      void scheduleMemoryExtraction(
        history.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-6),
        useAiStore.getState().model,
      )
        .then(() => loadMemories())
        .then(setMemories)
        .catch(() => undefined);
    } finally {
      setBusy(false);
      setActivity(ctrl.signal.aborted ? '已暂停' : '');
    }
  };

  return (
    <div className="page ai-page">
      <div className="ai-page__main">
        <div className="ai-page__head">
          <div className="ai-avatar">
            <img src="/aurora-mark.jpg" width="38" height="38" alt="Aurora" />
          </div>
          <div className="ai-page__head-text">
            <div className="ai-page__title">Aurora · 一起听</div>
            <div className="ai-page__sub">
              {configured ? '在线 · ' + model : '本地模式 · 去设置选择模型'}
            </div>
          </div>
          <button className="ai-memory-chip" onClick={() => setMemoryPanelOpen(true)}>
            记忆 {memories.length}
          </button>
            <button className="ai-page__context-toggle" onClick={() => setContextOpen(true)} aria-label="打开 AI 上下文" aria-expanded={contextOpen}>
              <Icon name="music" size={16} />
            </button>
            <button className="ai-page__clear" onClick={clearMessages} aria-label="清空">
            <Icon name="trash" size={16} />
          </button>
        </div>

        <div className="ai-feed" ref={feedRef}>
          {messages.length === 0 ? (
            <div className="ai-welcome">
              <div className="ai-welcome__mark">
                <img src="/aurora-mark.jpg" width="88" height="88" alt="Aurora 音乐标识" />
              </div>
              <div className="ai-welcome__title">嗨，我是 Aurora</div>
              <div className="ai-welcome__sub">
                「播放周杰伦 晴天」双音源找原版直接放；「建个雨天歌单」真的帮你建好保存；
                切歌时我会在这里陪你聊。
              </div>
            </div>
          ) : null}
          {messages.map((m) => (
            <MessageView key={m.id} m={m} onRetry={m.analysisStatus === 'error' ? retryAnalysis : undefined} />
          ))}
        </div>

        <div className="ai-quick">
          {QUICK.map((q) => (
            <button key={q.label} className="ai-quick__chip" onClick={() => void send(q.text)}>
              {q.label}
            </button>
          ))}
        </div>

        {activity ? <div className={'ai-activity' + (activity === '已暂停' ? ' ai-activity--paused' : '')}><span className="ai-activity__dot" />{activity}</div> : null}
        <div className="ai-inputbar">
          <input
            value={input}
            placeholder={configured ? '想听什么、想建什么歌单，跟我说…' : '本地模式：试试「播放周杰伦 晴天」'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
          />
          {busy ? (
            <button
              className="ai-inputbar__send ai-inputbar__send--stop"
              onClick={() => { setActivity('已暂停'); abortRef.current?.abort(); }}
              aria-label="停止生成"
              title="停止生成"
            >
              <Icon name="pause" size={15} />
            </button>
          ) : (
            <button className="ai-inputbar__send" onClick={() => void send()} aria-label="发送">
              <Icon name="arrowRight" size={17} />
            </button>
          )}
        </div>
      </div>

      <aside className="ai-page__side">
        {current ? (
          <div className="ai-side-card ai-now">
            <div className="ai-now__cover" onClick={openFullPlayer}>
              <TrackCover track={current} bare radius="14px" />
            </div>
            <div className="ai-now__body">
              <div className="ai-now__label">正在播放</div>
              <div className="ai-now__name">{current.name}</div>
              <div className="ai-now__artist">{current.artist.join(' / ')}</div>
            </div>
          </div>
        ) : null}

        <div className="ai-side-card">
          <div className="ai-side-card__title">Aurora 人设</div>
          <div className="ai-persona-row">
            {(Object.keys(personaLabels) as AiPersona[]).map((p) => (
              <button
                key={p}
                className={'ai-persona' + (persona === p ? ' ai-persona--on' : '')}
                onClick={() => setConfig({ persona: p })}
              >
                {personaLabels[p]}
              </button>
            ))}
          </div>
          {dislikes.length ? (
            <div className="ai-side-card__desc">已回避：{dislikes.join('、')}</div>
          ) : null}
          <Link className="ai-side-card__link" to="/settings">
            <Icon name="settings" size={14} />
            AI 连接设置
          </Link>
        </div>

        <div className="ai-side-card">
          <div className="ai-side-card__title">她会做什么</div>
          <div className="ai-side-card__desc">
            · 双音源搜歌，原版优先，说"播放"直接放
            <br />
            · 多步行动：先搜后挑，选好再建歌单
            <br />
            · 像这首的再来几首、心情电台
            <br />
            · 每次切歌自动解读歌词、听歌报告、陪聊
            <br />
            · 不喜欢谁就说，以后自动回避
          </div>
        </div>
      </aside>
      {contextOpen ? (
        <AiContextPanel
          current={current}
          configured={configured}
          model={model}
          persona={persona}
          dislikes={dislikes}
          onPersona={(p) => setConfig({ persona: p })}
          onOpenPlayer={() => {
            setContextOpen(false);
            openFullPlayer();
          }}
          onClose={() => setContextOpen(false)}
        />
      ) : null}
      <MemoryPanel />
    </div>
  );
}
