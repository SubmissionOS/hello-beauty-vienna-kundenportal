import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/server/env';
import { DEMO_EMAIL, originFromRequest, supabaseAs } from '@/lib/server/supabase';

/**
 * Anmeldung als Demo-Kundin – nur bei NEXT_PUBLIC_DEMO_MODE=true. Das Passwort bleibt auf dem Server;
 * zurück gehen nur die Sitzungs-Token der Demo-Kundin.
 */
export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return new NextResponse(null, { status: 404 });

  const sb = supabaseAs(originFromRequest(req));
  const { data, error } = await sb.auth.signInWithPassword({ email: DEMO_EMAIL, password: serverEnv.demoCustomerPassword() });
  if (error || !data.session) return NextResponse.json({ error: 'demo_unavailable' }, { status: 503 });

  return NextResponse.json(
    { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
