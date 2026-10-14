'use client';

import { getData } from './data';

/**
 * Web-Push im Browser: Abo mit dem öffentlichen VAPID-Schlüssel anlegen und in push_subscriptions speichern.
 * Die Erlaubnis wird nur in der installierten App erfragt – nach dem Erklär-Screen, nie beim ersten Laden.
 */
export const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export type PushState = 'unsupported' | 'not-installed' | 'not-configured' | 'denied' | 'off' | 'on';

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (!isStandalone()) return 'not-installed';
  if (!vapidPublicKey) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

async function save(sub: PushSubscription) {
  await getData().savePushSubscription({
    endpoint: sub.endpoint,
    p256dh: bytesToB64url(sub.getKey('p256dh')),
    auth: bytesToB64url(sub.getKey('auth')),
    userAgent: navigator.userAgent,
  });
}

/** Nach Tipp auf „Mitteilungen erlauben“ */
export async function enablePush(): Promise<PushState> {
  const state = await pushState();
  if (state === 'unsupported' || state === 'not-installed' || state === 'not-configured' || state === 'denied') return state;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = (await registration()) ?? (await navigator.serviceWorker.ready);
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(vapidPublicKey) }));
  await save(sub);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await getData().deletePushSubscription(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => false);
  }
  return pushState();
}

/** Beim App-Start: erneuertes Abo (z. B. nach Schlüsselwechsel des Browsers) wieder speichern */
export async function syncPush(): Promise<void> {
  try {
    if ((await pushState()) !== 'on') return;
    const sub = await (await registration())?.pushManager.getSubscription();
    if (sub) await save(sub);
  } catch {
    /* offline oder nicht angemeldet: beim nächsten Start erneut */
  }
}
