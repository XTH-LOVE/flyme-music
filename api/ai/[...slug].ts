// Thin Vercel catch-all serverless wrapper (e.g. /api/ai/chat/completions,
// /api/ai/status). All logic lives in server/auroraApi.ts.
import { handleAi } from '../../server/auroraApi';

export default handleAi;

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 60,
};
