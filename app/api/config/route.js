import { getRuntimeEnvSnapshot } from '@/lib/publicEnv';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(getRuntimeEnvSnapshot());
}
