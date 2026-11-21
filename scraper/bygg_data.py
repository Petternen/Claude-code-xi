"""Bygger app/data/produkter.json: et ferskt utvalg varer med priser fra Prisjakt.no.

Appen på mobil og nettbrett kan ikke hente fra Prisjakt direkte (nettleseren blokkerer det),
så dette skriptet kjøres jevnlig av GitHub Actions og legger resultatet ved siden av appen.

  python3 scraper/bygg_data.py                      # alle kategorier, 10 varer i hver
  python3 scraper/bygg_data.py --kategorier tv,lego --per-kategori 2 --ut /tmp/test.json

Kategorier som ikke gir noe denne gangen, beholder varene fra forrige datasett (med sitt
opprinnelige «hentet»-tidspunkt), så appen aldri mister en kategori på grunn av et midlertidig brudd.
"""
import argparse
import json
import os
import random
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bildefilter  # noqa: E402
import prisjakt  # noqa: E402

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STANDARD_UT = os.path.join(ROT, "app", "data", "produkter.json")


def logg(*a):
    print(*a, file=sys.stderr, flush=True)


def hent_kategori(slug, antall, forsok, pause):
    """Henter opptil `antall` gyldige varer fra én kategori."""
    try:
        liste = prisjakt.hent_produktliste(slug)
    except Exception as e:  # nettverk, 404 osv.
        logg(f"  {slug}: produktlisten feilet ({e})")
        return slug, []
    random.shuffle(liste)
    ut = []
    for p in liste[:forsok]:
        if len(ut) >= antall:
            break
        try:
            res = prisjakt.hent_produkt(p["id"])
        except Exception as e:
            logg(f"  {slug}: {p['id']} feilet ({e})")
            res = None
        time.sleep(pause)
        if res:
            ut.append(prisjakt.ferdig(res, slug, p["navn"]))
    logg(f"  {slug}: {len(ut)} varer (av {len(liste)} i listen)")
    return slug, ut


def rydd_bilder(produkter, trader=8):
    """Fjerner reklame, infografikk, tegninger, utmerkelser, dårlige og doble bilder fra galleriene."""
    if bildefilter.Image is None:
        logg("Bildefilter: Pillow mangler – bildene beholdes som de er.")
        return
    start = time.time()
    filt = bildefilter.Bildefilter()
    for_, etter, grunner = 0, 0, {}
    with ThreadPoolExecutor(max_workers=trader) as ex:
        for i, p in enumerate(produkter):
            urls = p["bilder"]
            lastet = dict(zip(urls, ex.map(lambda u: bildefilter.hent_bilde(u, prisjakt.UA), urls)))
            beholdt, rapport = filt.rydd(urls, p["kategori"], lastet.get)
            if beholdt:  # tomt betyr at ingen bilder lot seg laste – behold da det vi hadde
                p["bilder"] = beholdt
            else:
                p["bilder"] = urls[:bildefilter.MAKS_BILDER]
            for_ += len(urls)
            etter += len(p["bilder"])
            for _, grunn in rapport:
                if grunn:
                    k = grunn.split(" (")[0]
                    grunner[k] = grunner.get(k, 0) + 1
            if (i + 1) % 50 == 0:
                logg(f"  bilder: {i + 1}/{len(produkter)} varer")
    logg(f"Bildefilter ({'modell' if filt.aktiv else 'bare oppløsning'}) på {time.time() - start:.0f} s: "
         f"{for_} bilder inn, {etter} beholdt")
    for k, n in sorted(grunner.items(), key=lambda x: -x[1]):
        logg(f"  fjernet {n:4d}: {k}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ut", default=STANDARD_UT)
    ap.add_argument("--kategorier", help="kommaseparert liste med slugs (standard: alle)")
    ap.add_argument("--per-kategori", type=int, default=10)
    ap.add_argument("--forsok", type=int, default=20, help="maks varer å prøve per kategori")
    ap.add_argument("--trader", type=int, default=4, help="parallelle kategorier")
    ap.add_argument("--pause", type=float, default=0.4, help="sekunder mellom forespørsler per tråd")
    ap.add_argument("--min-varer", type=int, default=50, help="avbryt uten å skrive hvis færre totalt")
    ap.add_argument("--behold-fra", default=None, help="forrige datasett (standard: --ut hvis den finnes)")
    ap.add_argument("--uten-bildefilter", action="store_true", help="hopp over bildemodellen (bare for rask testing)")
    a = ap.parse_args()

    slugs = a.kategorier.split(",") if a.kategorier else list(prisjakt.KATEGORIER)
    ukjent = [s for s in slugs if s not in prisjakt.KATEGORIER]
    if ukjent:
        ap.error("ukjente kategorier: " + ", ".join(ukjent))

    forrige = {}
    kilde = a.behold_fra or a.ut
    if os.path.exists(kilde):
        try:
            with open(kilde, encoding="utf-8") as f:
                for p in json.load(f).get("produkter", []):
                    forrige.setdefault(p["kategori"], []).append(p)
        except (ValueError, OSError, KeyError) as e:
            logg(f"Kunne ikke lese forrige datasett ({e}) – fortsetter uten")

    logg(f"Henter {len(slugs)} kategorier, {a.per_kategori} varer i hver …")
    start = time.time()
    with ThreadPoolExecutor(max_workers=max(1, a.trader)) as ex:
        resultat = dict(ex.map(lambda s: hent_kategori(s, a.per_kategori, a.forsok, a.pause), slugs))

    if not a.uten_bildefilter:
        rydd_bilder([p for liste in resultat.values() for p in liste])

    produkter, ferske, beholdt = [], 0, []
    for slug in prisjakt.KATEGORIER:  # fast rekkefølge
        if slug in resultat and resultat[slug]:
            produkter += resultat[slug]
            ferske += len(resultat[slug])
        elif forrige.get(slug):
            produkter += forrige[slug]
            beholdt.append(slug)

    logg(f"Ferdig på {time.time() - start:.0f} s: {ferske} ferske varer, beholdt {len(beholdt)} kategorier fra forrige datasett"
         + (f" ({', '.join(beholdt)})" if beholdt else ""))
    if ferske < min(a.min_varer, a.per_kategori * len(slugs)):
        logg(f"For få ferske varer ({ferske}) – skriver ikke nytt datasett.")
        return 2

    data = {
        "versjon": 1,
        "generert": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "kilde": "Prisjakt.no",
        "regler": "Ny vare, på lager, ordinær pris uten rabatt eller kampanje. Totalpris = varepris + billigste frakt, inkl. 25 % mva.",
        "grupper": prisjakt.GRUPPER,
        "standard_av": sorted(prisjakt.STANDARD_AV),
        "produkter": produkter,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.ut)), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(a.ut)), suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, a.ut)
    os.chmod(a.ut, 0o644)
    logg(f"Skrev {len(produkter)} varer til {a.ut}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
