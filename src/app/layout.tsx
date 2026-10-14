import type { Metadata, Viewport } from 'next';
import { installBootScript, themeBootScript } from '@/lib/boot-scripts';
import { SwRegister } from '@/components/sw-register';
import './globals.css';

/** iOS-Startbilder: [Breite, Höhe, Faktor] in Punkten (siehe scripts/gen-assets.mjs) */
const startup: [number, number, number][] = [
  [440, 956, 3],
  [402, 874, 3],
  [420, 912, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [375, 667, 2],
];

export const metadata: Metadata = {
  title: { default: 'Hello Beauty', template: '%s · Hello Beauty' },
  description: 'Kundenportal von Hello Beauty, Wien – Termine buchen und verwalten.',
  applicationName: 'Hello Beauty',
  robots: { index: false, follow: false, nocache: true },
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Hello Beauty',
    statusBarStyle: 'default',
    startupImage: startup.map(([w, h, f]) => ({
      url: `/splash/splash-${w * f}x${h * f}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${f}) and (orientation: portrait)`,
    })),
  },
  other: {
    // Ältere iOS-Versionen lesen nur diesen Namen
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf9f4' },
    { media: '(prefers-color-scheme: dark)', color: '#15130e' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript + installBootScript }} />
        <link rel="preload" href="/fonts/hanken-grotesk-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/gloock-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
