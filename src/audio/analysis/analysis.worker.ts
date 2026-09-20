import { analyzePcm } from './features';
import type { AudioFeatures } from './types';

/**
 * Analysis worker.
 *
 * A four-minute track is ~10M samples; the signal pass is seconds of solid CPU.
 * Running that on the main thread would freeze the player, so it lives here.
 * The message protocol is deliberately tiny - one request, one response - so the
 * caller can fall back to inline analysis without a second code path.
 */
export interface AnalysisRequest {
  samples: Float32Array;
  sampleRate: number;
}

export interface AnalysisResponse {
  ok: boolean;
  features?: AudioFeatures;
  error?: string;
}

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { samples, sampleRate } = event.data;
  try {
    const features = analyzePcm(samples, sampleRate);
    const response: AnalysisResponse = { ok: true, features };
    // Transfer nothing back: the feature card is small and plain JSON.
    (self as unknown as Worker).postMessage(response);
  } catch (error) {
    const response: AnalysisResponse = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
