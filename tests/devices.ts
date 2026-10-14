import type { BrowserContextOptions, Page } from '@playwright/test';

/** Echte User-Agents (Stand Herbst 2026). iOS 26 meldet OS 18_6, aber Safari „Version/26.0“. */
export const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphoneLegacy:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.27.82 (iPhone15,3; iOS 18_6; de_AT; de; scale=3.00; 1290x2796)',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
} as const;

export const phone = (userAgent: string): BrowserContextOptions => ({
  userAgent,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

export const laptop: BrowserContextOptions = {
  userAgent: UA.desktop,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
};

/** Simuliert die installierte App (display-mode: standalone + navigator.standalone). */
export async function emulateStandalone(page: Page) {
  await page.addInitScript(() => {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes('display-mode: standalone')
        ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList)
        : orig(q);
    Object.defineProperty(navigator, 'standalone', { get: () => true });
  });
}

export const shotDir = 'docs/screenshots';
