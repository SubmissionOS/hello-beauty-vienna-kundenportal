// Storage-Teil der Rückrollung von 20261014200000: Bucket „avatars“ leeren und löschen (nur über die Storage-API möglich).
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: buckets } = await db.storage.listBuckets();
if (buckets?.some((b) => b.id === 'avatars')) {
  await db.storage.emptyBucket('avatars');
  const { error } = await db.storage.deleteBucket('avatars');
  console.log(error ? `Bucket avatars: ${error.message}` : 'Bucket avatars gelöscht.');
}
