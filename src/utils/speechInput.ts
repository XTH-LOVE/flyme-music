/**
 * Web Speech API wrapper for voice input on the AI page. Chromium engines
 * (including WebView2) support SpeechRecognition; Safari/Firefox do not, so
 * callers must feature-detect with speechSupported() before showing the mic.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return recognitionCtor() !== null;
}

export interface SpeechSession {
  /** Stops listening; safe to call more than once. */
  stop: () => void;
}

/**
 * Start one utterance of recognition (auto-stops on silence like a dictation
 * key). onResult fires with interim text while speaking and the final text at
 * the end; onEnd fires exactly once afterwards.
 */
export function startSpeechInput(opts: {
  lang?: string;
  onResult: (text: string, isFinal: boolean) => void;
  onEnd: (error?: string) => void;
}): SpeechSession | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = opts.lang ?? 'zh-CN';
  rec.continuous = false;
  rec.interimResults = true;

  let ended = false;
  const finish = (error?: string) => {
    if (ended) return;
    ended = true;
    opts.onEnd(error);
  };
  rec.onresult = (event) => {
    let text = '';
    let isFinal = false;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      text += result[0]?.transcript ?? '';
      if (result.isFinal) isFinal = true;
    }
    if (text) opts.onResult(text, isFinal);
  };
  rec.onerror = (event) => finish(event.error === 'no-speech' ? undefined : (event.error ?? 'speech_error'));
  rec.onend = () => finish();

  try {
    rec.start();
  } catch {
    return null;
  }
  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}
