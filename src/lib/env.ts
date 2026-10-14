/** Öffentliche Umgebungsvariablen (zur Build-Zeit eingesetzt). Übersicht: .env.example */
export const env = {
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, ''),
  dataAdapter: process.env.NEXT_PUBLIC_DATA_ADAPTER || 'mock',
  authAdapter: process.env.NEXT_PUBLIC_AUTH_ADAPTER || 'mock',
} as const;

/** Basis-URL der App: NEXT_PUBLIC_APP_URL, sonst die aktuelle Origin (localhost, *.vercel.app, Subdomain). */
export function appOrigin(): string {
  if (env.appUrl) return env.appUrl;
  return typeof window === 'undefined' ? '' : window.location.origin;
}
