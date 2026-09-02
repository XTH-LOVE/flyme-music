import { useEffect } from 'react';
import { useAiStore } from '@/store/useAiStore';
import { loadMemories, deleteMemory, clearAllMemories, MEMORY_CATEGORIES } from './memory';
import type { AiMemoryCategory } from './memory';

const LABELS: Record<AiMemoryCategory, string> = {
  artist: '喜欢的歌手', genre: '喜欢的风格', mood: '常听场景', fact: '交代过的事', dislike: '不喜欢',
};

function relTime(ts: number): string {
  if (!ts) return '';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return days + ' 天前';
  return Math.floor(days / 30) + ' 个月前';
}

/** Manageable list of what Aurora remembers about the user. */
export function MemoryPanel() {
  const open = useAiStore((s) => s.memoryPanelOpen);
  const setOpen = useAiStore((s) => s.setMemoryPanelOpen);
  const memories = useAiStore((s) => s.memories);
  const setMemories = useAiStore((s) => s.setMemories);

  useEffect(() => {
    if (open) void loadMemories().then(setMemories);
  }, [open, setMemories]);

  if (!open) return null;
  return (
    <div className="ai-memory-mask" onClick={() => setOpen(false)}>
      <div className="ai-memory-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ai-memory-head">
          <b>Aurora 的记忆</b>
          <button className="ai-memory-close" onClick={() => setOpen(false)}>×</button>
        </div>
        {memories.length === 0 ? (
          <div className="ai-memory-empty">和我聊得越多，我就越懂你；也可以直接让我「记住…」。</div>
        ) : (
          <>
            {MEMORY_CATEGORIES.map((cat) => {
              const items = memories.filter((m) => m.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat} className="ai-memory-group">
                  <div className="ai-memory-group-title">{LABELS[cat]}</div>
                  {items.map((m) => (
                    <div key={m.id} className="ai-memory-item">
                      <span className="ai-memory-text">{m.content}</span>
                      <span className="ai-memory-time">{relTime(m.lastSeenAt)}</span>
                      <button
                        className="ai-memory-del"
                        aria-label="删除这条记忆"
                        onClick={() => {
                          void deleteMemory(m.id).then(() => loadMemories()).then(setMemories);
                        }}
                      >删除</button>
                    </div>
                  ))}
                </div>
              );
            })}
            <button
              className="ai-memory-clear"
              onClick={() => {
                if (window.confirm('确定清空全部记忆？不可恢复。')) {
                  void clearAllMemories().then(() => setMemories([]));
                }
              }}
            >清空全部</button>
          </>
        )}
      </div>
    </div>
  );
}
