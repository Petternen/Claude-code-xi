// Spillflyt: spillere, gjetting, fasit, poeng, historikk og toppliste.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, closeBrowser, closeContexts, newPage, leggTil, gjettAlle, tilstand, fasit, DATA } from './helpers.mjs';

let srv, base;
before(async () => { srv = await startServer(); base = srv.url; });
afterEach(closeContexts);
after(async () => { await closeBrowser(); srv.server.close(); });

test('helt spill: nærmest vinner, gjest telles ikke i topplisten', async () => {
  const page = await newPage(base);
  await leggTil(page, 'Kari', 'Ola', 'gjest:Per');
  assert.equal(await page.locator('[aria-labelledby=h-spillere] .chip[aria-pressed=true]').count(), 3);
  await page.click('[data-act=start]');
  await page.waitForSelector('#gjett-inp');

  // Vilkårene fra PC-versjonen vises før man gjetter
  const vilkar = await page.textContent('.vilkar');
  for (const t of ['Inkludert 25 % merverdiavgift', 'Ordinær pris', 'Ny vare, på lager', 'Prisen ble hentet', 'Tilbudet gjelder', 'Bestilles via nettsiden'])
    assert.ok(vilkar.includes(t), `vilkår mangler «${t}»`);
  const s = await tilstand(page);
  const p = s.runder[0].prod;
  assert.ok(vilkar.includes(p.tilbud.butikk), 'butikken vises');

  // Skjult inntasting som standard (som passordfeltet på PC)
  assert.ok(await page.$eval('#gjett-inp', e => e.classList.contains('skjult')));
  assert.match(await page.textContent('.tur-navn'), /Kari/);

  const f = p.totalpris;
  await gjettAlle(page, f + 50, f - 500, f * 2);
  await page.waitForSelector('#hoved');
  assert.match(await page.textContent('#panel'), /Alle har gjettet/);
  await page.click('#hoved');
  await page.waitForSelector('.fasit');
  await page.waitForTimeout(1200); // opptelling
  assert.equal((await page.textContent('.fasit .pris')).replace(/\s/g, ''), f.toLocaleString('nb-NO').replace(/\s/g, '') + 'kr');
  assert.match(await page.textContent('.resultatkort h2'), /Kari vinner runden/);
  assert.equal(await page.locator('.rangering li').count(), 3);
  assert.match(await page.textContent('.rangering li:first-child .navn'), /Kari/);
  assert.match(await page.textContent('.rangering li:nth-child(2) .navn'), /Ola/);

  // Én runde (standard) → Se resultat
  await page.click('#hoved');
  await page.waitForSelector('.seier');
  assert.match(await page.textContent('.seier h1'), /Kari vinner/);

  // Toppliste: bare faste spillere
  await page.goto(base + '#/statistikk');
  await page.waitForSelector('.faner');
  const rader = await page.$$eval('tbody tr .navn', e => e.map(x => x.textContent.trim()));
  assert.deepEqual(rader.sort(), ['Kari', 'Ola']);
  await page.click('[data-fane=historikk]');
  assert.match(await page.textContent('.historikk'), /Kari, Ola, Per/);
  assert.deepEqual(page.errors, []);
});

test('beløp leses som på PC: mellomrom, punktum, komma og «kr»', async () => {
  const page = await newPage(base);
  const r = await page.evaluate(() => ['12 990', '12.990', '12990,50', '1 234 kr', '12 990,-', 'abc', '', '0'].map(window.__prisgjett.tallFra));
  assert.deepEqual(r.slice(0, 5), [12990, 12990, 12990.5, 1234, 12990]);
  assert.ok(Number.isNaN(r[5]) && Number.isNaN(r[6]));
  assert.equal(r[7], 0);
});

test('ugyldig gjetning gir feilmelding og telles ikke', async () => {
  const page = await newPage(base);
  await leggTil(page, 'Kari');
  await page.click('[data-act=start]');
  await gjettAlle(page, 'hei');
  assert.equal(await page.isVisible('#gjett-feil'), true);
  assert.equal((await tilstand(page)).runder[0].gjett.length, 0);
  await gjettAlle(page, '0');
  assert.equal((await tilstand(page)).runder[0].gjett.length, 0);
});

test('delt seier i runden og uavgjort spill', async () => {
  const page = await newPage(base);
  await leggTil(page, 'Kari', 'Ola');
  await page.click('[data-act=start]');
  const f = await fasit(page);
  await gjettAlle(page, f + 100, f - 100);
  await page.click('#hoved');
  await page.waitForSelector('.fasit');
  assert.match(await page.textContent('.resultatkort h2'), /Delt seier: Kari og Ola/);
  await page.click('#hoved');
  await page.waitForSelector('.seier');
  assert.match(await page.textContent('.seier h1'), /Uavgjort: Kari og Ola/);
});

test('angre, én runde til og ingen vare to ganger i samme spill', async () => {
  const page = await newPage(base);
  await leggTil(page, 'Kari', 'Ola');
  await page.click('[data-act=start]');
  await gjettAlle(page, 1000);
  assert.match(await page.textContent('.tur-navn'), /Ola/);
  await page.click('[data-act=angre]');
  assert.match(await page.textContent('.tur-navn'), /Kari/);
  for (let runde = 1; runde <= 4; runde++) {
    await gjettAlle(page, 1000, 2000);
    await page.click('#hoved');
    await page.waitForSelector('.fasit');
    if (runde < 4) { await page.click('[data-act=en-til]'); await page.waitForSelector('#gjett-inp'); }
  }
  const s = await tilstand(page);
  assert.equal(s.runder.length, 4);
  assert.equal(new Set(s.runder.map(r => r.prod.id)).size, 4, 'ingen gjentatte varer');
  assert.match(await page.textContent('#topp-midt'), /Runde 4\s*av 4/);
});

test('flere runder fra start og rundeseire i resultatet', async () => {
  const page = await newPage(base);
  await leggTil(page, 'Kari', 'Ola');
  await page.click('[data-act=antall][data-d="1"]');
  await page.click('[data-act=antall][data-d="1"]');
  await page.click('[data-act=start]');
  for (let i = 0; i < 3; i++) {
    const f = await fasit(page);
    await gjettAlle(page, i < 2 ? f : f * 3, i < 2 ? f * 3 : f);   // Kari vinner to, Ola én
    await page.click('#hoved');
    await page.waitForSelector('.fasit');
    await page.click('#hoved');
    if (i < 2) await page.waitForSelector('#gjett-inp');
  }
  await page.waitForSelector('.seier');
  assert.match(await page.textContent('.seier h1'), /Kari vinner/);
  const seire = await page.$$eval('tbody tr', r => r.map(x => [x.children[1].textContent.trim(), x.children[2].textContent.trim()]));
  assert.deepEqual(seire, [['Kari', '2'], ['Ola', '1']]);
});

test('bare valgte kategorier brukes, tomme kategorier vises ikke', async () => {
  const page = await newPage(base, { storage: { kategorier: ['kaffetraktere'] } });
  assert.equal(await page.locator('[data-kat=tom]').count(), 0);
  assert.equal(await page.locator('[data-kat=kaffetraktere][aria-pressed=true]').count(), 1);
  await leggTil(page, 'Kari');
  await page.click('[data-act=start]');
  assert.equal((await tilstand(page)).runder[0].prod.kategori, 'kaffetraktere');
  // Kategorien har én vare: «én runde til» gir beskjed i stedet for å gjenta varen
  await gjettAlle(page, 900);
  await page.click('#hoved');
  await page.waitForSelector('.fasit');
  await page.click('[data-act=en-til]');
  assert.match(await page.textContent('#toast'), /Fant ingen flere varer/);
});

test('fast spiller huskes, gjest kan ikke ta en fast spillers navn', async () => {
  const page = await newPage(base);
  await leggTil(page, 'Kari', 'gjest:kari');
  assert.match(await page.textContent('#toast'), /allerede med|fast spiller/);
  await page.reload();
  await page.waitForSelector('.oppsett');
  assert.equal(await page.locator('[data-act=velg-spiller][data-navn=Kari]').count(), 1);
  await page.click('[data-act=velg-spiller][data-navn=Kari]');       // velg bort
  await leggTil(page, 'gjest:KARI');
  assert.match(await page.textContent('#toast'), /fast spiller/);
});

test('spill som avbrytes kan fortsettes etter omlasting', async () => {
  const page = await newPage(base);
  await leggTil(page, 'Kari', 'Ola');
  await page.click('[data-act=start]');
  await gjettAlle(page, 1234);
  await page.goto(base + '#/');
  await page.reload();
  await page.waitForSelector('.fortsett');
  await page.click('[data-act=fortsett]');
  await page.waitForSelector('#gjett-inp');
  assert.match(await page.textContent('.tur-navn'), /Ola/);
  assert.equal((await tilstand(page)).runder[0].gjett[0].tall, 1234);
});

test('hele spillet kan styres med tastaturet', async () => {
  const page = await newPage(base, { storage: { faste: ['Kari', 'Ola'], valgt: [{ navn: 'Kari', fast: true }, { navn: 'Ola', fast: true }] } });
  await page.keyboard.press('Enter');                          // start
  await page.waitForSelector('#gjett-inp');
  await page.locator('#gjett-inp').blur();
  await page.keyboard.press('5');                               // tall fokuserer feltet
  await page.keyboard.type('000');
  await page.keyboard.press('Enter');
  await page.keyboard.type('7000');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#hoved');
  await page.keyboard.press('Enter');                          // vis riktig pris
  await page.waitForSelector('.fasit');
  await page.keyboard.press('Enter');                          // se resultat
  await page.waitForSelector('.seier');
  await page.keyboard.press('t');
  await page.waitForSelector('.faner');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.seier');
  const s = await tilstand(page);
  assert.deepEqual(s.runder[0].gjett.map(g => g.tall), [5000, 7000]);
});

test('vis/skjul tall huskes', async () => {
  const page = await newPage(base);
  await leggTil(page, 'Kari');
  await page.click('[data-act=start]');
  await page.click('[data-act=vis-tall]');
  assert.equal(await page.$eval('#gjett-inp', e => e.classList.contains('skjult')), false);
  await page.reload();
  await page.click('[data-act=fortsett]').catch(() => {});
  await page.goto(base + '#/spill');
  await page.waitForSelector('#gjett-inp');
  assert.equal(await page.$eval('#gjett-inp', e => e.classList.contains('skjult')), false);
});

test('testdataene ser ut som ekte data', () => {
  for (const p of DATA.produkter) assert.equal(p.totalpris, p.tilbud.pris + p.tilbud.frakt);
});

test('teknikk-kategoriene kan velges, men er av som standard', async () => {
  const page = await newPage(base);
  assert.equal(await page.getAttribute('[data-kat=droner]', 'aria-pressed'), 'false', 'av som standard');
  assert.equal(await page.getAttribute('[data-kat=tv]', 'aria-pressed'), 'true', 'andre er på');
  // Spill uten å velge: droner skal aldri komme
  await leggTil(page, 'Kari');
  for (let i = 0; i < 5; i++) {
    await page.click('[data-act=start]');
    assert.notEqual((await tilstand(page)).runder[0].prod.kategori, 'droner');
    await page.goto(base + '#/'); await page.waitForSelector('.oppsett');
  }
  // Velg droner alene
  await page.click('[data-act=alle-kat]');                       // «Velg alle» tar med teknikk
  assert.equal(await page.getAttribute('[data-kat=droner]', 'aria-pressed'), 'true');
  await page.click('[data-act=alle-kat]');                       // «Fjern alle»
  await page.click('[data-kat=droner]');
  await page.click('[data-act=start]');
  assert.equal((await tilstand(page)).runder[0].prod.kategori, 'droner');
  await page.reload();
  await page.goto(base + '#/'); await page.waitForSelector('.oppsett');
  assert.equal(await page.getAttribute('[data-kat=droner]', 'aria-pressed'), 'true', 'valget huskes');
});
