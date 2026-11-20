/* Konfetti og stjernedryss på ett lerret over hele skjermen (etter Stjerneskolen). */
'use strict';
window.fx = (() => {
  const cv = document.getElementById('fx');
  const g = cv.getContext('2d');
  const FARGER = ['#ffd23f', '#ff7ab6', '#7ee8fa', '#a98bff', '#5ef2a8', '#ff9f43', '#ffffff'];
  const redusert = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const velg = a => a[Math.floor(Math.random() * a.length)];
  let deler = [], kjorer = false, dpr = 1;

  function storrelse() {
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  }
  storrelse();
  addEventListener('resize', storrelse);

  function stjerne(r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }

  function sloyfe() {
    if (kjorer) return;
    kjorer = true;
    const steg = () => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, innerWidth, innerHeight);
      deler = deler.filter(p => p.liv > 0 && p.y < innerHeight + 40);
      for (const p of deler) {
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.tyngde; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.liv--;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.globalAlpha = Math.min(1, p.liv / 30); g.fillStyle = p.farge;
        if (p.type === 'stjerne') stjerne(p.str / 2);
        else if (p.type === 'prikk') { g.beginPath(); g.arc(0, 0, p.str / 3, 0, 7); g.fill(); }
        else g.fillRect(-p.str / 2, -p.str / 4, p.str, p.str / 2);
        g.restore();
      }
      if (deler.length) requestAnimationFrame(steg);
      else { kjorer = false; g.clearRect(0, 0, innerWidth, innerHeight); }
    };
    requestAnimationFrame(steg);
  }

  function dryss(x, y, { n = 30, fart = 9, str = 12 } = {}) {
    if (redusert) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = fart * (0.35 + Math.random() * 0.75);
      deler.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, tyngde: 0.14, drag: 0.96, rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.3, str: str * (0.5 + Math.random() * 0.7), farge: velg(FARGER),
        type: velg(['stjerne', 'stjerne', 'prikk']), liv: 70 + Math.random() * 30 });
    }
    sloyfe();
  }

  function konfetti(n = 140) {
    if (redusert) n = 30;
    for (let i = 0; i < n; i++) {
      deler.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4, vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 3, tyngde: 0.05, drag: 0.99, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
        str: 8 + Math.random() * 8, farge: velg(FARGER), type: Math.random() < 0.3 ? 'stjerne' : 'rekt', liv: 220 });
    }
    sloyfe();
  }

  // Stjernehimmel i bakgrunnen
  const sky = document.querySelector('.sky');
  if (sky) for (let i = 0; i < 18; i++) {
    const s = document.createElement('i');
    s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;--s:${0.6 + Math.random() * 1.6};animation-delay:${-Math.random() * 3.2}s`;
    sky.appendChild(s);
  }

  return { dryss, konfetti };
})();
