// Thin Vercel serverless wrapper. All logic lives in server/auroraApi.ts.
import { handleNeteasePublic } from '../../server/auroraApi';

export default handleNeteasePublic;

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 60,
};
