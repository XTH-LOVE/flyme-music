// Thin Vercel serverless wrapper. All logic lives in server/auroraApi.ts.
import { handleProxy } from '../server/auroraApi';

export default handleProxy;

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 60,
};
