"""Henting av produkter og tilbud fra Prisjakt.no (kun stdlib).

Portert fra PC-versjonen av Prisgjett. Samme utvalgsregler: ny vare, på lager,
ordinær pris uten rabatt/kampanje, totalpris = varepris + billigste frakt, inkl. mva.
Endringer: tidsstempel i ISO-format, kategori som slug og pris-/kampanjetekst
fjernes også fra butikkens tilbudsnavn.
"""
import html as _html
import json
import random
import re
import time
import urllib.request
from datetime import datetime, timezone

BASE = "https://www.prisjakt.no"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

GRUPPER = {
    "Elektronikk": {
        "mobiltelefoner": "Mobiltelefoner", "tv": "TV", "hodetelefoner": "Hodetelefoner",
        "smartklokker": "Smartklokker", "nettbrett": "Nettbrett", "spillkonsoller": "Spillkonsoller",
        "pc-skjermer": "PC-skjermer", "projektorer": "Projektorer", "droner": "Droner",
        "vr-briller": "VR-briller", "mikrofoner": "Mikrofoner", "platespillere": "Platespillere",
        "3d-printere": "3D-printere", "gamingstoler": "Gamingstoler",
    },
    "Hjem og kjøkken": {
        "robotstovsugere": "Robotstøvsugere", "stovsugere": "Støvsugere", "kaffetraktere": "Kaffetraktere",
        "espressomaskiner": "Espressomaskiner", "kjoleskap": "Kjøleskap", "vaskemaskiner": "Vaskemaskiner",
        "oppvaskmaskiner": "Oppvaskmaskiner", "torketromler": "Tørketromler",
        "mikrobolgeovner": "Mikrobølgeovner", "komfyrer": "Komfyrer", "kjokkenmaskiner": "Kjøkkenmaskiner",
        "vannkokere": "Vannkokere", "luftrensere": "Luftrensere", "varmeovner": "Varmeovner",
        "skrivebord": "Skrivebord",
    },
    "Sport og friluft": {
        "elsykler": "Elsykler", "lopesko": "Løpesko", "sykkelhjelmer": "Sykkelhjelmer",
        "telt": "Telt", "ryggsekker": "Ryggsekker", "klokker": "Klokker", "solbriller": "Solbriller",
        "lommelykter": "Lommelykter",
    },
    "Hage, barn og fritid": {
        "gressklippere": "Gressklippere", "barnevogner": "Barnevogner", "bilseter": "Bilseter",
        "brettspill": "Brettspill", "lego": "LEGO",
    },
    "Personlig pleie": {
        "elektriske-tannborster": "Elektriske tannbørster", "barbermaskiner": "Barbermaskiner",
    },
}
KATEGORIER = {s: n for g in GRUPPER.values() for s, n in g.items()}

_cache = {}


def _get(url, ttl=600):
    hit = _cache.get(url)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "nb-NO,nb;q=0.9"})
    with urllib.request.urlopen(req, timeout=25) as r:
        html = r.read().decode("utf-8", "replace")
    _cache[url] = (time.time(), html)
    return html


def _payload(html):
    """Setter sammen Next.js-dataene (self.__next_f.push) til én tekststreng."""
    parts = []
    for m in re.finditer(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html):
        try:
            parts.append(json.loads(m.group(1)))
        except ValueError:
            pass
    return "".join(parts)


def _json_after(text, key):
    """Alle JSON-verdier som står rett etter  "key": ."""
    out, dec, pos = [], json.JSONDecoder(), 0
    needle = '"%s":' % key
    while True:
        i = text.find(needle, pos)
        if i < 0:
            return out
        j = i + len(needle)
        try:
            val, end = dec.raw_decode(text, j)
            out.append(val)
            pos = end
        except ValueError:
            pos = j


def hent_produktliste(slug):
    html = _get("%s/c/%s" % (BASE, slug))
    produkter, sett = [], set()
    for blob in (html, _payload(html)):
        for m in re.finditer(r'\{"id":(\d+),"pathName":"(/product\.php\?p=\d+)","name":"([^"]+)"', blob):
            pid = int(m.group(1))
            if pid in sett:
                continue
            seg = blob[m.start():m.start() + 700]
            pm = re.search(r'"priceSummary":\{"regular":(\d+)[^}]*?"count":(\d+)', seg)
            if not pm or int(pm.group(2)) < 3:
                continue
            sett.add(pid)
            produkter.append({"id": pid, "navn": _html.unescape(m.group(3))})
    return produkter


def _fiks(s):
    """Reparerer tekst som er UTF-8 lest som Latin-1 (f.eks. «TrÃ¥dlÃ¸s»)."""
    if s and ("Ã" in s or "Â" in s):
        try:
            return s.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return s


def _dager(d):
    if isinstance(d, dict) and isinstance(d.get("min"), int) and isinstance(d.get("max"), int):
        return d
    return None


def _ren(v):
    return "" if v in (None, "Unknown", "$undefined") else v


def _d(v):
    """Prisjakt bruker strengen "$undefined" der et felt mangler – behandle alt som ikke er dict som tomt."""
    return v if isinstance(v, dict) else {}


def _beste_tilbud(rader):
    """Nytt, på lager, ordinær pris (ingen rabatt/kampanje). Velger tilbudet en tredjedel opp i
    listen sortert på totalpris inkl. frakt – et reelt midt-tilbud, ikke bunnprisen."""
    kandidater = []
    for r in rader:
        if not isinstance(r, dict):
            continue
        try:
            if r.get("condition") != "New":
                continue
            if r.get("stockStatus") != "InStock":
                continue
            if r.get("priceType") != "RegularPrice":
                continue
            pris = r["price"]["amount"]
            ordinaer = _d(r.get("originalPrice")).get("amount", pris)
            if ordinaer != pris or r.get("promotion") not in (None, "$undefined") \
                    or r.get("deal") not in (None, "$undefined"):
                continue
            frakt_noder = [n for n in (_d(r.get("shipping")).get("nodes") or []) if isinstance(n, dict)]
            if not frakt_noder:
                continue
            f = min(frakt_noder, key=lambda n: n["price"]["amount"])
            kandidater.append({
                "butikk": r["shop"]["name"],
                "pris": pris,
                "frakt": f["price"]["amount"],
                "fraktmetode": _ren(f.get("deliveryMethod")),
                "transportor": _ren(f.get("carrier")),
                "leveringsdager": _dager(f.get("deliveryDays")),
                "tilbudsnavn": _fiks(r.get("name")),
                "url": BASE + r["clickoutUrl"].split(BASE)[-1] if r.get("clickoutUrl") else None,
                "butikkvurdering": _d(r.get("shopUserReviews")).get("score"),
            })
        except (KeyError, TypeError, AttributeError, ValueError):
            continue  # ett ufullstendig tilbud skal ikke felle hele produktet
    if not kandidater:
        return None
    # velg et reelt, mid-tilbud i stedet for kun laveste, ellers blir svaret alltid «bunnpris»
    kandidater.sort(key=lambda k: k["pris"] + k["frakt"])
    return kandidater[min(len(kandidater) - 1, len(kandidater) // 3)]


def hent_produkt(pid):
    html = _get("%s/product.php?p=%d" % (BASE, pid), ttl=120)
    data = _payload(html)
    rader = []
    for v in _json_after(data, "offerRows"):
        if isinstance(v, list):
            rader += v
    tilbud = _beste_tilbud(rader)
    if not tilbud:
        return None

    navn = None
    m = re.search(r'<meta property="og:title" content="([^"]+)"', html)
    if m:
        navn = _html.unescape(re.sub(r"\s*[-|–]\s*(Prisjakt|Sammenlign).*$", "", m.group(1)).strip())
    bilder = []
    for u in re.findall(r'https://(?:media|cdn)\.pji\.nu/[^"\\ ]+?\.(?:jpg|png|webp)', html + data):
        if "/product/" in u:
            if "/standard/800/" not in u and "/front/" not in u and "/back/" not in u \
                    and "/right/" not in u and "/left/" not in u:
                continue
            u = re.sub(r"/(standard|front|back|right|left)/\d+/", r"/\1/800/", u)
        elif "/g/" in u:
            continue  # butikklogoer og App Store-/Google Play-merker, ikke produktbilder
        if u not in bilder:
            bilder.append(u)
    bilder = bilder[:8]
    if not bilder:
        return None
    nu = datetime.now(timezone.utc).astimezone()
    return {
        "id": pid,
        "navn": navn,
        "bilder": bilder,
        "prisjakt_url": "%s/product.php?p=%d" % (BASE, pid),
        "tilbud": tilbud,
        "totalpris": tilbud["pris"] + tilbud["frakt"],
        "hentet": nu.isoformat(timespec="seconds"),
        "inkl_mva": True,
        "valuta": "NOK",
    }


_PRIS_I_NAVN = re.compile(
    r"\s*[-–|:]\s*[^-–|]*?(?:\bfra\s+)?\d[\d\s .,]*\s*(?:kr|,-|nok)\b.*$"
    r"|\s*[-–|]\s*(?:black\s*friday|cyber\s*monday|tilbud|salg|kampanje|rabatt)\b.*$"
    r"|\s+(?:fra\s+)?\d[\d\s .,]*\s*(?:kr|,-)\s*$",
    re.I)


def _uten_pris(navn):
    """Fjerner pris og kampanjetekst fra tittelen, så tittelen ikke røper fasiten."""
    ren = _PRIS_I_NAVN.sub("", navn or "").strip(" -–|:")
    return ren or navn


def ferdig(res, slug, listenavn=None):
    """Rydder navn og tilbudsnavn så ingen av dem røper prisen, og setter kategori."""
    res["navn"] = _uten_pris(_fiks(res["navn"] or listenavn))
    if res["tilbud"].get("tilbudsnavn"):
        res["tilbud"]["tilbudsnavn"] = _uten_pris(res["tilbud"]["tilbudsnavn"])
    res["kategori"] = slug
    return res


def tilfeldig_produkt(slug, utelat=()):
    if slug not in KATEGORIER:
        raise ValueError("ukjent kategori")
    liste = [p for p in hent_produktliste(slug) if p["id"] not in utelat]
    random.shuffle(liste)
    for p in liste[:12]:
        try:
            res = hent_produkt(p["id"])
        except Exception:
            continue
        if res:
            ferdig(res, slug, p["navn"])
            return res
    raise RuntimeError("Fant ikke noe produkt med ordinær pris og lagerstatus akkurat nå. Prøv igjen.")


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    p = tilfeldig_produkt("mobiltelefoner")
    print(json.dumps(p, ensure_ascii=False, indent=2))
