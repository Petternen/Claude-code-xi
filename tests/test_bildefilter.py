"""Tester av bilderyddingen uten bildemodell (oppløsning, rekkefølge og at minst ett bilde beholdes)."""
import os
import sys
import unittest

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


if __name__ == "__main__":
    unittest.main()
