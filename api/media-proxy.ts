// Thin Vercel serverless wrapper. All logic lives in server/auroraApi.ts.
import { handleMediaProxy } from '../server/auroraApi';

export default handleMediaProxy;

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 60,
};
