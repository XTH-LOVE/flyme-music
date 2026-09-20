/**
 * Local audio analysis: turns a track's audio into measured facts a model can
 * quote, instead of leaving it to invent an arrangement from the lyrics.
 */
export { analyzePcm } from './features';
export { renderFactCard, summarizeFactCard } from './factCard';
export { analyzeTrack, FEATURES_VERSION, type AnalyzeOptions } from './analyzeTrack';
export {
  readCachedCard,
  writeCachedCard,
  clearCachedCards,
  listCachedCards,
} from './cache';
export {
  cosineSimilarity,
  compareFeatures,
  describeSimilarity,
  rankSimilar,
  type RankedCandidate,
  type SimilarityReason,
} from './similarity';
export { trackKeyOf, type AudioFeatures, type FeatureCard } from './types';
export {
  buildTasteProfile,
  renderTasteProfile,
  MIN_PROFILE_TRACKS,
  type TasteProfile,
} from './profile';
export { analyzeInBackground, cancelBackgroundAnalysis, isAnalyzing, BACKGROUND_DELAY_MS } from './background';
export { warmupAnalysis, cancelWarmup, warmupCandidates, WARMUP_BUDGET } from './warmup';
export {
  liveStatus,
  readLiveWindow,
  describeLiveWindow,
  resetLiveHistory,
  type LiveStatus,
  type LiveUnavailableReason,
  type LiveWindow,
} from './live';
