import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'Hello Beauty',
    short_name: 'Hello Beauty',
    description: 'Termine bei Hello Beauty, Wien, buchen und verwalten.',
    lang: 'de',
    dir: 'ltr',
    start_url: '/app?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Werte = --c-ios-bg aus src/styles/tokens.css (geprüft von scripts/check-tokens.mjs)
    background_color: '#f4f2ee',
    theme_color: '#f4f2ee',
    categories: ['beauty', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
