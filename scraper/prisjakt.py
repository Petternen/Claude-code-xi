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
    "Skjønnhet og hudpleie": {
        "parfymer": "Parfyme", "ansiktskrem": "Ansiktskrem", "ansiktsserum": "Ansiktsserum",
        "renseprodukter-for-ansikt": "Ansiktsrens", "mascara": "Mascara", "foundation": "Foundation",
        "leppestift": "Leppestift", "neglelakk": "Neglelakk", "solkrem": "Solkrem",
        "bodylotion": "Bodylotion", "harkurer": "Hårkur",
    },
    "Mote og tilbehør": {
        "handvesker-og-skuldervesker": "Vesker", "smykker": "Smykker", "kjoler": "Kjoler",
        "boots-skoletter-stovletter": "Boots og skoletter", "sko-med-hael": "Sko med hæl",
        "sandaler": "Sandaler", "lommeboker-og-kortholdere": "Lommebøker", "weekendbag-treningsbag": "Weekendbager",
        "pysjamas": "Pysjamas", "morgenkaper": "Morgenkåper",
    },
    "Hjem og kjøkken": {
        "robotstovsugere": "Robotstøvsugere", "stovsugere": "Støvsugere", "kaffetraktere": "Kaffetraktere",
        "espressomaskiner": "Espressomaskiner", "kjoleskap": "Kjøleskap", "vaskemaskiner": "Vaskemaskiner",
        "oppvaskmaskiner": "Oppvaskmaskiner", "torketromler": "Tørketromler",
        "mikrobolgeovner": "Mikrobølgeovner", "komfyrer": "Komfyrer", "kjokkenmaskiner": "Kjøkkenmaskiner",
        "vannkokere": "Vannkokere", "luftrensere": "Luftrensere", "varmeovner": "Varmeovner",
        "skrivebord": "Skrivebord", "airfryers-og-frityrgryter": "Airfryere", "iskremmaskiner": "Iskremmaskiner",
    },
    "Interiør og hobby": {
        "stearinlys-og-duftlys": "Duftlys", "vaser": "Vaser", "lysestaker-og-lyslykter": "Lysestaker og lyslykter",
        "bordlamper": "Bordlamper", "sengetoy": "Sengetøy", "puter": "Puter", "symaskiner": "Symaskiner",
        "trad-og-garn": "Garn", "yoga-tilbehor": "Yogautstyr",
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
    "Elektronikk og teknikk": {
        "mobiltelefoner": "Mobiltelefoner", "tv": "TV", "hodetelefoner": "Hodetelefoner",
        "smartklokker": "Smartklokker", "nettbrett": "Nettbrett", "spillkonsoller": "Spillkonsoller",
        "pc-skjermer": "PC-skjermer", "projektorer": "Projektorer", "platespillere": "Platespillere",
        "3d-printere": "3D-printere", "droner": "Droner", "gamingstoler": "Gamingstoler",
        "mikrofoner": "Mikrofoner", "vr-briller": "VR-briller",
    },
}
# Kategorier som kan velges, men som ikke er valgt når appen åpnes første gang
STANDARD_AV = set(GRUPPER["Elektronikk og teknikk"])
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


_GALLERI = re.compile(r'"productName":("(?:[^"\\]|\\.)*"),"imageUrls":')


def _galleri(data, pid, html=""):
    """Produktets eget bildegalleri, slik Prisjakt viser det øverst på produktsiden:
    "productName":"…","imageUrls":[{"url":…,"isPrimaryImage":…}].
    Resten av siden har bilder av andre varianter (farger) og andre produkter, så de brukes ikke.
    Bilder fra media.pji.nu lagres uten størrelsesparametere; appen ber om riktig størrelse selv."""
    for m in _GALLERI.finditer(data):
        try:
            liste, _ = json.JSONDecoder().raw_decode(data, m.end())
        except ValueError:
            continue
        if not isinstance(liste, list):
            continue
        liste = sorted((x for x in liste if isinstance(x, dict)), key=lambda x: not x.get("isPrimaryImage"))
        urls = []
        for x in liste:
            u = x.get("url")
            if not isinstance(u, str) or not re.match(r"https://(?:media|cdn)\.pji\.nu/", u) or "/g/" in u:
                continue  # /g/ er butikklogoer og App Store-/Google Play-merker
            if "media.pji.nu" in u:
                u = u.split("?")[0]
            if u not in urls:
                urls.append(u)
        if urls:
            return urls
    # Reserve hvis siden endrer form: bare produktets egne standardbilder (samme produkt-id)
    funnet = re.findall(r"https://cdn\.pji\.nu/product/(standard|front|back|right|left)/\d+/%d\.jpg" % pid, html + data)
    return list(dict.fromkeys("https://cdn.pji.nu/product/%s/800/%d.jpg" % (v, pid) for v in funnet))


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
    bilder = _galleri(data, pid, html)
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
    r"\s*[-–|:]\s*[^-–|]*?(?:\bfra\s+)?\d[\d\s .,]*\s*(?:kr\b|,-|nok\b).*$"
    r"|\s*[-–|:]\s*[^-–|]*?\b(?:kr|nok)\.?\s*\d.*$"
    r"|\s*[-–|]\s*(?:black\s*friday|cyber\s*monday|tilbud|salg|kampanje|rabatt)\b.*$"
    r"|\s+(?:fra\s+)?\d[\d\s .,]*\s*(?:kr|,-)\s*$"
    r"|\s+(?:kr|nok)\.?\s*\d[\d\s.,]*(?:,-)?\s*$",
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
