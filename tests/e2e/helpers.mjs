// Felles oppsett for nettlesertester: statisk server, nettleser og faste testdata.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
export { devices };

const ROOT = fileURLToPath(new URL('../../app/', import.meta.url));
const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const DATA = JSON.parse(readFileSync(join(FIXTURES, 'produkter.json'), 'utf8'));
const BILDE = readFileSync(join(FIXTURES, 'bilde.png'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

export function startServer() {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, url: `http://localhost:${server.address().port}/` })));
}

let browser;
export async function getBrowser() { return (browser ||= await chromium.launch()); }
export async function closeBrowser() { await browser?.close(); browser = null; }
const openContexts = new Set();
/** Kjøres etter hver test: lukker kontekster også når testen feilet. */
export async function closeContexts() { for (const c of openContexts) await c.close().catch(() => {}); openContexts.clear(); }

/**
 * Ny side med faste testdata (tests/fixtures/produkter.json), lokale bilder og uten nettfonter.
 * opts.storage: { nøkkel: verdi } legges i localStorage (med prefiks pg_) før første lasting.
 * opts.data: eget datasett i stedet for testdataene. opts.ekteData: bruk app/data/produkter.json.
 */
export async function newPage(base, { viewport = { width: 1024, height: 768 }, device, storage, data, ekteData = false, path = '' } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext(device ? { ...device } : { viewport, hasTouch: true });
  openContexts.add(ctx);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|fontshare\.com/, r => r.abort());
  await ctx.route(/pji\.nu/, r => r.fulfill({ status: 200, contentType: 'image/png', body: BILDE }));
  if (!ekteData) await ctx.route(/\/data\/produkter\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data || DATA) }));
  if (storage) {
    await ctx.addInitScript(s => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(s)) localStorage.setItem('pg_' + k, JSON.stringify(v));
    }, storage);
  }
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(base + path);
  await page.waitForSelector('#skjerm > :not(.laster)');
  return page;
}

export const tilstand = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__prisgjett.S)));
export const fasit = page => page.evaluate(() => window.__prisgjett.S.runder.at(-1).prod.totalpris);

/** Legger til spillere fra oppsettet. Navn som begynner med «gjest:» blir gjester. */
export async function leggTil(page, ...navn) {
  for (const n of navn) {
    const gjest = n.startsWith('gjest:');
    const boks = page.locator('#gjest');
    if ((await boks.isChecked()) !== gjest) await boks.setChecked(gjest);
    await page.fill('#ny-spiller', gjest ? n.slice(6) : n);
    await page.press('#ny-spiller', 'Enter');
  }
}

/** Gjetter for alle i tur og orden. */
export async function gjettAlle(page, ...belop) {
  for (const v of belop) {
    await page.fill('#gjett-inp', String(v));
    await page.press('#gjett-inp', 'Enter');
  }
}

export async function inView(page, sel) {
  return page.$eval(sel, e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1;
  });
}
export const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
