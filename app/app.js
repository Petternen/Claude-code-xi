/* Prisgjett – mobil- og nettbrettversjon. Ingen byggesteg, ingen avhengigheter.
   Spillregler og prisvilkår følger PC-versjonen (prisgjett/index.html og db.py). */
'use strict';
(() => {
  // ---------- Hjelpere ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NF = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
  const NF1 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const kr = n => NF.format(Math.round(n)) + ' kr';
  const pst = n => NF1.format(n) + ' %';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DATO = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  const TID = new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' });
  const datotid = iso => { const d = new Date(iso); return isNaN(d) ? esc(iso || '') : `${DATO.format(d)} kl. ${TID.format(d)}`; };
  const nokkel = n => String(n).toLocaleLowerCase('nb').trim();
  const lik = (a, b) => nokkel(a) === nokkel(b);
  const tilfeldig = l => l[Math.floor(Math.random() * l.length)];
  const rensNavn = s => s.replace(/\s+/g, ' ').trim().slice(0, 24);
  const reduserBevegelse = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BRED = matchMedia('(min-width: 900px) and (orientation: landscape), (min-width: 1100px)');
  const bred = () => BRED.matches;

  /** Leser et beløp slik PC-versjonen gjør: «12 990», «12.990», «12990,50», «12 990 kr». */
  function tallFra(tekst) {
    let s = String(tekst).trim().replace(/kr|nok|,-|\s| /gi, '');
    if (!s) return NaN;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  const lager = {
    hent(k, std) { try { const v = localStorage.getItem('pg_' + k); return v == null ? std : JSON.parse(v); } catch { return std; } },
    sett(k, v) { try { localStorage.setItem('pg_' + k, JSON.stringify(v)); } catch { /* privat modus o.l. */ } },
    fjern(k) { try { localStorage.removeItem('pg_' + k); } catch { /* ignorer */ } },
  };

  const IKON = {
    v: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    h: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    oye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    lukketOye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    merke: '<svg viewBox="0 0 64 64" class="merke-stor" aria-hidden="true"><use href="#ikon-merke"/></svg>',
    forstorr: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  };

  // ---------- Tilstand ----------
  let DATA = null;          // produkter.json
  let PER_KAT = {};         // slug -> [produkt]
  let KATNAVN = {};         // slug -> visningsnavn
  let S = lager.hent('spill', null);   // pågående spill
  const P = {               // oppsett, huskes mellom spill
    faste: lager.hent('faste', []),
    valgt: lager.hent('valgt', []),     // [{navn, fast}]
    kategorier: lager.hent('kategorier', null), // null = alle
    antall: lager.hent('antall', 1),
    vis: lager.hent('vis-tall', false),  // vis tallene mens man skriver
    gjest: false, redigerer: false,
  };
  const lagreP = () => { lager.sett('faste', P.faste); lager.sett('valgt', P.valgt); lager.sett('kategorier', P.kategorier); lager.sett('antall', P.antall); };
  const lagreS = () => lager.sett('spill', S);

  // ---------- Data ----------
  async function lastData() {
    vis(`<div class="laster">${IKON.merke}<div>Henter varer og priser …</div></div>`);
    try {
      const r = await fetch('data/produkter.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      DATA = await r.json();
    } catch (e) {
      vis(`<div class="laster"><div class="kort" style="max-width:440px">${IKON.merke}<h1 style="margin-top:12px">Fikk ikke hentet varene</h1>
        <p class="dempet">Sjekk nettforbindelsen og prøv igjen. (${esc(e.message)})</p>
        <button class="knapp" data-act="last-pa-nytt">Prøv igjen</button></div></div>`);
      return;
    }
    PER_KAT = {}; KATNAVN = {};
    for (const g of Object.values(DATA.grupper || {})) Object.assign(KATNAVN, g);
    for (const p of DATA.produkter || []) {
      if (!(p.totalpris > 0) || !p.tilbud) continue;
      (PER_KAT[p.kategori] ||= []).push(p);
    }
    rute();
  }

  const alleKategorier = () => Object.keys(KATNAVN).filter(k => PER_KAT[k]?.length);
  // Uten eget valg: alle kategorier unntatt dem datasettet sier skal være av som standard
  const valgteKategorier = () => {
    const alle = alleKategorier(), av = new Set(DATA.standard_av || []);
    return P.kategorier ? alle.filter(k => P.kategorier.includes(k)) : alle.filter(k => !av.has(k));
  };

  // ---------- Ruting ----------
  function rute() {
    if (!DATA) return;
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'spill' && S && !S.ferdig && S.runder.length) return visRunde();
    if (h === 'resultat' && S && S.runder.some(r => r.fasit)) {
      if (!S.ferdig && S.runder.length && !aktiv().fasit) { history.replaceState(null, '', '#/spill'); return visRunde(); }
      return visResultat();
    }
    if (h.startsWith('statistikk')) return visStatistikk(h.includes('historikk') ? 'historikk' : 'toppliste');
    return visOppsett();
  }
  function gaa(h) {
    if (location.hash === '#/' + h || (!h && !location.hash)) rute(); else location.hash = '#/' + h;
  }
  addEventListener('hashchange', () => { rute(); scrollTo(0, 0); });
  BRED.addEventListener?.('change', () => {
    if (!DATA) return;
    const felt = ['#gjett-inp', '#ny-spiller'].map(sel => [sel, $(sel)?.value]);
    rute();
    for (const [sel, v] of felt) if (v && $(sel)) $(sel).value = v;
  });

  function vis(html, midt = '') {
    const m = $('#skjerm');
    m.innerHTML = html;
    m.firstElementChild?.classList.add('inn');
    $('#topp-midt').innerHTML = midt;
    $$('[data-galleri]', m).forEach(kobleGalleri);
  }

  let toastTimer;
  function toast(t) {
    const el = $('#toast'); el.textContent = t; el.classList.add('vis');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('vis'), 1800);
  }

  // ---------- Oppsett ----------
  function visOppsett() {
    const valgteKat = new Set(valgteKategorier());
    const antallVarer = [...valgteKat].reduce((s, k) => s + PER_KAT[k].length, 0);
    const gjester = P.valgt.filter(v => !v.fast);
    const erValgt = n => P.valgt.some(v => lik(v.navn, n));
    const generert = DATA.generert ? new Date(DATA.generert) : null;
    const dagerGammel = generert ? (Date.now() - generert) / 864e5 : 99;
    const pagaende = S && !S.ferdig && S.runder.length;
    const kanStarte = P.valgt.length && valgteKat.size;

    const spillerChips = [
      ...P.faste.map(n => `<button class="chip" data-act="velg-spiller" data-navn="${esc(n)}" aria-pressed="${erValgt(n)}">${esc(n)}</button>`),
      ...gjester.map(g => `<span class="chip gjest" aria-pressed="true">${esc(g.navn)} <span class="merke">gjest</span>
          <button class="x" data-act="fjern-gjest" data-navn="${esc(g.navn)}" aria-label="Fjern gjest ${esc(g.navn)}">${IKON.x}</button></span>`),
    ].join('');

    const grupper = Object.entries(DATA.grupper || {}).map(([gnavn, kats]) => {
      const slugs = Object.keys(kats).filter(k => PER_KAT[k]?.length);
      if (!slugs.length) return '';
      const n = slugs.filter(k => valgteKat.has(k)).length;
      return `<details class="kategorigruppe" ${bred() ? 'open' : ''}>
        <summary>${esc(gnavn)}<span class="teller">${n} av ${slugs.length}</span></summary>
        <div class="chips">
          <button class="chip liten-chip alle" data-act="gruppe" data-gruppe="${esc(gnavn)}">${n === slugs.length ? 'Fjern alle' : 'Velg alle'}</button>
          ${slugs.map(k => `<button class="chip liten-chip" data-act="kategori" data-kat="${esc(k)}" aria-pressed="${valgteKat.has(k)}">${esc(kats[k])}</button>`).join('')}
        </div></details>`;
    }).join('');

    vis(`<div class="oppsett">
      <div class="velkommen full"><h1>Gjett <span>prisen!</span></h1>
        <p>Ekte varer fra norske nettbutikker. Nærmest totalpris vinner runden.</p></div>
      ${pagaende ? `<div class="kort full fortsett">
        <div><strong>Spillet pågår</strong><div class="dempet liten">Runde ${S.runder.length} av ${Math.max(S.antall, S.runder.length)} · ${esc(S.spillere.map(s => s.navn).join(', '))}</div></div>
        <button class="knapp gull" data-act="fortsett">Fortsett</button>
        <button class="lenke" data-act="avslutt">Avslutt</button>
      </div>` : ''}
      <div class="venstre">
        <section class="kort" aria-labelledby="h-spillere">
          <div class="kort-topp"><h2 id="h-spillere">Hvem spiller?</h2><small>${P.valgt.length} valgt</small></div>
          ${spillerChips ? `<div class="chips" style="margin-bottom:14px">${spillerChips}</div>` : `<p class="dempet" style="margin:0 0 12px">Skriv inn navnene på dem som skal spille. Faste spillere huskes på denne enheten.</p>`}
          <form class="rad" data-form="ny-spiller" autocomplete="off">
            <input class="felt" id="ny-spiller" maxlength="24" placeholder="${P.gjest ? 'Navn på gjest' : 'Nytt navn'}" aria-label="Navn på spiller" enterkeyhint="done" autocapitalize="words">
            <button class="knapp hvit">Legg til</button>
          </form>
          <div class="rad" style="justify-content:space-between;flex-wrap:wrap">
            <label class="bryter"><input type="checkbox" id="gjest" ${P.gjest ? 'checked' : ''}> Gjest – telles ikke i topplisten</label>
            ${P.faste.length ? `<button class="lenke" data-act="rediger-faste">${P.redigerer ? 'Ferdig' : 'Rediger faste'}</button>` : ''}
          </div>
          ${P.redigerer ? `<div class="chips" style="margin-top:8px">${P.faste.map(n => `<button class="chip liten-chip slett" data-act="slett-fast" data-navn="${esc(n)}" aria-label="Fjern ${esc(n)}">${esc(n)} ${IKON.x}</button>`).join('')}</div>
            <p class="dempet liten" style="margin:8px 0 0">Trykk på et navn for å fjerne det fra listen. Tidligere resultater beholdes i statistikken.</p>` : ''}
        </section>
        <section class="kort" aria-labelledby="h-runder">
          <div class="kort-topp" style="margin:0"><div><h2 id="h-runder">Runder</h2><small>Kan utvides underveis</small></div>
            <div class="stepper">
              <button data-act="antall" data-d="-1" aria-label="Færre runder">−</button>
              <output class="tall" aria-live="polite">${P.antall}</output>
              <button data-act="antall" data-d="1" aria-label="Flere runder">+</button>
            </div></div>
        </section>
        <div class="startlinje">
          <button class="knapp stor" data-act="start" ${kanStarte ? '' : 'disabled'}>${kanStarte ? 'Start spill' : P.valgt.length ? 'Velg en kategori' : 'Legg til en spiller'} <kbd>Enter</kbd></button>
        </div>
        <div class="melding info${dagerGammel > 3 ? ' advarsel' : ''}">
          Priser fra <strong>Prisjakt.no</strong>${generert ? `, hentet ${datotid(generert)}` : ''}. ${NF.format(antallVarer)} varer i valgte kategorier.
          ${dagerGammel > 3 ? `<br><strong>Prisene er ${Math.floor(dagerGammel)} dager gamle.</strong> Åpne appen med nett for å få nye.` : ''}
        </div>
        ${installHint()}
      </div>
      <section class="kort kat-kort" aria-labelledby="h-kat">
        <div class="kort-topp"><h2 id="h-kat">Kategorier</h2>
          <button class="lenke" data-act="alle-kat">${valgteKat.size === alleKategorier().length ? 'Fjern alle' : 'Velg alle'}</button></div>
        ${grupper}
      </section>
    </div>`);
  }

  function installHint() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installert = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (!ios || installert || lager.hent('ios-hint-lukket', false)) return '';
    return `<div class="melding info rad" style="align-items:flex-start">
      <div style="flex:1">Legg Prisgjett på Hjem-skjermen: trykk <strong>Del</strong> og velg <strong>Legg til på Hjem-skjerm</strong>.</div>
      <button class="ikonknapp" data-act="lukk-ios-hint" aria-label="Lukk tips" style="width:36px;height:36px">${IKON.x}</button></div>`;
  }

  function leggTilSpiller(navn) {
    navn = rensNavn(navn);
    if (!navn) return;
    if (P.valgt.some(v => lik(v.navn, navn))) { toast(`${navn} er allerede med`); return; }
    if (P.gjest) {
      if (P.faste.some(f => lik(f, navn))) { toast(`«${navn}» er en fast spiller. Velg navnet fra listen.`); return; }
      P.valgt.push({ navn, fast: false });
    } else {
      const fast = P.faste.find(f => lik(f, navn));
      if (!fast) P.faste.push(navn);
      P.valgt.push({ navn: fast || navn, fast: true });
    }
    lagreP(); behold(visOppsett);
    $('#ny-spiller')?.focus();
  }

  // ---------- Spill ----------
  function velgProdukt(kategorier, utelat) {
    const brukt = new Set(lager.hent('brukt', []));
    const fra = filter => kategorier.map(k => (PER_KAT[k] || []).filter(filter)).filter(l => l.length);
    let kandidater = fra(p => !brukt.has(p.id) && !utelat.has(p.id));
    if (!kandidater.length) {          // alt er brukt: start på nytt for disse kategoriene
      const fjern = new Set(kategorier.flatMap(k => (PER_KAT[k] || []).map(p => p.id)));
      lager.sett('brukt', [...brukt].filter(id => !fjern.has(id)));
      kandidater = fra(p => !utelat.has(p.id));
    }
    if (!kandidater.length) return null;
    const p = tilfeldig(tilfeldig(kandidater)); // først kategori, så vare – store kategorier dominerer ikke
    lager.sett('brukt', [...lager.hent('brukt', []), p.id].slice(-800));
    return p;
  }

  // Finnes det flere varer i spillets kategorier som ikke er brukt i dette spillet?
  const flereVarer = () => {
    const brukt = new Set(S.runder.map(r => r.prod.id));
    return S.kategorier.some(k => (PER_KAT[k] || []).some(p => !brukt.has(p.id)));
  };

  function startSpill() {
    const kat = valgteKategorier();
    if (!P.valgt.length) { toast('Legg til minst én spiller'); $('#ny-spiller')?.focus(); return; }
    if (!kat.length) { toast('Velg minst én kategori'); return; }
    S = {
      id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      start: new Date().toISOString(),
      spillere: P.valgt.map(v => ({ navn: v.navn, fast: v.fast })),
      kategorier: kat, runder: [], ferdig: false,
      antall: Math.max(1, Math.min(P.antall, kat.reduce((n, k) => n + (PER_KAT[k] || []).length, 0))),
    };
    if (!nyRunde()) return;
    gaa('spill');
  }

  function nyRunde() {
    const p = velgProdukt(S.kategorier, new Set(S.runder.map(r => r.prod.id)));
    if (!p) { toast('Fant ingen flere varer i de valgte kategoriene'); return false; }
    S.runder.push({ prod: p, gjett: [], fasit: false });
    lagreS();
    return true;
  }

  const aktiv = () => S.runder[S.runder.length - 1];
  const tur = r => S.spillere.find(s => !r.gjett.some(g => lik(g.navn, s.navn)));

  /** Rangerer gjetningene. Alle med minst avvik vinner runden (som på PC). */
  function beregn(r) {
    const fasit = r.prod.totalpris;
    const l = r.gjett.map(g => {
      const abs = Math.abs(g.tall - fasit);
      return { navn: g.navn, tall: g.tall, avvik: g.tall - fasit, abs, pst: abs / fasit * 100 };
    }).sort((a, b) => a.abs - b.abs);
    let plass = 0, forrige = -1;
    l.forEach((g, i) => { if (g.abs !== forrige) { plass = i + 1; forrige = g.abs; } g.plass = plass; g.vinner = plass === 1; });
    return l;
  }

  function rundeMerke() {
    const nr = S.runder.length, totalt = Math.max(S.antall, nr);
    const prikker = totalt <= 6 ? `<span class="prikkrekke" aria-hidden="true">${Array.from({ length: totalt }, (_, i) =>
      `<i class="${i < nr - 1 || (i === nr - 1 && aktiv().fasit) ? 'ferdig' : i === nr - 1 ? 'na' : ''}"></i>`).join('')}</span>` : '';
    return `<span class="runde-merke">${prikker}<span>Runde ${nr}<span class="dempet"> av ${totalt}</span></span></span>`;
  }

  function leveringstid(d) {
    if (!d || typeof d !== 'object') return '';
    const [a, b] = [esc(d.min), esc(d.max)];
    return a === b ? `${a} ${a === '1' ? 'dag' : 'dager'}` : `${a}–${b} dager`;
  }

  /** Samme vilkår som PC-versjonen viser før man gjetter. */
  function vilkarHTML(p) {
    const t = p.tilbud || {};
    const frakt = t.frakt > 0 ? `Inkludert i prisen (${kr(t.frakt)} lagt til varens pris)` : 'Fri frakt, ingen fraktkostnad lagt til';
    const fraktDetaljer = [t.fraktmetode, t.transportor].filter(Boolean).map(esc).join(' · ');
    const lev = leveringstid(t.leveringsdager);
    const rader = [
      ['Butikk', `<strong>${esc(t.butikk || 'Ukjent')}</strong>${t.butikkvurdering ? ` <span class="stjerner">★ ${NF1.format(t.butikkvurdering)}</span>` : ''}<br><span class="dempet liten">Bestilles via nettsiden deres, funnet på Prisjakt</span>`],
      ['Mva', '<span class="ok">Inkludert 25 % merverdiavgift</span>'],
      ['Frakt', frakt + (fraktDetaljer ? ` · ${fraktDetaljer}` : '') + (lev ? ` · leveringstid ${lev}` : '')],
      ['Pris', '<span class="ok">Ordinær pris, <u>uten</u> rabatt, kampanje eller kupong</span>'],
      ['Tilstand', 'Ny vare, på lager'],
      ['Når', `Prisen ble hentet ${datotid(p.hentet)}`],
      ['Tilbudet gjelder', `<span class="liten">${esc(t.tilbudsnavn || p.navn)}</span>`],
    ];
    return `<section class="kort vilkar-kort" aria-label="Vilkår for prisen"><dl class="vilkar">${rader.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></section>`;
  }

  function produktHode(p) {
    return `<div class="produkt-hode"><h1>${esc(p.navn)}</h1></div>`;
  }

  function visRunde() {
    const r = aktiv(), p = r.prod;
    if (r.fasit) return visFasit(r);
    vis(`<div class="runde">
      <div class="venstre">${galleriHTML(p.bilder || [], p.navn, KATNAVN[p.kategori])}</div>
      <div class="hoyre">
        ${produktHode(p)}
        ${vilkarHTML(p)}
        <section class="kort gjettepanel klebrig" id="panel" aria-live="polite"></section>
      </div>
    </div>`, rundeMerke());
    tegnPanel(false);
  }

  function tegnPanel(fokus = true) {
    const r = aktiv(), neste = tur(r), panel = $('#panel');
    if (!panel) return;
    const flere = S.spillere.length > 1;
    const chips = S.spillere.map(s => {
      const ja = r.gjett.some(g => lik(g.navn, s.navn));
      const na = neste && lik(neste.navn, s.navn);
      return `<span class="${ja ? 'ja' : na ? 'na' : ''}">${ja ? '✓ ' : ''}${esc(s.navn)}</span>`;
    }).join('');
    if (neste) {
      panel.innerHTML = `
        <div class="tur"><div class="tur-navn"><span>${esc(neste.navn)}</span>, hva er prisen?</div>
          ${flere ? `<div class="tur-teller">${r.gjett.length + 1} av ${S.spillere.length}</div>` : ''}</div>
        <form class="gjett-skjema" data-form="gjett" autocomplete="off">
          <div class="kr-felt">
            <input id="gjett-inp" class="${P.vis ? '' : 'skjult'}" inputmode="decimal" enterkeyhint="send" placeholder="0" autocomplete="off" autocorrect="off" spellcheck="false"
              aria-label="Gjett for ${esc(neste.navn)}: totalpris i kroner" aria-describedby="gjett-hjelp">
            <span class="kr">kr</span>
            <button type="button" class="oye" data-act="vis-tall" aria-pressed="${P.vis}" aria-label="${P.vis ? 'Skjul tallene' : 'Vis tallene'}">${P.vis ? IKON.oye : IKON.lukketOye}</button>
          </div>
          <button class="knapp">Lås inn</button>
        </form>
        <p class="feil" id="gjett-feil" role="alert" hidden></p>
        <p class="dempet liten" id="gjett-hjelp" style="margin:-4px 0 0">Totalpris: vare + frakt, inkl. mva.${flere ? ' Ikke la de andre se skjermen.' : ''}</p>
        ${flere ? `<div class="levert">${chips}</div>` : ''}
        ${r.gjett.length ? `<button class="lenke" data-act="angre" style="justify-self:start">Angre forrige gjetning</button>` : ''}`;
      // På mobil åpner fokus tastaturet – gjør det bare når en spiller nettopp har låst inn, eller på store skjermer
      if (fokus || bred()) $('#gjett-inp').focus({ preventScroll: !fokus });
    } else {
      panel.innerHTML = `
        <div class="tur"><div class="tur-navn">Alle har gjettet!</div></div>
        ${flere ? `<div class="levert">${chips}</div>` : ''}
        <button class="knapp gull stor" data-act="fasit" id="hoved">Vis riktig pris <kbd>Enter</kbd></button>
        <button class="lenke" data-act="angre" style="justify-self:start">Angre forrige gjetning</button>`;
      $('#hoved').focus({ preventScroll: true });
    }
  }

  function gjett(verdi) {
    const tall = tallFra(verdi);
    const feil = $('#gjett-feil');
    if (!(tall > 0) || tall > 10000000) {
      feil.textContent = 'Skriv inn et gyldig beløp over 0.'; feil.hidden = false;
      const f = $('.kr-felt'); f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
      $('#gjett-inp').focus();
      return;
    }
    const r = aktiv(), neste = tur(r);
    if (!neste) return;
    r.gjett.push({ navn: neste.navn, tall });
    lagreS();
    if (S.spillere.length > 1 && tur(r)) toast(`${neste.navn} har låst inn`);
    tegnPanel(true);
  }

  function visFasit(r) {
    const p = r.prod, t = p.tilbud || {}, nr = S.runder.length;
    const liste = beregn(r);
    const vinnere = liste.filter(g => g.vinner);
    const siste = nr >= S.antall || !flereVarer();
    const overskrift = !vinnere.length ? 'Ingen gjetninger'
      : S.spillere.length === 1 ? (Math.round(liste[0].abs) === 0 ? 'Helt riktig!' : `${pst(liste[0].pst)} unna`)
      : vinnere.length > 1 ? `Delt seier: ${esc(vinnere.map(v => v.navn).join(' og '))}` : `${esc(vinnere[0].navn)} vinner runden!`;
    vis(`<div class="runde fasitvisning">
      <div class="venstre">${galleriHTML(p.bilder || [], p.navn, KATNAVN[p.kategori])}${bred() ? vilkarHTML(p) : ''}</div>
      <div class="hoyre">
        ${produktHode(p)}
        <section class="kort fasit" aria-live="polite">
          <div class="etikett">Riktig pris</div>
          <div class="pris" data-tell="${p.totalpris}">${kr(p.totalpris)}</div>
          <div class="oppstilling">${t.frakt > 0 ? `Varepris ${kr(t.pris)} + frakt ${kr(t.frakt)}` : `Varepris ${kr(t.pris ?? p.totalpris)}, fri frakt`}, inkl. mva, hos ${esc(t.butikk || '')}</div>
        </section>
        <section class="kort resultatkort" aria-label="Resultat for runden">
          <div class="kort-topp"><h2>${overskrift}</h2></div>
          <ol class="rangering">${liste.map((g, i) => `<li class="${g.vinner ? 'vinner' : ''}" style="--d:${0.35 + i * 0.12}s">
            <span class="plass">${g.vinner && S.spillere.length > 1 ? '🏆' : g.plass}</span><span class="navn">${esc(g.navn)}</span><span class="gjett tall">${kr(g.tall)}</span>
            <span class="avvik"><span class="stolpe"><i style="width:${Math.max(4, 100 - Math.min(g.pst, 100))}%"></i></span>
              <span class="tall">${Math.round(g.abs) === 0 ? 'Helt riktig!' : `${g.avvik < 0 ? '−' : '+'}${kr(g.abs)} · ${pst(g.pst)}`}</span></span>
          </li>`).join('')}</ol>
        </section>
        ${bred() ? '' : vilkarHTML(p)}
        <div class="lenker">
          ${/^https?:\/\//i.test(t.url || '') ? `<a class="lenke" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Tilbudet hos ${esc(t.butikk || 'butikken')} ↗</a>` : ''}
          ${p.prisjakt_url ? `<a class="lenke" href="${esc(p.prisjakt_url)}" target="_blank" rel="noopener noreferrer">Se på Prisjakt ↗</a>` : ''}
        </div>
        <div class="handlinger${siste ? ' to' : ''}">
          ${siste
            ? `${flereVarer() ? '<button class="knapp hvit" data-act="en-til">+ Én runde til</button>' : '<p class="dempet liten" style="margin:0;align-self:center">Ingen flere varer i de valgte kategoriene.</p>'}
               <button class="knapp" data-act="ferdig" id="hoved">Se resultat <kbd>Enter</kbd></button>`
            : `<button class="knapp stor" data-act="neste" id="hoved">Neste runde <kbd>Enter</kbd></button>`}
        </div>
      </div>
    </div>`, rundeMerke());
    $('#hoved')?.focus({ preventScroll: true });
  }

  function visFasitNa() {
    const r = aktiv();
    if (tur(r)) return;
    r.fasit = true;
    $('#toast').classList.remove('vis');
    lagreS(); lagreHistorikk();
    visRunde();
    scrollTo({ top: 0, behavior: 'auto' });
    const pris = $('.fasit .pris');
    tellOpp(pris);
    if (pris) setTimeout(() => {
      const b = pris.getBoundingClientRect();
      window.fx?.dryss(b.left + b.width / 2, b.top + b.height / 2, { n: 34 });
      if (beregn(r).some(g => g.abs / r.prod.totalpris < 0.05)) window.fx?.konfetti(90); // under 5 % unna
    }, 350);
  }

  function tellOpp(el) {
    if (!el || reduserBevegelse) return;
    const mal = +el.dataset.tell, start = performance.now(), varighet = 1000;
    const steg = t => {
      const x = Math.min(1, (t - start) / varighet), e = 1 - Math.pow(1 - x, 3);
      el.textContent = kr(mal * e);
      if (x < 1) requestAnimationFrame(steg);
    };
    requestAnimationFrame(steg);
  }

  // ---------- Historikk og statistikk ----------
  const hentHist = () => lager.hent('historikk', []);

  /** Hver runde lagres når fasiten vises (som på PC), så avbrutte spill teller med. */
  function lagreHistorikk() {
    const runder = S.runder.filter(r => r.fasit).map(r => ({
      id: r.prod.id, navn: r.prod.navn, kategori: r.prod.kategori, bilde: (r.prod.bilder || [])[0] || '',
      butikk: r.prod.tilbud?.butikk || '', totalpris: r.prod.totalpris, hentet: r.prod.hentet,
      url: r.prod.prisjakt_url || '', gjett: beregn(r).map(({ navn, tall, abs, pst, vinner }) => ({ navn, tall, abs, pst, vinner })),
    }));
    if (!runder.length) return;
    const h = hentHist().filter(x => x.id !== S.id);
    h.unshift({ id: S.id, start: S.start, slutt: new Date().toISOString(), spillere: S.spillere, runder });
    lager.sett('historikk', h.slice(0, 500));
  }

  /** Per spiller: rundeseire, snitt og beste avvik. Spillvinner = flest rundeseire,
      minst én seier og minst to deltakere; likt antall gir delt seier (som db._spillvinnere på PC). */
  function spillSammendrag(spill) {
    const per = spill.spillere.map(s => {
      const mine = spill.runder.map(r => r.gjett.find(g => lik(g.navn, s.navn))).filter(Boolean);
      return {
        navn: s.navn, fast: s.fast, runder: mine.length,
        seire: mine.filter(g => g.vinner).length,
        snitt: mine.length ? mine.reduce((a, g) => a + g.pst, 0) / mine.length : Infinity,
        beste: mine.length ? Math.min(...mine.map(g => g.pst)) : Infinity,
        sumPst: mine.reduce((a, g) => a + g.pst, 0),
      };
    }).filter(x => x.runder);
    per.sort((a, b) => b.seire - a.seire || a.snitt - b.snitt);
    const topp = per.length ? Math.max(...per.map(x => x.seire)) : 0;
    const vinnere = per.length >= 2 && topp > 0 ? per.filter(x => x.seire === topp) : [];
    return { per, vinnere };
  }

  function toppliste() {
    const m = new Map();
    for (const spill of hentHist()) {
      const { per, vinnere } = spillSammendrag(spill);
      for (const x of per) {
        if (!x.fast) continue;
        const k = nokkel(x.navn);
        const t = m.get(k) || { navn: x.navn, spill: 0, spillseire: 0, runder: 0, rundeseire: 0, sumPst: 0, beste: Infinity };
        t.spill++; t.runder += x.runder; t.rundeseire += x.seire; t.sumPst += x.sumPst;
        t.spillseire += vinnere.some(v => lik(v.navn, x.navn)) ? 1 : 0;
        t.beste = Math.min(t.beste, x.beste);
        m.set(k, t);
      }
    }
    return [...m.values()].map(t => ({ ...t, snitt: t.sumPst / t.runder }))
      .sort((a, b) => b.spillseire - a.spillseire || b.rundeseire - a.rundeseire || a.snitt - b.snitt);
  }

  function visResultat() {
    const spill = { spillere: S.spillere, runder: S.runder.filter(r => r.fasit).map(r => ({ gjett: beregn(r), prod: r.prod })) };
    const { per, vinnere } = spillSammendrag(spill);
    const solo = S.spillere.length < 2;
    const overskrift = solo ? `${esc(per[0]?.navn || '')}: ${per[0] ? pst(per[0].snitt) : ''} unna i snitt`
      : vinnere.length > 1 ? `Uavgjort: ${esc(vinnere.map(v => v.navn).join(' og '))}`
      : vinnere.length ? `${esc(vinnere[0].navn)} vinner!` : 'Ingen vinner denne gangen';
    vis(`<div class="stabel" style="max-width:760px">
      <section class="kort seier">
        <div class="pokal" aria-hidden="true">${solo ? '🎯' : '🏆'}</div>
        <h1>${overskrift}</h1>
        <p>Sluttresultat etter ${spill.runder.length} ${spill.runder.length === 1 ? 'runde' : 'runder'}</p>
      </section>
      <section class="kort">
        <div class="tabell-ramme"><table>
          <thead><tr><th>#</th><th>Spiller</th><th>Rundeseire</th><th>Snitt avvik</th><th>Beste</th></tr></thead>
          <tbody>${per.map((x, i) => `<tr class="${vinnere.some(v => v.navn === x.navn) ? 'topp1' : ''}"><td>${i + 1}</td><td class="navn">${esc(x.navn)}${x.fast ? '' : ' <span class="dempet liten">(gjest)</span>'}</td>
            <td>${x.seire}</td><td>${pst(x.snitt)}</td><td>${pst(x.beste)}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>
      <section class="kort"><h2 style="margin-bottom:4px">Rundene</h2>
        <ul class="historikk">${spill.runder.map((r, i) => rundeLinje({ navn: r.prod.navn, bilde: (r.prod.bilder || [])[0], totalpris: r.prod.totalpris, butikk: r.prod.tilbud?.butikk, gjett: r.gjett }, i)).join('')}</ul>
      </section>
      <div class="handlinger${flereVarer() ? ' to' : ''}">
        ${flereVarer() ? '<button class="knapp hvit" data-act="en-til">+ Én runde til</button>' : ''}
        <button class="knapp" data-act="spill-igjen" id="hoved">Spill igjen <kbd>Enter</kbd></button>
      </div>
      <button class="lenke" data-act="til-oppsett" style="justify-self:center">Endre spillere eller kategorier</button>
    </div>`, '<span class="runde-merke">Resultat</span>');
    $('#hoved')?.focus({ preventScroll: true });
    if (!solo && vinnere.length) setTimeout(() => window.fx?.konfetti(160), 250);
  }

  function rundeLinje(r, i) {
    const v = r.gjett.filter(g => g.vinner).map(g => g.navn);
    return `<li class="h-runde">
      ${r.bilde ? `<img ${bildeKilde(r.bilde, '60px')} alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span></span>'}
      <div><strong>${i + 1}. ${esc(r.navn)}</strong>
        <p><span class="tall">${kr(r.totalpris)}</span>${r.butikk ? ' hos ' + esc(r.butikk) : ''}${v.length ? ' · Nærmest: ' + esc(v.join(', ')) : ''}</p>
        <p>${r.gjett.map(g => `${esc(g.navn)} ${kr(g.tall)}`).join(' · ')}</p></div></li>`;
  }

  function visStatistikk(fane) {
    const hist = hentHist();
    let innhold;
    if (fane === 'toppliste') {
      const t = toppliste();
      innhold = t.length ? `<div class="tabell-ramme"><table>
        <thead><tr><th>#</th><th>Spiller</th><th title="Spill vunnet">Spillseire</th><th title="Runder vunnet av spilt">Rundeseire</th><th>Spill</th><th>Snitt avvik</th><th>Beste treff</th></tr></thead>
        <tbody>${t.map((x, i) => `<tr class="${i === 0 ? 'topp1' : ''}"><td>${i === 0 ? '🏆' : i + 1}</td><td class="navn">${esc(x.navn)}</td><td>${x.spillseire}</td><td>${x.rundeseire} / ${x.runder}</td><td>${x.spill}</td><td>${pst(x.snitt)}</td><td>${pst(x.beste)}</td></tr>`).join('')}</tbody>
        </table></div><p class="dempet liten" style="margin:12px 0 0">Bare faste spillere. Et spill vinnes av den med flest rundeseire, og bare når minst to spiller.</p>`
        : '<div class="tom"><span class="stor-emoji">🏆</span>Ingen resultater ennå. Spill en runde, så dukker topplisten opp her.</div>';
    } else {
      innhold = hist.length ? `<ul class="historikk">${hist.map(spill => {
        const { vinnere } = spillSammendrag(spill);
        return `<li><details><summary>
          <span class="h-tittel">${spill.runder.length} ${spill.runder.length === 1 ? 'runde' : 'runder'} · ${esc(spill.spillere.map(s => s.navn).join(', '))}</span>
          <span class="dempet liten">${vinnere.length ? '🏆 ' + esc(vinnere.map(v => v.navn).join(', ')) : ''}</span>
          <span class="h-meta">${datotid(spill.start)}</span></summary>
          <ul style="padding:0;margin:0 0 8px">${spill.runder.map(rundeLinje).join('')}</ul></details></li>`;
      }).join('')}</ul>` : '<div class="tom"><span class="stor-emoji">📜</span>Ingen spill lagret ennå.</div>';
    }
    vis(`<div class="stabel" style="max-width:860px">
      <div class="rad" style="justify-content:space-between;flex-wrap:wrap">
        <h1 class="side-tittel">Statistikk</h1>
        <div class="faner" role="tablist">
          <button role="tab" aria-selected="${fane === 'toppliste'}" data-act="fane" data-fane="toppliste">Toppliste</button>
          <button role="tab" aria-selected="${fane === 'historikk'}" data-act="fane" data-fane="historikk">Historikk</button>
        </div>
      </div>
      <section class="kort">${innhold}</section>
      <p class="dempet liten" style="text-align:center;margin:0">Resultatene lagres på denne enheten.<span class="tastatur-hint" style="display:inline"> <kbd>Esc</kbd> tilbake</span></p>
    </div>`);
  }

  // ---------- Galleri ----------
  // media.pji.nu leverer bildet i den størrelsen vi ber om (aldri større enn originalen),
  // så nettleseren kan velge en skarp utgave for skjermen. cdn.pji.nu-bilder finnes bare i én størrelse.
  const BREDDER = [240, 480, 800, 1200, 1600, 2000];
  const GALLERI_SIZES = '(min-width: 1100px) 620px, (min-width: 900px) and (orientation: landscape) 56vw, 100vw';
  function bildeKilde(u, sizes) {
    if (!/^https:\/\/media\.pji\.nu\//.test(u)) return `src="${esc(u)}"`;
    const base = esc(u.split('?')[0]);
    return `src="${base}?width=800&amp;height=800" srcset="${BREDDER.map(w => `${base}?width=${w}&amp;height=${w} ${w}w`).join(', ')}" sizes="${sizes}"`;
  }

  function galleriHTML(bilder, navn, kategori, sizes = GALLERI_SIZES) {
    const merke = kategori ? `<span class="kategori-merke">${esc(kategori)}</span>` : '';
    if (!bilder.length) return `<div class="galleri"><div class="spor"><figure><span style="color:#777">Ingen bilder</span></figure></div>${merke}</div>`;
    const flere = bilder.length > 1;
    return `<div class="galleri" data-galleri>
      <div class="spor">${bilder.map((b, i) => `<figure><img ${bildeKilde(b, sizes)} data-u="${esc(b)}" alt="${esc(navn)} – bilde ${i + 1}" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async" referrerpolicy="no-referrer" data-act="lysboks" data-i="${i}"></figure>`).join('')}</div>
      <button class="forstorr" data-act="forstorr" aria-label="Vis bildene i full størrelse">${IKON.forstorr}</button>
      ${flere ? `<button class="pil v" data-act="bilde" data-d="-1" aria-label="Forrige bilde" hidden>${IKON.v}</button>
        <button class="pil h" data-act="bilde" data-d="1" aria-label="Neste bilde">${IKON.h}</button>
        <div class="prikker">${bilder.map((_, i) => `<i class="${i ? '' : 'aktiv'}"></i>`).join('')}</div>
        <span class="bildeteller tall">1/${bilder.length}</span>` : ''}
      ${merke}
    </div>`;
  }

  function kobleGalleri(g) {
    const spor = $('.spor', g);
    const oppdater = () => {
      const n = $$('figure', spor).length;
      const i = Math.round(spor.scrollLeft / Math.max(1, spor.clientWidth));
      $$('.prikker i', g).forEach((d, j) => d.classList.toggle('aktiv', j === i));
      const t = $('.bildeteller', g); if (t) t.textContent = `${Math.min(i + 1, n)}/${n}`;
      const v = $('.pil.v', g), h = $('.pil.h', g);
      if (v) v.hidden = i <= 0;
      if (h) h.hidden = i >= n - 1;
    };
    spor.addEventListener('scroll', () => requestAnimationFrame(oppdater), { passive: true });
    $$('img', spor).forEach(img => img.addEventListener('error', () => {
      // Fjern bilder som ikke laster (f.eks. utgått lenke)
      const idx = $$('figure', spor).indexOf(img.closest('figure'));
      img.closest('figure').remove();
      $$('.prikker i', g)[idx]?.remove();
      if (!$('figure', spor)) spor.innerHTML = '<figure><span style="color:#777">Bildet kunne ikke vises</span></figure>';
      if ($$('figure', spor).length <= 1) $$('.pil, .prikker, .bildeteller', g).forEach(e => e.remove());
      oppdater();
    }, { once: true }));
    g._bla = d => spor.scrollBy({ left: d * spor.clientWidth, behavior: reduserBevegelse ? 'auto' : 'smooth' });
  }

  function aapneLysboks(img) {
    const g = img.closest('[data-galleri]');
    const bilder = $$('img', g).map(i => i.dataset.u);
    const i = $$('img', g).indexOf(img);
    $('#lysboks-innhold').innerHTML = galleriHTML(bilder, img.alt.replace(/ – bilde \d+$/, ''), null, '100vw');
    const ny = $('#lysboks-innhold [data-galleri]');
    if (ny) { kobleGalleri(ny); $$('img', ny).forEach(x => { x.removeAttribute('data-act'); x.removeAttribute('loading'); }); $('.forstorr', ny)?.remove(); }
    $('#lysboks').showModal();
    const spor = $('#lysboks .spor');
    if (spor) { spor.style.scrollBehavior = 'auto'; spor.scrollLeft = i * spor.clientWidth; spor.style.scrollBehavior = ''; }
  }

  // ---------- Handlinger ----------
  const H = {
    'last-pa-nytt': () => lastData(),
    'velg-spiller': el => {
      const n = el.dataset.navn;
      const i = P.valgt.findIndex(v => lik(v.navn, n));
      if (i >= 0) P.valgt.splice(i, 1); else P.valgt.push({ navn: n, fast: true });
      lagreP(); behold(visOppsett);
    },
    'fjern-gjest': el => { P.valgt = P.valgt.filter(v => !lik(v.navn, el.dataset.navn)); lagreP(); behold(visOppsett); },
    'rediger-faste': () => { P.redigerer = !P.redigerer; behold(visOppsett); },
    'slett-fast': el => {
      const n = el.dataset.navn;
      P.faste = P.faste.filter(f => !lik(f, n));
      P.valgt = P.valgt.filter(v => !lik(v.navn, n));
      if (!P.faste.length) P.redigerer = false;
      lagreP(); behold(visOppsett); toast(`${n} er fjernet fra listen`);
    },
    antall: el => { P.antall = Math.min(20, Math.max(1, P.antall + +el.dataset.d)); lagreP(); $('.stepper output').textContent = P.antall; },
    kategori: el => {
      const k = el.dataset.kat, valgt = new Set(valgteKategorier());
      valgt.has(k) ? valgt.delete(k) : valgt.add(k);
      P.kategorier = [...valgt]; lagreP(); behold(visOppsett);
    },
    gruppe: el => {
      const slugs = Object.keys(DATA.grupper[el.dataset.gruppe]).filter(k => PER_KAT[k]?.length);
      const valgt = new Set(valgteKategorier());
      const alle = slugs.every(k => valgt.has(k));
      slugs.forEach(k => alle ? valgt.delete(k) : valgt.add(k));
      P.kategorier = [...valgt]; lagreP(); behold(visOppsett);
    },
    'alle-kat': () => {
      const alle = valgteKategorier().length === alleKategorier().length;
      P.kategorier = alle ? [] : alleKategorier(); lagreP(); behold(visOppsett);
    },
    start: () => startSpill(),
    fortsett: () => gaa('spill'),
    avslutt: () => { if (S?.runder.some(r => r.fasit)) lagreHistorikk(); S = null; lager.fjern('spill'); behold(visOppsett); toast('Spillet er avsluttet'); },
    'vis-tall': el => {
      P.vis = !P.vis; lager.sett('vis-tall', P.vis);
      const inp = $('#gjett-inp'); inp.classList.toggle('skjult', !P.vis);
      el.setAttribute('aria-pressed', P.vis); el.setAttribute('aria-label', P.vis ? 'Skjul tallene' : 'Vis tallene');
      el.innerHTML = P.vis ? IKON.oye : IKON.lukketOye; inp.focus();
    },
    angre: () => { aktiv().gjett.pop(); lagreS(); tegnPanel(true); },
    fasit: () => visFasitNa(),
    neste: () => {
      if (nyRunde()) { visRunde(); scrollTo(0, 0); return; }
      S.antall = S.runder.length; H.ferdig();   // tomt for varer: avslutt i stedet for å bli stående fast
    },
    'en-til': () => {
      // En runde som ikke er avslørt ennå: fortsett den i stedet for å legge til en ny
      if (S.runder.length && !aktiv().fasit) { S.ferdig = false; lagreS(); gaa('spill'); return; }
      if (!nyRunde()) return;                       // nyRunde gir selv beskjed når varene er brukt opp
      S.antall = Math.max(S.antall, S.runder.length); S.ferdig = false; lagreS();
      if (location.hash === '#/spill') visRunde(); else gaa('spill');
      scrollTo(0, 0);
    },
    ferdig: () => { S.ferdig = true; lagreS(); lagreHistorikk(); gaa('resultat'); },
    'spill-igjen': () => { P.valgt = S.spillere.map(s => ({ ...s })); lagreP(); startSpill(); },
    'til-oppsett': () => gaa(''),
    fane: el => { history.replaceState(null, '', '#/statistikk' + (el.dataset.fane === 'historikk' ? '/historikk' : '')); visStatistikk(el.dataset.fane); },
    bilde: el => el.closest('[data-galleri]')._bla(+el.dataset.d),
    lysboks: el => aapneLysboks(el),
    forstorr: el => {
      const spor = $('.spor', el.closest('[data-galleri]'));
      const imgs = $$('img', spor), i = Math.round(spor.scrollLeft / Math.max(1, spor.clientWidth));
      if (imgs[i] || imgs[0]) aapneLysboks(imgs[i] || imgs[0]);
    },
    'lukk-lysboks': () => $('#lysboks').close(),
    'lukk-ios-hint': el => { lager.sett('ios-hint-lukket', true); el.closest('.melding').remove(); },
    tema: () => visTemavelger(),
    'lukk-tema': () => $('#temavelger').close(),
    'velg-tema': el => { velgTema(el.dataset.id); $('#temavelger').close(); },
  };

  // Gjengi på nytt uten å miste rulleposisjon og åpne kategorigrupper
  function behold(fn) {
    const y = scrollY;
    const apne = $$('.kategorigruppe').map(d => d.open);
    fn();
    $$('.kategorigruppe').forEach((d, i) => { if (apne[i] != null) d.open = apne[i]; });
    $('#skjerm').firstElementChild?.classList.remove('inn');
    scrollTo(0, y);
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const f = H[el.dataset.act];
    if (f) { e.preventDefault(); f(el, e); }
  });

  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.dataset.form;
    if (f === 'gjett') gjett($('#gjett-inp').value);
    if (f === 'ny-spiller') leggTilSpiller($('#ny-spiller').value);
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'gjest') { P.gjest = e.target.checked; const i = $('#ny-spiller'); i.placeholder = P.gjest ? 'Navn på gjest' : 'Nytt navn'; i.focus(); }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'gjett-inp') { const f = $('#gjett-feil'); if (f) f.hidden = true; }
  });

  // ---------- Temaer (Hallmark) ----------
  function visTemavelger() {
    const T = window.TEMAER;
    if (!T) return;
    T.lastAlleFonter();
    const naa = T.hent();
    $('#temaliste').innerHTML = T.LISTE.map(t => `<button class="temavalg" role="radio" aria-checked="${t.id === naa}" tabindex="${t.id === naa ? 0 : -1}" data-act="velg-tema" data-id="${t.id}">
        <span class="tema-prov" data-tema="${t.id}" aria-hidden="true">
          <span class="tema-prov-tittel">Gjett prisen!</span>
          <span class="tema-prov-rad"><span class="tema-prov-knapp">Lås inn</span><span class="tema-prov-pris">1 299 kr</span></span>
          <span class="tema-prov-kort"></span>
        </span>
        <span class="tema-navn">${esc(t.navn)}</span><span class="tema-beskr">${esc(t.beskr)}</span>
      </button>`).join('');
    const d = $('#temavelger');
    if (!d.open) d.showModal();
    $('#temaliste [aria-checked="true"]')?.focus();
  }
  function velgTema(id) {
    window.TEMAER?.bruk(id, true);
    $$('#temaliste .temavalg').forEach(b => { const v = b.dataset.id === id; b.setAttribute('aria-checked', v); b.tabIndex = v ? 0 : -1; });
  }

  // ---------- Tastatur ----------
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if ($('#lysboks').open) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { $('#lysboks [data-galleri]')?._bla(e.key === 'ArrowLeft' ? -1 : 1); e.preventDefault(); }
      return; // Esc lukker dialogen av seg selv
    }
    if ($('#temavelger').open) {
      // Piltaster bytter tema med en gang (forhåndsvisning bak dialogen), Enter/Esc lukker
      const valg = $$('#temaliste .temavalg');
      const i = valg.findIndex(b => b.getAttribute('aria-checked') === 'true');
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (d && valg.length) {
        const ny = valg[(i + d + valg.length) % valg.length];
        velgTema(ny.dataset.id); ny.focus(); e.preventDefault();
      }
      return;
    }
    if (e.target.matches('input, textarea, select')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    const g = $('#skjerm [data-galleri]');
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && g?._bla) { g._bla(e.key === 'ArrowLeft' ? -1 : 1); e.preventDefault(); return; }
    if (e.key === 'Enter' && !e.target.closest('button, a, summary, label')) {
      const k = $('#hoved') || $('[data-act="start"]:not([disabled])');
      if (k) { k.click(); e.preventDefault(); }
      return;
    }
    if (/^[0-9]$/.test(e.key)) { $('#gjett-inp')?.focus(); return; }         // begynn å skrive tallet direkte
    if (e.key === 'n' || e.key === 'N') { $('#ny-spiller')?.focus(); e.preventDefault(); return; }
    if (e.key === 'f' || e.key === 'F') { $('[data-act="fortsett"]')?.click(); return; }
    if (e.key === 't' || e.key === 'T') { gaa('statistikk'); return; }
    if (e.key === 'u' || e.key === 'U') { visTemavelger(); e.preventDefault(); return; }
    if (e.key === 'Escape') {
      const h = location.hash;
      if (h.includes('statistikk') || h.includes('resultat')) history.length > 1 ? history.back() : gaa('');
    }
  });

  // ---------- Installasjon og offline ----------
  let installHendelse = null;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installHendelse = e;
    $('#installer').hidden = false;
  });
  $('#installer').addEventListener('click', async () => {
    if (!installHendelse) return;
    installHendelse.prompt();
    await installHendelse.userChoice.catch(() => null);
    installHendelse = null; $('#installer').hidden = true;
  });
  addEventListener('appinstalled', () => { $('#installer').hidden = true; toast('Prisgjett er installert'); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline-støtte er valgfritt */ }));
  }

  // Krok for automatiske tester
  window.__prisgjett = { get S() { return S; }, get P() { return P; }, get DATA() { return DATA; }, tallFra, beregn: r => beregn(r), spillSammendrag };

  lastData();
})();
