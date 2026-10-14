import { expect, test } from '@playwright/test';
import { phone, shotDir, UA } from './devices';

/**
 * Ungarische Sonderzeichen (Ő ő Ű ű) müssen in allen genutzten Gewichten aus den Website-Schriften kommen –
 * nicht aus einer Ersatzschrift. Geprüft über die tatsächlich gerenderte Schrift (Chrome DevTools Protocol).
 */
test.use(phone(UA.iphone));

const samples = [
  { id: 'serif-400', family: 'var(--font-serif)', weight: 400, expect: 'Gloock' },
  ...[300, 400, 500, 600, 700].map((w) => ({ id: `sans-${w}`, family: 'var(--font-sans)', weight: w, expect: 'Hanken Grotesk' })),
];

test('ő ű Ő Ű in Gloock und Hanken Grotesk (300–700) aus den Webfonts', async ({ page }) => {
  await page.goto('/offline');
  await page.evaluate((list) => {
    const box = document.createElement('div');
    box.id = 'typo';
    box.style.cssText = 'position:fixed;inset:0;z-index:9;padding:16px;display:grid;gap:8px;align-content:start;background:var(--bg);color:var(--text)';
    for (const s of list) {
      const el = document.createElement('p');
      el.id = s.id;
      el.style.cssText = `font-family:${s.family};font-weight:${s.weight};font-size:var(--fs-h3)`;
      el.textContent = 'Őrző űrhajó – őszi fűzfa ŐŰ';
      box.appendChild(el);
    }
    document.body.appendChild(box);
  }, samples);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  for (const s of samples) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#${s.id}` });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    // Jede verwendete Schrift muss die Webfont sein (keine Ersatzschrift für einzelne Zeichen)
    expect(fonts.length, s.id).toBeGreaterThan(0);
    for (const f of fonts) {
      expect(f.isCustomFont, `${s.id}: ${f.familyName}`).toBe(true);
      expect(f.familyName, s.id).toContain(s.expect);
    }
  }
  // Die HU-Ergänzungsdateien wurden tatsächlich geladen
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name));
  expect(loaded.some((u) => u.endsWith('/fonts/gloock-hu-extra.woff2'))).toBe(true);
  expect(loaded.some((u) => u.endsWith('/fonts/hanken-grotesk-hu-extra.woff2'))).toBe(true);
  await page.locator('#typo').screenshot({ path: `${shotDir}/design-abgleich/typo-hu-gewichte.png` });
});
