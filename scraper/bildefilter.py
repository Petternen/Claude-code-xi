"""Rydder i produktgalleriene: fjerner reklame, infografikk, tegninger, utmerkelser, dårlige og doble bilder.

Bruker en bildemodell (SigLIP2 via OpenCLIP) som sammenligner hvert bilde med korte beskrivelser,
f.eks. «a product photo of a washing machine» mot «an infographic with text» eller «a technical drawing
with dimensions». Modellen kjører lokalt og gratis, uten API-nøkkel.

Krever  pip install torch torchvision open_clip_torch  (CPU-utgaven holder). Uten disse pakkene
brukes bare de enkle sjekkene (oppløsning og dubletter), og hele galleriet beholdes ellers.
"""
import io
import sys
import urllib.request

from PIL import Image

MODELL = ("ViT-B-16-SigLIP2-256", "webli")
MIN_SIDE = 400          # lengste side i piksler; mindre bilder er for uskarpe på mobil
MARGIN = -0.02          # fjern når beste «dårlig»-treff er minst så nær beste «godt» treff.
                        # Målt mot 245 håndmerkede bilder: fanget 18 av 21 dårlige, fjernet 0 av 213 gode.
DUBLETT = 0.98          # bildelikhet (cosinus) som regnes som samme bilde (fargevarianter ligger lavere)
MAKS_BILDER = 8

# Engelske navn gir modellen mye bedre treff enn norske
KATEGORI_EN = {
    "mobiltelefoner": "a mobile phone", "tv": "a television", "hodetelefoner": "headphones",
    "smartklokker": "a smartwatch", "nettbrett": "a tablet computer", "spillkonsoller": "a game console",
    "pc-skjermer": "a computer monitor", "projektorer": "a projector", "droner": "a drone",
    "vr-briller": "a VR headset", "mikrofoner": "a microphone", "platespillere": "a record player",
    "3d-printere": "a 3D printer", "gamingstoler": "a gaming chair", "robotstovsugere": "a robot vacuum cleaner",
    "stovsugere": "a vacuum cleaner", "kaffetraktere": "a coffee maker", "espressomaskiner": "an espresso machine",
    "kjoleskap": "a refrigerator", "vaskemaskiner": "a washing machine", "oppvaskmaskiner": "a dishwasher",
    "torketromler": "a tumble dryer", "mikrobolgeovner": "a microwave oven", "komfyrer": "a kitchen stove",
    "kjokkenmaskiner": "a kitchen mixer", "vannkokere": "an electric kettle", "luftrensere": "an air purifier",
    "varmeovner": "a heater", "skrivebord": "a desk", "elsykler": "an electric bicycle", "lopesko": "running shoes",
    "sykkelhjelmer": "a bicycle helmet", "telt": "a tent", "ryggsekker": "a backpack", "klokker": "a wristwatch",
    "solbriller": "sunglasses", "lommelykter": "a flashlight", "gressklippere": "a lawn mower",
    "barnevogner": "a baby stroller", "bilseter": "a child car seat", "brettspill": "a board game",
    "lego": "a LEGO set", "elektriske-tannborster": "an electric toothbrush", "barbermaskiner": "an electric shaver",
}

GOD = [
    "a product photo of {k} on a white background",
    "a photo of {k}",
    "a close-up photo of a detail of {k}",
    "a photo of a person using {k}",
    "a photo of {k} in a home",
    "a photo of the box and packaging of {k}",
    "several color variants of {k}",
    "the back side of {k}",
    "a product photo of {k} on a black background",
    "an open {k} showing the inside",
]
DARLIG = [
    "an infographic with text, icons and arrows",
    "a page of text",
    "a marketing poster with a large headline slogan",
    "an advertisement with a wild animal",
    "an award badge with stars",
    "a quality seal or certificate logo",
    "a technical drawing with dimensions and measurements",
    "a size chart",
    "a comparison table",
    "a grid of app icons",
    "an energy efficiency label",
    "a company logo",
    "a blank white image",
    "a collage of colorful logos of streaming apps like Netflix and YouTube",
    "a list of product features with small icons and text",
    "a spec sheet with technical specifications",
    "a product image with a text caption about what is included in the box",
    "an image with several lines of small text",
    "a line drawing of a product with arrows and numbers showing its size in cm",
]


def _logg(*a):
    print(*a, file=sys.stderr, flush=True)


class Bildefilter:
    def __init__(self, modell=MODELL, margin=MARGIN, bruk_modell=True):
        self.margin = margin
        self.modell = None
        if not bruk_modell:
            return
        try:
            import open_clip
            import torch
        except ImportError:
            _logg("Bildefilter: torch/open_clip mangler – bruker bare oppløsning og dubletter.")
            return
        torch.set_num_threads(max(1, torch.get_num_threads()))
        self.torch = torch
        self.modell, _, self.prep = open_clip.create_model_and_transforms(modell[0], pretrained=modell[1])
        self.modell.eval()
        self.tok = open_clip.get_tokenizer(modell[0])
        self._tekst = {}

    @property
    def aktiv(self):
        return self.modell is not None

    def _tekstfunksjoner(self, kategori):
        if kategori not in self._tekst:
            k = KATEGORI_EN.get(kategori, "a product")
            setninger = [s.format(k=k) for s in GOD + DARLIG]
            with self.torch.no_grad():
                t = self.modell.encode_text(self.tok(setninger))
            self._tekst[kategori] = t / t.norm(dim=-1, keepdim=True)
        return self._tekst[kategori]

    def vurder(self, bilder, kategori):
        """bilder: liste av PIL-bilder. Gir (margin per bilde, beste «dårlig»-beskrivelse, bildevektorer).
        Margin = likhet med beste «dårlig»-beskrivelse minus likhet med beste «god»-beskrivelse."""
        if not self.aktiv or not bilder:
            return [-1.0] * len(bilder), [""] * len(bilder), None
        with self.torch.no_grad():
            f = self.modell.encode_image(self.torch.stack([self.prep(b) for b in bilder]))
            f = f / f.norm(dim=-1, keepdim=True)
            lik = f @ self._tekstfunksjoner(kategori).T
        ng = len(GOD)
        margin = (lik[:, ng:].max(dim=1).values - lik[:, :ng].max(dim=1).values).tolist()
        hvilken = [DARLIG[i].format(k="…") for i in lik[:, ng:].argmax(dim=1).tolist()]
        return margin, hvilken, f

    def rydd(self, urls, kategori, hent):
        """Velger ut gode bilder i galleriets rekkefølge. `hent(url)` gir et PIL-bilde i analysestørrelse
        (største side inntil 800 px) eller None. Returnerer (beholdte url-er, rapport)."""
        lastet = [(u, b) for u, b in ((u, hent(u)) for u in urls) if b is not None]
        if not lastet:
            return [], []
        bilder = [b for _, b in lastet]
        darlig, hvilken, vektorer = self.vurder(bilder, kategori)
        rapport, beholdt = [], []
        for i, (u, b) in enumerate(lastet):
            grunn = None
            if max(b.size) < MIN_SIDE:
                grunn = "lav oppløsning %dx%d" % b.size
            elif darlig[i] > self.margin:
                grunn = "%s (%+.3f)" % (hvilken[i], darlig[i])
            elif vektorer is not None:
                for j in beholdt:
                    if float(vektorer[i] @ vektorer[j]) > DUBLETT:
                        grunn = "dublett av bilde %d" % j
                        if max(b.size) > max(lastet[j][1].size):  # behold den skarpeste
                            beholdt.remove(j)
                            rapport[j] = (lastet[j][0], "dublett av bilde %d (lavere oppløsning)" % i)
                            grunn = None
                        break
            rapport.append((u, grunn))
            if grunn is None:
                beholdt.append(i)
        if not beholdt:  # behold alltid minst ett: det minst dårlige med god nok oppløsning
            kandidater = [i for i, (_, b) in enumerate(lastet) if max(b.size) >= MIN_SIDE] or list(range(len(lastet)))
            beste = min(kandidater, key=lambda i: darlig[i])
            beholdt = [beste]
            rapport[beste] = (lastet[beste][0], None)
        beholdt.sort()
        return [lastet[i][0] for i in beholdt][:MAKS_BILDER], rapport


def analyse_url(url):
    """Mindre utgave av bildet til analysen (media.pji.nu skalerer etter parametere)."""
    if "media.pji.nu" in url:
        return url.split("?")[0] + "?width=800&height=800"
    return url


def hent_bilde(url, ua, timeout=20):
    try:
        req = urllib.request.Request(analyse_url(url), headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return Image.open(io.BytesIO(r.read())).convert("RGB")
    except Exception:
        return None
