/**
 * Prüfregeln für das Web-App-Manifest (genutzt von scripts/check-manifest.mjs und tests/pwa.spec.ts).
 * Gibt eine Liste von Fehlern zurück – leer = alles in Ordnung.
 */
export function checkManifest(m) {
  const errors = [];
  const expect = (cond, msg) => cond || errors.push(msg);

  expect(m.name === 'Hello Beauty', `name ist "${m.name}", erwartet "Hello Beauty"`);
  expect(m.short_name === 'Hello Beauty', `short_name ist "${m.short_name}", erwartet "Hello Beauty"`);
  expect(typeof m.id === 'string' && m.id.startsWith('/'), 'id fehlt oder ist nicht relativ');
  expect(m.start_url === '/app?source=pwa', `start_url ist "${m.start_url}", erwartet "/app?source=pwa"`);
  expect(m.scope === '/', `scope ist "${m.scope}", erwartet "/"`);
  expect(m.display === 'standalone', `display ist "${m.display}", erwartet "standalone"`);
  expect(/^#[0-9a-f]{6}$/i.test(m.theme_color ?? ''), 'theme_color fehlt');
  expect(/^#[0-9a-f]{6}$/i.test(m.background_color ?? ''), 'background_color fehlt');

  const icons = Array.isArray(m.icons) ? m.icons : [];
  const has = (size, purpose) =>
    icons.some((i) => i.sizes === size && (i.purpose ?? 'any').split(' ').includes(purpose) && i.type === 'image/png');
  expect(has('192x192', 'any'), 'Icon 192×192 (any) fehlt');
  expect(has('512x512', 'any'), 'Icon 512×512 (any) fehlt');
  expect(has('192x192', 'maskable'), 'Icon 192×192 (maskable) fehlt');
  expect(has('512x512', 'maskable'), 'Icon 512×512 (maskable) fehlt');
  return errors;
}
