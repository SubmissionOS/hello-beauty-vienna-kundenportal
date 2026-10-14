import type { Metadata } from 'next';
import { QrView } from './qr-view';

export const metadata: Metadata = { title: 'QR-Code' };

export default function Page() {
  return <QrView />;
}
