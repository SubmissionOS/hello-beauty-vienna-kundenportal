/**
 * Kopiert src/styles/tokens.css 1:1 ins CRM (src/styles/tokens.css) und setzt eine Kopfzeile mit dem Hash des Inhalts.
 * Aufruf: npm run crm:tokens   (CRM-Ordner: CRM_DIR oder ../Hello-beauty-salon-CRM)
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const crm = resolve(process.env.CRM_DIR || join(process.cwd(), '..', 'Hello-beauty-salon-CRM'));
const body = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const hash = createHash('sha256').update(body).digest('hex');
const header = `/* Nicht hier ändern – Quelle: Kundenportal (src/styles/tokens.css). Aktualisieren: npm run crm:tokens im Kundenportal.\n   Quell-Hash (sha256): ${hash} */\n`;
mkdirSync(join(crm, 'src/styles'), { recursive: true });
writeFileSync(join(crm, 'src/styles/tokens.css'), header + body);
console.log(`CRM-Tokens geschrieben (${hash.slice(0, 12)}).`);
