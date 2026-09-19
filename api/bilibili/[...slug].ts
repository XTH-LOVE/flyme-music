// Thin Vercel serverless wrapper. All logic lives in server/auroraApi.ts.
import { handleBilibili } from '../../server/auroraApi';

export default handleBilibili;

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 60,
};
