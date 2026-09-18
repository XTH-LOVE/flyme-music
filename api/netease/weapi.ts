// Thin Vercel serverless wrapper. All logic lives in server/auroraApi.ts.
import { handleNeteaseWeapi } from '../../server/auroraApi';

export default handleNeteaseWeapi;

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 60,
};
