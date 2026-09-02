// Thin Vercel serverless wrapper. All logic lives in server/auroraApi.ts.
import { handleImg } from '../server/auroraApi';

export default handleImg;

export const config = {
  runtime: 'nodejs20.x',
  maxDuration: 60,
};
