// Layout på mobil, nettbrett og PC, PWA-oppsett og det ekte datasettet.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { startServer, closeBrowser, closeContexts, newPage, leggTil, gjettAlle, inView, noHScroll, devices } from './helpers.mjs';

let srv, base;
before(async () => { srv = await startServer(); base = srv.url; });
afterEach(closeContexts);
after(async () => { await closeBrowser(); srv.server.close(); });

const SKJERMER = {
  'iPhone SE': { device: devices['iPhone SE'] },
  'iPhone 13': { device: devices['iPhone 13'] },
  'Android': { device: devices['Pixel 7'] },
  'iPad stående': { device: devices['iPad (gen 7)'] },
  'iPad liggende': { device: devices['iPad (gen 7) landscape'] },
  'PC': { viewport: { width: 1366, height: 768 } },
};

for (const [navn, opt] of Object.entries(SKJERMER)) {
  test(`layout ${navn}: ingen sidelengs scroll, gjettefelt og fasit synlige`, async () => {
    const page = await newPage(base, opt);
    await leggTil(page, 'Kari', 'Ola', 'gjest:Per Pettersen');
    assert.ok(await noHScroll(page), 'oppsett');
    await page.locator('[data-act=start]').scrollIntoViewIfNeeded();
    assert.ok(await inView(page, '[data-act=start]'), 'startknapp');
    await page.click('[data-act=start]');
    await page.waitForSelector('#gjett-inp');
    await page.evaluate(() => scrollTo(0, 0));
    assert.ok(await noHScroll(page), 'gjetting');
    for (const sel of ['#gjett-inp', '.galleri', '.produkt-hode h1']) assert.ok(await inView(page, sel), `gjetting: ${sel} synlig uten å rulle`);
    await gjettAlle(page, 1000, 2000, 3000);
    await page.click('#hoved');
    await page.waitForSelector('.fasit');
    assert.ok(await noHScroll(page), 'fasit');
    assert.ok(await inView(page, '.fasit .pris'), 'riktig pris synlig uten å rulle');
    await page.click('#hoved');
    await page.waitForSelector('.seier');
    assert.ok(await noHScroll(page), 'resultat');
    await page.goto(base + '#/statistikk');
    await page.waitForSelector('.faner');
    assert.ok(await noHScroll(page), 'statistikk');
    assert.deepEqual(page.errors, []);
  });
}

test('PWA: manifest, ikoner og offline-liste peker på filer som finnes', async () => {
  const app = new URL('../../app/', import.meta.url);
  const m = JSON.parse(await readFile(new URL('manifest.webmanifest', app), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.ok(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const i of m.icons) await access(new URL(i.src, app));
  const sw = await readFile(new URL('sw.js', app), 'utf8');
  const liste = [...sw.match(/const SKALL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(liste.length > 5);
  for (const f of liste) if (f !== './') await access(new URL(f, app));
  const html = await readFile(new URL('index.html', app), 'utf8');
  for (const f of ['app.css', 'app.js', 'fx.js', 'manifest.webmanifest', 'ikoner/apple-touch-icon.png']) assert.ok(html.includes(f), f);
});

test('ekte datasett: gyldig form, priser stemmer og ingen pris i navnene', async () => {
  const d = JSON.parse(await readFile(new URL('../../app/data/produkter.json', import.meta.url), 'utf8'));
  assert.ok(d.produkter.length >= 100, `for få varer: ${d.produkter.length}`);
  assert.ok(!Number.isNaN(Date.parse(d.generert)));
  const slugs = new Set(Object.values(d.grupper).flatMap(g => Object.keys(g)));
  const mistenkt = /\d\s*kr\b|\bkr\s*\d|,-|black\s*friday|cyber\s*monday|\bfra\s+\d/i;
  for (const p of d.produkter) {
    assert.ok(slugs.has(p.kategori), `ukjent kategori ${p.kategori}`);
    assert.ok(p.navn && p.bilder.length, `${p.id} mangler navn eller bilder`);
    assert.ok(!p.bilder.some(b => b.includes('/g/')), `${p.id} har logo i galleriet`);
    assert.ok(Math.abs(p.totalpris - (p.tilbud.pris + p.tilbud.frakt)) < 0.01, `${p.id} totalpris`);
    assert.ok(!mistenkt.test(p.navn), `pris/kampanje i navn: ${p.navn}`);
    assert.ok(!Number.isNaN(Date.parse(p.hentet)), `${p.id} hentet`);
  }
});

test('appen laster det ekte datasettet uten feil', async () => {
  const page = await newPage(base, { ekteData: true });
  await page.waitForSelector('.kategorigruppe');
  assert.ok(await page.locator('[data-act=kategori]').count() >= 30);
  assert.deepEqual(page.errors, []);
});

test('skarpe bilder: media.pji.nu får srcset, forstørr-knappen åpner fullskjerm', async () => {
  const page = await newPage(base, { device: devices['iPhone 13'] });
  await leggTil(page, 'Kari');
  await page.click('[data-act=start]');
  await page.waitForSelector('.galleri img');
  const [cdn, media] = await page.$$eval('.galleri .spor img', l => l.map(i => ({ src: i.getAttribute('src'), srcset: i.srcset, sizes: i.sizes })));
  assert.equal(cdn.srcset, '', 'cdn-bilder finnes bare i én størrelse');
  assert.match(media.src, /media\.pji\.nu\/\d+-b\.webp\?width=800&height=800$/);
  assert.match(media.srcset, /\?width=1600&height=1600 1600w/);
  assert.match(media.sizes, /100vw/);
  await page.click('.galleri .forstorr');
  await page.waitForSelector('#lysboks[open] .spor img');
  assert.deepEqual(await page.$$eval('#lysboks .spor img', l => l.map(i => i.sizes)), ['', '100vw'], 'fullskjerm velger største bilde');
  assert.equal(await page.locator('#lysboks .forstorr').count(), 0);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#lysboks:not([open])', { state: 'attached' });
  assert.deepEqual(page.errors, []);
});

for (const [navn, device] of [['iPhone 13', devices['iPhone 13']], ['iPad liggende', devices['iPad Pro 11 landscape']]]) {
  test(`${navn}: produktbildet får plass i ruten og kuttes ikke`, async () => {
    const page = await newPage(base, { device });
    await leggTil(page, 'Kari');
    await page.click('[data-act=start]');
    await page.waitForSelector('.galleri img');
    await page.waitForFunction(() => document.querySelector('.spor img').complete);
    const r = await page.$eval('.spor figure', f => {
      const fr = f.getBoundingClientRect(), ir = f.querySelector('img').getBoundingClientRect();
      return { inni: ir.top >= fr.top - 0.5 && ir.bottom <= fr.bottom + 0.5 && ir.left >= fr.left - 0.5 && ir.right <= fr.right + 0.5, ir: [ir.width, ir.height], fr: [fr.width, fr.height] };
    });
    assert.ok(r.inni, `bildet går utenfor ruten: ${JSON.stringify(r)}`);
  });
}
