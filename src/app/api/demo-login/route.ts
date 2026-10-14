import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/server/env';
import { DEMO_EMAIL, originFromRequest, supabaseAdmin, supabaseAs } from '@/lib/server/supabase';

/**
 * Anmeldung als Demo-Kundin – nur bei NEXT_PUBLIC_DEMO_MODE=true. Das Passwort bleibt auf dem Server;
 * zurück gehen nur die Sitzungs-Token der Demo-Kundin.
 * Teil 4: Bei jedem Demo-Login ein frisches Wartelisten-Angebot und eine offene Test-Zahlung
 * (svc_demo_refresh – nur für die Demo-Kundin, ohne Benachrichtigungen), damit der Countdown beim Öffnen läuft.
 */
export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') return new NextResponse(null, { status: 404 });

  const origin = originFromRequest(req);
  const sb = supabaseAs(origin);
  const { data, error } = await sb.auth.signInWithPassword({ email: DEMO_EMAIL, password: serverEnv.demoCustomerPassword() });
  if (error || !data.session) return NextResponse.json({ error: 'demo_unavailable' }, { status: 503 });

  try {
    const { data: me } = await supabaseAs(origin, data.session.access_token).from('customers').select('id, tenant_id').maybeSingle();
    if (me) await supabaseAdmin().rpc('svc_demo_refresh', { p_tenant: me.tenant_id, p_customer: me.id });
  } catch {
    /* Demo läuft auch ohne frisches Angebot */
  }

  return NextResponse.json(
    { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
