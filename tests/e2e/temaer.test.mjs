// Temaer fra Hallmark: velgeren, at valget huskes, og at hvert tema er lesbart (kontrast) og uten sidelengs scroll.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, closeBrowser, closeContexts, newPage, leggTil, gjettAlle, noHScroll, inView, rolig, devices } from './helpers.mjs';

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

// Smaleste telefon (iPhone SE 1. gen., 320 px): ingenting stikker ut, og hele beløpet synes i gjettefeltet
for (const t of ['stjerne', ...TEMAER]) {
  test(`tema ${t} på 320 px: ingen sidelengs scroll, sekssifret beløp synes helt`, async () => {
    const page = await newPage(base, { device: devices['iPhone SE'], storage: { tema: t } });
    await rolig(page);
    assert.ok(await noHScroll(page), 'oppsett');
    await leggTil(page, 'Kari', 'Ola');
    await rolig(page);
    assert.ok(await noHScroll(page), 'oppsett med spillere');
    await page.click('[data-act=start]');
    await page.waitForSelector('#gjett-inp');
    await rolig(page);
    assert.ok(await noHScroll(page), 'gjetting');
    for (const vis of [false, true]) {
      if (vis) await page.click('[data-act=vis-tall]');
      await page.fill('#gjett-inp', '129990');
      const { sw, cw } = await page.$eval('#gjett-inp', e => ({ sw: e.scrollWidth, cw: e.clientWidth }));
      assert.ok(sw <= cw, `${vis ? 'synlige' : 'skjulte'} tall kuttes: ${sw} > ${cw}`);
    }
    for (const sel of ['[data-act=tema]', '#gjett-inp', '.gjett-skjema .knapp']) assert.ok(await inView(page, sel), `${sel} innenfor skjermen`);
    assert.deepEqual(page.errors, []);
  });
}

test('tastaturfokus synes tydelig i alle temaer (kontrast minst 3:1 mot bakgrunnen)', async () => {
  const page = await newPage(base, { viewport: { width: 1280, height: 800 } });
  await leggTil(page, 'Kari');
  const svake = [];
  for (const t of ['stjerne', ...TEMAER]) {
    await page.evaluate(id => window.TEMAER.bruk(id), t);
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    let sjekket = 0;
    // Knapper og lenker får fokusramme (tekstfelt viser fokus med kantfarge og skrivemerke)
    for (let i = 0; i < 14 && sjekket < 8; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const e = document.activeElement;
        if (!/^(A|BUTTON|SUMMARY)$/.test(e.tagName)) return null;
        const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d', { willReadFrequently: true });
        const rgba = c => { x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
        const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        let bg = null;   // bakgrunnen rammen tegnes på: nærmeste ensfargede forelder
        for (let p = e.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p), c = rgba(cs.backgroundColor);
          if (c[3] > 0.6) { bg = c; break; }
          if (cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage)) break;   // gradient: hoppes over
        }
        const cs = getComputedStyle(e), fg = rgba(cs.outlineColor);
        const k = bg ? (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05) : null;
        return { navn: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 25), stil: cs.outlineStyle, bredde: parseFloat(cs.outlineWidth), k };
      });
      if (!f) continue;
      sjekket++;
      if (f.stil !== 'solid' || f.bredde < 2) svake.push(`${t} «${f.navn}»: ingen ramme (${f.stil} ${f.bredde}px)`);
      else if (f.k !== null && f.k < 3) svake.push(`${t} «${f.navn}»: kontrast ${f.k.toFixed(2)}`);
    }
    assert.ok(sjekket >= 4, `${t}: for få fokusstopp`);
  }
  assert.deepEqual(svake, []);
});
