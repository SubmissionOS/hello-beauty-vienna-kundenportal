export type PlatformKind = 'standalone' | 'ios' | 'android' | 'inapp' | 'desktop';

export interface PlatformInfo {
  kind: PlatformKind;
  os: 'ios' | 'android' | 'other';
  /** Name der App bei In-App-Browsern (Instagram, …) */
  inAppName: string | null;
  /** Safari 26+ (eigenes Layout mit •••) – sonst älteres iOS mit Teilen-Symbol in der Leiste */
  ios26: boolean;
  /** iOS, aber nicht Safari (Chrome, Firefox, Edge auf iOS) */
  iosOtherBrowser: boolean;
}

const IN_APP: [string, RegExp][] = [
  ['Instagram', /Instagram/i],
  ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS|FB4A|FBSV/i],
  ['Messenger', /MessengerForiOS|Orca-Android/i],
  ['WhatsApp', /WhatsApp/i],
  ['TikTok', /TikTok|musical_ly|BytedanceWebview|trill_/i],
  ['Snapchat', /Snapchat/i],
  ['Pinterest', /Pinterest/i],
  ['LinkedIn', /LinkedInApp/i],
  ['Telegram', /Telegram/i],
  ['LINE', /\bLine\//],
];

/**
 * Erkennung über User-Agent und Display-Modus. Für Tests und Vorführung
 * überschreibbar mit ?p=ios | ios-legacy | android | inapp | desktop.
 */
export function detectPlatform(ua: string, search: string): PlatformInfo {
  const override = new URLSearchParams(search).get('p');
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const os = isIos ? 'ios' : isAndroid ? 'android' : 'other';
  const inAppName = IN_APP.find(([, re]) => re.test(ua))?.[0] ?? null;
  // Ab iOS 26 bleibt die OS-Version im UA bei 18_x stehen; maßgeblich ist „Version/26“ von Safari.
  const safariVersion = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
  const iosOtherBrowser = isIos && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  const base: PlatformInfo = { kind: 'desktop', os, inAppName, ios26: safariVersion >= 26, iosOtherBrowser };

  switch (override) {
    case 'ios':
      return { ...base, kind: 'ios', os: 'ios', ios26: true };
    case 'ios-legacy':
      return { ...base, kind: 'ios', os: 'ios', ios26: false };
    case 'android':
      return { ...base, kind: 'android', os: 'android' };
    case 'inapp':
      return { ...base, kind: 'inapp', os: os === 'other' ? 'ios' : os, inAppName: inAppName ?? 'Instagram' };
    case 'desktop':
      return { ...base, kind: 'desktop' };
  }

  if (standalone) return { ...base, kind: 'standalone' };
  if (inAppName && os !== 'other') return { ...base, kind: 'inapp' };
  if (isIos) return { ...base, kind: 'ios' };
  if (isAndroid) return { ...base, kind: 'android' };
  return base;
}
