import { NextResponse } from 'next/server';
import { safeEqual, serverEnv } from '@/lib/server/env';
import { processQueue } from '@/lib/server/notify';
import { processRefunds } from '@/lib/server/payments';
import { originFromRequest } from '@/lib/server/supabase';

/**
 * Versand der Benachrichtigungs-Warteschlange und offene Erstattungen. Aufruf jede Minute (pg_cron + pg_net oder Vercel Cron),
 * geschützt mit „Authorization: Bearer <NOTIFY_WORKER_SECRET>“. Antwort enthält nur Zähler, keine Daten.
 */
async function handle(req: Request) {
  const secret = serverEnv.notifyWorkerSecret();
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!secret || !given || !safeEqual(given, secret)) return new NextResponse(null, { status: 401 });
  const origin = process.env.NEXT_PUBLIC_APP_URL || originFromRequest(req);
  try {
    const queue = await processQueue(origin);
    const refunds = await processRefunds();
    return NextResponse.json({ ...queue, refunds }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'queue_unavailable' }, { status: 503 });
  }
}

export const POST = handle;
// Vercel Cron ruft per GET auf
export const GET = handle;
