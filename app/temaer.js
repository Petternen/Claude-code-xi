/* Temaer: settes på <html> før siden tegnes, så det ikke blinker. Skrifttypene lastes bare for temaet som brukes. */
'use strict';
window.TEMAER = (() => {
  const LISTE = [
    { id: 'stjerne', navn: 'Stjernehimmel', beskr: 'Standard: lilla himmel og runde 3D-knapper', farge: '#8f72ff', fonter: [] },
    { id: 'carnival', navn: 'Carnival', beskr: 'Plakat i sennep og okseblod, hard blekkskygge', farge: '#ffddca',
      fonter: ['https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=Golos+Text:wght@400;500;700&display=swap'] },
    { id: 'hum', navn: 'Hum', beskr: 'Kremgult papir med korn og kartongknapper', farge: '#f7f5ec',
      fonter: ['https://api.fontshare.com/v2/css?f[]=chillax@500,600&display=swap'] },
    { id: 'ultraviolet', navn: 'Ultraviolet', beskr: 'Lavendel og én fiolett, alt i små bokstaver', farge: '#f0ecfa',
      fonter: ['https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;800&family=Onest:wght@400;500;700&display=swap'] },
    { id: 'riso', navn: 'Riso', beskr: 'Risograf i blått og rosa, aldri svart', farge: '#f8f5ed',
      fonter: ['https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,800&display=swap',
        'https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,500;7..72,700&display=swap'] },
    { id: 'squeeze', navn: 'Squeeze', beskr: 'Markedsbod i skoggrønt og fersken', farge: '#075930',
      fonter: ['https://fonts.googleapis.com/css2?family=Gabarito:wght@700;800&family=Manrope:wght@500;700;800&display=swap'] },
  ];
  const finn = id => LISTE.find(t => t.id === id) || LISTE[0];
  const hent = () => { try { return finn(JSON.parse(localStorage.getItem('pg_tema'))).id; } catch { return 'stjerne'; } };
  function lastFonter(t) {
    for (const u of t.fonter) {
      if ([...document.querySelectorAll('link[data-tema-font]')].some(l => l.href === u)) continue;
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = u; l.dataset.temaFont = t.id;
      document.head.appendChild(l);
    }
  }
  function bruk(id, lagre) {
    const t = finn(id), html = document.documentElement;
    if (t.id === 'stjerne') delete html.dataset.tema; else html.dataset.tema = t.id;
    lastFonter(t);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.farge);
    if (lagre) { try { localStorage.setItem('pg_tema', JSON.stringify(t.id)); } catch { /* privat modus */ } }
    return t;
  }
  bruk(hent(), false);
  return { LISTE, hent, bruk, lastAlleFonter: () => LISTE.forEach(lastFonter) };
})();
