"""Enhetstester for henting fra Prisjakt – uten nett (fast HTML i stedet for ekte sider)."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scraper"))
import prisjakt  # noqa: E402


def tilbud(pris, frakt=0, **ekstra):
    r = {
        "condition": "New", "stockStatus": "InStock", "priceType": "RegularPrice",
        "price": {"amount": pris}, "originalPrice": {"amount": pris},
        "promotion": "$undefined", "deal": None,
        "shipping": {"nodes": [{"price": {"amount": frakt}, "deliveryMethod": "Hjem", "carrier": "Posten",
                                "deliveryDays": {"min": 1, "max": 3}}]},
        "shop": {"name": "Butikk %d" % pris}, "name": "Vare - Black Friday: fra 3 924 kr",
        "clickoutUrl": "/go-to-shop/1", "shopUserReviews": {"score": 4.2},
    }
    r.update(ekstra)
    return r


class BesteTilbud(unittest.TestCase):
    def test_ett_ufullstendig_tilbud_feller_ikke_produktet(self):
        # PC-versjonen krasjet på shipping="$undefined" og hoppet over hele varen
        rader = [tilbud(1000), tilbud(900, shipping="$undefined"), tilbud(1100, originalPrice="$undefined"), "$undefined"]
        t = prisjakt._beste_tilbud(rader)
        self.assertIsNotNone(t)
        self.assertIn(t["pris"], (1000, 1100))

    def test_bare_nye_ordinaere_tilbud_paa_lager(self):
        rader = [
            tilbud(500, condition="Used"), tilbud(600, stockStatus="OutOfStock"),
            tilbud(700, priceType="Campaign"), tilbud(800, originalPrice={"amount": 999}),
            tilbud(850, promotion={"text": "-20 %"}), tilbud(1200),
        ]
        self.assertEqual(prisjakt._beste_tilbud(rader)["pris"], 1200)

    def test_velger_en_tredjedel_opp_med_frakt(self):
        rader = [tilbud(p, frakt=f) for p, f in [(1000, 0), (950, 100), (1200, 0), (1300, 0), (1400, 0), (1500, 0)]]
        t = prisjakt._beste_tilbud(rader)
        # sortert på totalpris: 1000, 1050, 1200, 1300, 1400, 1500 → indeks 6 // 3 = 2
        self.assertEqual(t["pris"] + t["frakt"], 1200)
        self.assertEqual(t["leveringsdager"], {"min": 1, "max": 3})

    def test_ingen_gyldige(self):
        self.assertIsNone(prisjakt._beste_tilbud([tilbud(100, shipping={"nodes": []})]))


class Navn(unittest.TestCase):
    def test_pris_og_kampanje_fjernes(self):
        for inn, ut in [
            ("Sennheiser Momentum 5 trådløs over-ear hodetelefoner - Black Friday: fra 3 924 kr", "Sennheiser Momentum 5 trådløs over-ear hodetelefoner"),
            ("iPhone 15 128GB - fra 7 990 kr", "iPhone 15 128GB"),
            ("Sony WH-1000XM5 - Black Friday", "Sony WH-1000XM5"),
            ("Samsung Galaxy S24 Ultra 256GB", "Samsung Galaxy S24 Ultra 256GB"),
            ('Dell 27" skjerm 4K 1 299,-', 'Dell 27" skjerm 4K'),
        ]:
            self.assertEqual(prisjakt._uten_pris(inn), ut)

    def test_ferdig_rydder_ogsaa_tilbudsnavn(self):
        res = {"navn": "TrÃ¥dlÃ¸s hodetelefon - Tilbud", "tilbud": {"tilbudsnavn": "Hodetelefon - fra 999 kr"}}
        prisjakt.ferdig(res, "hodetelefoner")
        self.assertEqual(res["navn"], "Trådløs hodetelefon")
        self.assertEqual(res["tilbud"]["tilbudsnavn"], "Hodetelefon")
        self.assertEqual(res["kategori"], "hodetelefoner")


def side(nyttelast_obj, ekstra_html=""):
    """Lager en produktside slik Prisjakt leverer den: Next.js-data i self.__next_f.push."""
    nyttelast = json.dumps(nyttelast_obj, separators=(",", ":"))  # kompakt som hos Prisjakt
    return ('<meta property="og:title" content="Testvare 3000 - Prisjakt">'
            '<script>self.__next_f.push([1,%s])</script>' % json.dumps(nyttelast)) + ekstra_html


class HentProdukt(unittest.TestCase):
    def setUp(self):
        self._get = prisjakt._get

    def tearDown(self):
        prisjakt._get = self._get

    def test_bare_produktets_eget_galleri(self):
        # Siden har også bilder av andre varianter og andre produkter – de skal ikke med
        html = side({
            "offerRows": [tilbud(2000, frakt=49)],
            "variants": [{"image": "https://media.pji.nu/annen-farge.webp"}],
            "galleri": {"productName": "Testvare 3000", "imageUrls": [
                {"url": "https://media.pji.nu/detalj.webp?width=800&height=800", "isPrimaryImage": False},
                {"url": "https://cdn.pji.nu/product/standard/800/123.jpg", "isPrimaryImage": True},
                {"url": "https://cdn.pji.nu/g/ftg_logos/sizes/176/1/16091.png", "isPrimaryImage": False},
                {"url": "https://media.pji.nu/detalj.webp", "isPrimaryImage": False},
            ]},
            "lignende": [{"imageUrl": "https://media.pji.nu/annet-produkt.webp"}],
        }, '<img src="https://cdn.pji.nu/g/webapp/app_store/no.png">')
        prisjakt._get = lambda url, ttl=600: html
        p = prisjakt.hent_produkt(123)
        self.assertEqual(p["navn"], "Testvare 3000")
        # hovedbildet først, uten logoer, uten størrelsesparametere, uten dubletter
        self.assertEqual(p["bilder"], ["https://cdn.pji.nu/product/standard/800/123.jpg", "https://media.pji.nu/detalj.webp"])
        self.assertEqual(p["totalpris"], 2049)
        self.assertTrue(p["inkl_mva"])
        self.assertRegex(p["hentet"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$")

    def test_reserve_uten_galleri_tar_bare_egne_bilder(self):
        html = side({"offerRows": [tilbud(2000)]},
                    '<img src="https://cdn.pji.nu/product/front/280/123.jpg">'
                    '<img src="https://cdn.pji.nu/product/standard/280/999.jpg">'
                    '<img src="https://media.pji.nu/annet-produkt.webp">')
        prisjakt._get = lambda url, ttl=600: html
        self.assertEqual(prisjakt.hent_produkt(123)["bilder"], ["https://cdn.pji.nu/product/front/800/123.jpg"])


if __name__ == "__main__":
    unittest.main()
