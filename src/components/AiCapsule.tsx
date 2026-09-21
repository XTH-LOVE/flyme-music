import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useAiStore } from '@/store/useAiStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { isTauri } from '@/lib/apiTransport';
import './ai-capsule.css';

/**
 * The floating pill that makes the AI discoverable.
 *
 * It exists because the AI page is at `/ai` and nothing links to it - not the
 * bottom bar, not the sidebar. Without this the feature is unreachable unless
 * the address is typed, which on a phone is not a thing anyone does.
 *
 * It shows the AI's latest line rather than a label. "AI 伴听" tells you a
 * feature exists; a sentence the AI actually said tells you whether it is worth
 * opening, which is the decision the pill is asking the user to make.
 *
 * Dismissal is remembered per message, so closing one does not silence the next
 * thing the AI says - a prompt that never returns is a prompt nobody reads, and
 * one that always returns is one everybody ignores.
 */
const DISMISSED_KEY = 'aurora.ai.capsule.dismissed';

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberDismissed(id: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, id);
  } catch {
    /* private mode - it simply reappears */
  }
}

/** Collapses whitespace and trims to a length that fits the pill. */
function preview(text: string, limit = 42): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? flat.slice(0, limit) + '…' : flat;
}

export function AiCapsule() {
  const navigate = useNavigate();
  const location = useLocation();
  const messages = useAiStore((s) => s.messages);
  const capsuleEnabled = useAiStore((s) => s.capsule);
  const retryAnalysis = useAiStore((s) => s.retryAnalysis);
  const addDislike = useAiStore((s) => s.addDislike);
  const currentArtist = usePlayerStore((s) => s.current?.artist?.[0]);
  const [dismissed, setDismissed] = useState(() => readDismissed());

  // Nothing to say while the user is already reading it.
  const onAiPage = location.pathname === '/ai';
  const latest = [...messages].reverse().find(
    (m) => m.role === 'ai' && !m.error && !m.streaming && m.text.trim().length > 0,
  );

  const visible = Boolean(capsuleEnabled && latest && !onAiPage && latest.id !== dismissed);

  if (!visible || !latest) return null;

  return (
    <div className="ai-capsule" data-tauri={isTauri() ? 'true' : undefined}>
      <button className="ai-capsule__main" onClick={() => navigate('/ai')}>
        <span className="ai-capsule__orb" aria-hidden="true" />
        <span className="ai-capsule__text">
          <span className="ai-capsule__label">AI 伴听</span>
          <span className="ai-capsule__preview">{preview(latest.text)}</span>
        </span>
        <Icon name="chevronRight" size={16} className="ai-capsule__chevron" />
      </button>
      <div className="ai-capsule__actions">
        {/* Three defaults instead of a keyboard. The companion's whole premise
            is that you are listening, not typing - asking for a sentence would
            undo the thing it exists for. */}
        <button
          className="ai-capsule__action"
          aria-label="有用"
          onClick={() => {
            rememberDismissed(latest.id);
            setDismissed(latest.id);
          }}
        >
          <Icon name="heart" size={14} />
        </button>
        <button
          className="ai-capsule__action"
          aria-label="不想听这类"
          onClick={() => {
            // Recorded against the artist rather than the song: "don't talk
            // about this one" is rarely about a single track.
            if (currentArtist) addDislike(currentArtist);
            rememberDismissed(latest.id);
            setDismissed(latest.id);
          }}
        >
          <Icon name="close" size={14} />
        </button>
        <button
          className="ai-capsule__action"
          aria-label="换一个说法"
          onClick={() => {
            retryAnalysis();
            rememberDismissed(latest.id);
            setDismissed(latest.id);
          }}
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>

    </div>
  );
}
