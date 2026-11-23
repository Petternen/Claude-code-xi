"""Tester av bilderyddingen uten bildemodell (oppløsning, rekkefølge og at minst ett bilde beholdes)."""
import os
import sys
import types
import unittest
from unittest import mock

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scraper"))
import bildefilter  # noqa: E402


def UtenModell():
    return bildefilter.Bildefilter(bruk_modell=False)  # tester reglene uten å laste modellen


class Rydd(unittest.TestCase):
    def test_lav_opplosning_fjernes_rekkefolgen_beholdes(self):
        bilder = {"a": Image.new("RGB", (800, 600)), "b": Image.new("RGB", (300, 200)), "c": Image.new("RGB", (600, 600))}
        beholdt, rapport = UtenModell().rydd(["a", "b", "c"], "tv", bilder.get)
        self.assertEqual(beholdt, ["a", "c"])
        self.assertIn("lav oppløsning", dict(rapport)["b"])

    def test_minst_ett_bilde_beholdes(self):
        bilder = {"a": Image.new("RGB", (200, 200)), "b": Image.new("RGB", (300, 300))}
        beholdt, _ = UtenModell().rydd(["a", "b"], "tv", bilder.get)
        self.assertEqual(len(beholdt), 1)

    def test_bilder_som_ikke_laster_hoppes_over(self):
        beholdt, _ = UtenModell().rydd(["a", "b"], "tv", {"b": Image.new("RGB", (800, 800))}.get)
        self.assertEqual(beholdt, ["b"])

    def test_alle_kategorier_har_engelsk_navn(self):
        sys.path.insert(0, os.path.dirname(bildefilter.__file__))
        import prisjakt
        self.assertEqual(set(prisjakt.KATEGORIER) - set(bildefilter.KATEGORI_EN), set())

    def test_analyse_ber_om_mindre_bilde(self):
        self.assertEqual(bildefilter.analyse_url("https://media.pji.nu/x.webp"), "https://media.pji.nu/x.webp?width=800&height=800")
        self.assertEqual(bildefilter.analyse_url("https://cdn.pji.nu/product/standard/800/1.jpg"), "https://cdn.pji.nu/product/standard/800/1.jpg")


class ModellFeiler(unittest.TestCase):
    """Kan ikke modellen lastes (f.eks. Hugging Face nede), skal prishentingen fortsette med de enkle sjekkene."""

    def test_bildefilter_faller_tilbake_til_opplosning(self):
        torch = types.SimpleNamespace(get_num_threads=lambda: 2, set_num_threads=lambda n: None)
        def feil(*a, **k):
            raise OSError("We couldn't connect to 'https://huggingface.co'")
        open_clip = types.SimpleNamespace(create_model_and_transforms=feil, get_tokenizer=feil)
        with mock.patch.dict(sys.modules, {"torch": torch, "open_clip": open_clip}):
            filt = bildefilter.Bildefilter()
        self.assertFalse(filt.aktiv)
        bilder = {"a": Image.new("RGB", (800, 800)), "b": Image.new("RGB", (200, 200))}
        self.assertEqual(filt.rydd(["a", "b"], "tv", bilder.get)[0], ["a"])

    def test_en_vare_som_feiler_stopper_ikke_ryddingen(self):
        import bygg_data

        class Feiler:
            aktiv = False

            def rydd(self, urls, kategori, hent):
                if kategori == "tv":
                    raise RuntimeError("ødelagt bilde")
                return urls[:1], [(u, None) for u in urls]

        produkter = [{"id": 1, "kategori": "tv", "bilder": ["a", "b"]}, {"id": 2, "kategori": "lego", "bilder": ["c", "d"]}]
        with mock.patch.object(bildefilter, "Bildefilter", Feiler), \
                mock.patch.object(bildefilter, "hent_bilde", lambda u, ua: None):
            bygg_data.rydd_bilder(produkter, trader=1)
        self.assertEqual(produkter[0]["bilder"], ["a", "b"], "varen som feilet beholder bildene")
        self.assertEqual(produkter[1]["bilder"], ["c"], "de andre ryddes som vanlig")


if __name__ == "__main__":
    unittest.main()
