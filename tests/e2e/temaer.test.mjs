// Temaer fra Hallmark: velgeren, at valget huskes, og at hvert tema er lesbart (kontrast) og uten sidelengs scroll.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, closeBrowser, closeContexts, newPage, leggTil, gjettAlle, noHScroll, devices } from './helpers.mjs';

let srv, base;
before(async () => { srv = await startServer(); base = srv.url; });
afterEach(closeContexts);
after(async () => { await closeBrowser(); srv.server.close(); });

const TEMAER = ['carnival', 'hum', 'ultraviolet', 'riso', 'squeeze'];
const tema = page => page.evaluate(() => document.documentElement.dataset.tema || 'stjerne');

test('temavelgeren: velg, husk etter omlasting, og tilbake til standard', async () => {
  const page = await newPage(base);
  assert.equal(await tema(page), 'stjerne');
  await page.click('[data-act=tema]');
  await page.waitForSelector('#temavelger[open]');
  assert.equal(await page.locator('.temavalg').count(), 6);
  assert.equal(await page.getAttribute('.temavalg[data-id=stjerne]', 'aria-checked'), 'true');
  await page.click('.temavalg[data-id=squeeze]');
  assert.equal(await page.isVisible('#temavelger'), false, 'lukkes etter valg');
  assert.equal(await tema(page), 'squeeze');
  assert.equal(await page.$eval('meta[name=theme-color]', m => m.content), '#075930');
  await page.reload();
  // Temaet settes før appen tegner noe (temaer.js i <head>), så det ikke blinker
  assert.equal(await tema(page), 'squeeze');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), await page.evaluate(() => {
    const d = document.createElement('div'); d.style.color = getComputedStyle(document.documentElement).getPropertyValue('--s-gronn'); document.body.append(d);
    const c = getComputedStyle(d).color; d.remove(); return c;
  }));
  await page.click('[data-act=tema]');
  await page.click('.temavalg[data-id=stjerne]');
  assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-tema')), false);
  assert.deepEqual(page.errors, []);
});

test('temavelgeren med tastatur: U åpner, piltaster bytter med en gang, Esc lukker', async () => {
  const page = await newPage(base);
  await page.keyboard.press('u');
  await page.waitForSelector('#temavelger[open]');
  await page.keyboard.press('ArrowRight');
  assert.equal(await tema(page), 'carnival');
  await page.keyboard.press('ArrowRight');
  assert.equal(await tema(page), 'hum');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await tema(page), 'squeeze', 'går rundt');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#temavelger'), false);
  assert.equal(await tema(page), 'squeeze');
});

// Kontrast (WCAG 2): tekstfarge mot nærmeste ensfargede bakgrunn. Stor tekst (≥ 24px, eller ≥ 18,7px fet) må ha 3:1, annen 4,5:1.
async function kontrast(page, selektorer) {
  return page.evaluate(sel => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d', { willReadFrequently: true });
    const rgba = c => { x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bakgrunn = el => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e), c = rgba(cs.backgroundColor);
        if (c[3] > 0.6) return c;
        if (cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage)) return null; // gradient: hoppes over
      }
      return rgba(getComputedStyle(document.body).backgroundColor);
    };
    return sel.map(s => {
      const el = document.querySelector(s);
      if (!el) return { s, mangler: true };
      const cs = getComputedStyle(el), bg = bakgrunn(el);
      if (!bg) return { s, hoppet: true };
      const fg = rgba(cs.color), a = lum(fg), b = lum(bg);
      const k = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const px = parseFloat(cs.fontSize), stor = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
      return { s, k: Math.round(k * 100) / 100, krav: stor ? 3 : 4.5 };
    });
  }, selektorer);
}

for (const t of TEMAER) {
  test(`tema ${t}: lesbart på mobil gjennom et helt spill`, async () => {
    const page = await newPage(base, { device: devices['iPhone 13'], storage: { tema: t } });
    assert.equal(await tema(page), t);
    await leggTil(page, 'Kari', 'Ola', 'gjest:Per');
    const svake = [];
    const sjekk = async sel => { for (const r of await kontrast(page, sel)) if (!r.mangler && !r.hoppet && r.k < r.krav) svake.push(`${r.s}: ${r.k} < ${r.krav}`); };
    await sjekk(['.velkommen h1', '.velkommen p', '#h-spillere', '[aria-labelledby=h-spillere] .chip[aria-pressed=true]', '.chip.gjest',
      '[data-act=start]', '.kategorigruppe summary', '.melding.info', '.stepper output', '.lenke']);
    assert.ok(await noHScroll(page), 'oppsett');
    await page.click('[data-act=start]');
    await page.waitForSelector('#gjett-inp');
    await page.fill('#gjett-inp', '1234');
    await sjekk(['.produkt-hode h1', '.tur-navn', '.vilkar dt', '.vilkar dd', '#gjett-inp', '.gjett-skjema .knapp', '#gjett-hjelp', '.levert span.na', '.tur-teller', '.kategori-merke']);
    assert.ok(await noHScroll(page), 'gjetting');
    await page.fill('#gjett-inp', '');
    await gjettAlle(page, 1000, 2000, 3000);
    await sjekk(['#hoved']);
    await page.click('#hoved');
    await page.waitForSelector('.fasit');
    await sjekk(['.fasit .etikett', '.fasit .pris', '.fasit .oppstilling', '.resultatkort h2', '.rangering li.vinner .navn', '.rangering li:not(.vinner) .navn', '.rangering .avvik', '#hoved', '[data-act=en-til]']);
    assert.ok(await noHScroll(page), 'fasit');
    await page.click('#hoved');
    await page.waitForSelector('.seier');
    await sjekk(['.seier h1', '.seier p', 'thead th', 'td.navn', '[data-act=spill-igjen]']);
    assert.ok(await noHScroll(page), 'resultat');
    assert.deepEqual(svake, [], `for svak kontrast i ${t}`);
    assert.deepEqual(page.errors, []);
  });
}
