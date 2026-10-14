import type { Metadata } from 'next';
import { InstallPage } from '@/components/install/install-page';

export const metadata: Metadata = { title: 'App installieren' };

export default function Page() {
  return <InstallPage />;
}
