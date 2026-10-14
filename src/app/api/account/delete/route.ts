import { NextResponse } from 'next/server';
import { originFromRequest, supabaseAdmin, supabaseAs } from '@/lib/server/supabase';

/**
 * Konto löschen – nur für die eingeloggte Person selbst (Token wird bei Supabase geprüft).
 * 1. Als Kundin: request_account_deletion (sagt Termine ab, sperrt den Datensatz) – Tenant aus dem Host.
 * 2. Profilbilder im Speicher entfernen (Pfad <tenant>/<kundin>/…).
 * 3. Mit Secret Key: Kundin dieses Tenants löschen (Termine, Chat, Warteliste, Push-Abos per Cascade;
 *    Zahlungsbelege bleiben anonymisiert für die Buchhaltung). Auth-User nur, wenn er bei keinem anderen
 *    Salon mehr Kundin ist.
 */
export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return new NextResponse(null, { status: 401 });

  const admin = supabaseAdmin();
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return new NextResponse(null, { status: 401 });

  const asUser = supabaseAs(originFromRequest(req), token);
  const { data: me } = await asUser.from('customers').select('id, tenant_id').maybeSingle();
  if (!me) return new NextResponse(null, { status: 404 });

  const { error: reqError } = await asUser.rpc('request_account_deletion');
  if (reqError) return new NextResponse(null, { status: 500 });

  // Profilbilder (privater Bucket) – die Liste ist auf den Ordner dieser Kundin beschränkt
  const folder = `${me.tenant_id}/${me.id}`;
  const { data: files } = await admin.storage.from('avatars').list(folder, { limit: 100 });
  if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${folder}/${f.name}`));

  const { error: delError } = await admin.from('customers').delete().eq('id', me.id).eq('user_id', auth.user.id);
  if (delError) return new NextResponse(null, { status: 500 });

  const { count } = await admin.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id);
  if (!count) await admin.auth.admin.deleteUser(auth.user.id);

  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
