import type { Metadata } from 'next';

export const metadata: Metadata = { title: { default: 'Hello Beauty', template: '%s · Hello Beauty' } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
