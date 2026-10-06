import type { MusicTrack } from '@/music/source/types';
import { addCandidates, createCandidatePool, pickBestCandidate, type CandidatePool } from './candidatePool';
import { planPlaylist, stageQuery, type PlaylistPlan } from './playlistPlanner';

export interface DjSet {
  request: string;
  plan: PlaylistPlan;
  pool: CandidatePool;
  tracks: MusicTrack[];
}

type Searcher = (query: string, count: number, dislikes: string[]) => Promise<MusicTrack[]>;

/** Deterministic DJ set builder. A model can re-pick individual tracks later. */
export async function buildDjSet(request: string, searcher: Searcher, dislikes: string[] = [], countPerStage = 8): Promise<DjSet> {
  const plan = planPlaylist(request);
  const batches = await Promise.all(plan.stages.map(async (stage) => ({ stage, tracks: await searcher(stageQuery(plan, stage, request), countPerStage, dislikes) })));
  let pool: CandidatePool = createCandidatePool(request, [] , dislikes);
  for (const batch of batches) pool = addCandidates(pool, batch.tracks, request, dislikes, batch.stage.id);
  const tracks: MusicTrack[] = [];
  const usedArtists = new Set<string>();
  for (const stage of plan.stages) {
    let stageCount = 0;
    while (stageCount < Math.max(2, Math.ceil(stage.minutes / 5))) {
      const candidate = pickBestCandidate(pool, { stage: stage.id });
      if (!candidate) break;
      const artistKey = candidate.track.artist[0]?.toLowerCase() ?? '';
      if (artistKey && usedArtists.has(artistKey) && stageCount < Math.max(2, Math.ceil(stage.minutes / 5)) - 1) {
        candidate.skipped = true;
        continue;
      }
      candidate.selected = true;
      candidate.stage = stage.id;
      tracks.push(candidate.track);
      if (artistKey) usedArtists.add(artistKey);
      stageCount += 1;
    }
  }
  return { request, plan, pool, tracks };
}

