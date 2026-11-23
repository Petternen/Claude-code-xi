# 🏷️ Prisgjett – mobil og nettbrett

Gjett prisen på ekte varer fra norske nettbutikker. Nærmest totalpris vinner runden.
Mobil- og nettbrettversjon av Prisgjett-appen på PC, med samme regler og prisvilkår.
Utseendet bygger på Stjerneskolen (`claude-code-x`). Appen er en ren web-app (PWA): ingen bygging, den virker offline og kan installeres på telefon og nettbrett.

**Appen:** https://petternen.github.io/Claude-code-xi/ (når GitHub Pages er slått på, se under)

## Installer på telefon eller nettbrett
- **iPhone / iPad:** åpne lenken i Safari → **Del** → **Legg til på Hjem-skjerm**.
- **Android:** åpne lenken i Chrome → **Installer app** (eller nedlastingsknappen øverst i appen).

Etter første åpning virker appen også uten nett. Da brukes prisene den hentet sist.

## Slik spiller dere
1. **Hvem spiller?** Skriv navn og trykk `Enter`. Faste spillere huskes på enheten. Huk av **Gjest** for folk som ikke skal med i topplisten.
2. Velg **kategorier** (76 i 8 grupper) og **antall runder** (standard 1, kan utvides underveis).
   Gruppene er Skjønnhet og hudpleie, Mote og tilbehør, Hjem og kjøkken, Interiør og hobby, Sport og friluft, Hage, barn og fritid, Personlig pleie og Elektronikk og teknikk.
   **Elektronikk og teknikk** (mobil, TV, hodetelefoner, droner, 3D-printere osv.) er ikke valgt som standard. Trykk på kategoriene eller **Velg alle** for å ta dem med.
3. Hver spiller skriver inn sitt gjett etter tur. Tallene er skjult som standard («Ikke la de andre se skjermen»). Øyet viser dem.
4. **Vis riktig pris:** fasit, rangering, avvik i kroner og prosent. Den som er nærmest vinner runden. Er to like nær, deler de seieren.
5. **Resultat:** flest rundeseire vinner spillet. Likt antall gir uavgjort.

Under hvert produkt står de samme vilkårene som på PC: butikk, inkl. 25 % mva, frakt (beløp, metode, transportør, leveringstid), ordinær pris uten rabatt/kampanje/kupong, ny vare på lager, når prisen ble hentet og hva tilbudet gjelder.

## Utseende (temaer)
Trykk på paletten øverst (eller `U`) for å bytte utseende. Valget huskes på enheten.

| Tema | Stil |
|---|---|
| **Stjernehimmel** (standard) | Lilla himmel, runde 3D-knapper (fra Stjerneskolen) |
| **Carnival** | Skjermtrykt plakat: Big Shoulders-versaler, sennep og okseblod, hard blekkskygge |
| **Hum** | Kremgult papir med korn, avrundet Chillax, kartongknapper som trykkes ned |
| **Ultraviolet** | Lavendel og én fiolett, Outfit i små bokstaver, piller |
| **Riso** | Risograf i to trommer: blått skriver, rosa fyller, aldri svart |
| **Squeeze** | Markedsbod i skoggrønt, Gabarito, ferskenfargede knapper |

De fem siste er hentet fra [Hallmark](https://github.com/Nutlope/hallmark) (MIT-lisens): farger (OKLCH), skrifttyper, radius, skygger og knappestil er tatt fra temafilene. Temaene ligger i `app/temaer.css`, og `app/temaer.js` setter temaet før siden tegnes og laster bare skrifttypene til temaet som brukes. Alle temaene er testet for kontrast (WCAG 4,5:1, 3:1 for stor tekst) gjennom et helt spill.

## Bilder
- **Bare produktets eget galleri.** Bildene hentes fra galleriet øverst på Prisjakt-siden (`imageUrls`), ikke fra resten av siden, der det også ligger bilder av andre farger og andre produkter.
- **Skarpe bilder.** Bilder fra `media.pji.nu` hentes i den størrelsen skjermen trenger (240–2000 px), og fullskjerm (forstørr-knappen eller trykk på bildet) får den største. Bilder fra `cdn.pji.nu` finnes bare i én størrelse (maks 800 px).
- **Bildefilter** (`scraper/bildefilter.py`). En bildemodell (SigLIP2, kjører lokalt og gratis) fjerner reklame, infografikk, sammenligningstabeller, måltegninger, utmerkelser og app-logoer. Doble bilder og bilder under 400 px fjernes også. Hver vare beholder alltid minst ett bilde.
  - Målt mot 442 håndmerkede bilder fra 92 varer: fanget 42 av 53 dårlige (79 %), fjernet 4 av 369 gode (1 %). Beskrivelsene er delvis justert mot de samme bildene, så tallene er litt optimistiske.
  - Det som slipper gjennom er mest mørke reklamebilder med liten tekst der produktet også vises. De gode som forsvinner er oftest esker med mye trykk (LEGO, brettspill).
  - Sammenlignet med ViT-B-32, ViT-L-14 og en variant med produktnavnet som beskrivelse. Alle var dårligere.

## Mobil/nettbrett sammenlignet med PC-versjonen
| | PC-versjonen | Mobil og nettbrett |
|---|---|---|
| Priser | Hentes live fra Prisjakt for hver runde | Hentes fra Prisjakt hver morgen (ca. 750 varer), med tidspunkt per vare |
| Utvalgsregler | Ny, på lager, ordinær pris, tilbud ⅓ opp fra billigste, inkl. frakt og mva | Samme |
| Spillere | Faste brukere (felles database) + gjester | Faste spillere per enhet + gjester |
| Statistikk | Toppliste og historikk på serveren | Toppliste og historikk på enheten |
| Flere enheter samtidig (rom) | Ja | Nei, én skjerm som sendes rundt |
| Trenger server | Ja (PC eller firmaserver) | Nei, GitHub Pages |

## Tastatur (nettbrett med tastatur / PC)
| Skjerm | Taster |
|---|---|
| Oppsett | `N` nytt navn, `Enter` start, `F` fortsett pågående spill, `T` statistikk, `U` utseende |
| Utseende | `←`/`→` bytter tema med en gang, `Enter` eller `Esc` lukker |
| Gjetting | `0–9` begynner å skrive, `Enter` lås inn, `←`/`→` bilder, `Esc` ut av feltet |
| Fasit | `Enter` neste runde / se resultat |
| Resultat | `Enter` spill igjen |
| Statistikk | `Esc` tilbake |

## Publisering (én gang)
1. Repo → **Settings → Pages → Source: GitHub Actions**.
2. Merge til `main`. Workflowen `.github/workflows/pages.yml` henter ferske priser og publiserer mappen `app/`.

Prisene oppdateres hver morgen kl. 05:17 (vintertid) og når noe i `app/` eller `scraper/` endres på `main`.
Du kan også kjøre **Actions → Publiser til GitHub Pages → Run workflow** for nye priser med en gang.
Hvis hentingen feiler, publiseres forrige datasett, og kategorier som feiler beholder gårsdagens varer.
GitHub stopper planlagte kjøringer i repoer uten aktivitet på 60 dager. Da må workflowen slås på igjen under Actions.

## Utvikling
```sh
npm start                     # appen på http://localhost:8000
npm run data                  # hent nye priser og rydd bildene (ca. 10 min, se under)
# Bildefilteret trenger (én gang):
#   pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0 torchvision==0.29.2
#   pip install -r scraper/krav-bildefilter.txt
npm install && npx playwright install chromium   # første gang
npm test                      # Python-tester + nettlesertester (ca. 1 min)
```

| Mappe | Innhold |
|---|---|
| `app/` | Selve appen: `index.html`, `app.js`, `app.css`, `temaer.css` og `temaer.js` (utseende), `fx.js` (konfetti), `sw.js` (offline), `manifest.webmanifest`, `ikoner/`, `data/produkter.json` |
| `scraper/` | `prisjakt.py` (portert fra PC-versjonen), `bildefilter.py` (rydder bildene) og `bygg_data.py` som lager datasettet |
| `tests/` | `test_prisjakt.py` (uten nett), `e2e/` nettlesertester på iPhone SE, iPhone 13, Android, iPad stående/liggende og PC |

## Rettet i forhold til PC-versjonen
- **Tilbud uten fraktinfo felte hele varen.** Prisjakt skriver `"$undefined"` når et felt mangler. Ett slikt tilbud krasjet `_beste_tilbud`, og varen ble hoppet over i stillhet. Nå hoppes bare det ene tilbudet over. Samme retting bør inn i `prisjakt.py` på PC.
- **Feil bilder i galleriet.** PC-versjonen samler alle bildeadresser på siden. Da kommer butikklogoer, App Store-/Google Play-merker, andre farger og andre produkter med. Her brukes bare produktets eget galleri.
- **Tilbudsnavnet** («Tilbudet gjelder») renses for pris og kampanjetekst, som produktnavnet.

## Kjente begrensninger
- Prisjakt har ikke åpent API. Hentingen leser produktsidene deres og kan slutte å virke hvis sidene endres. Bruksvilkårene deres bør sjekkes før appen deles bredt. Hentingen skjer én gang i døgnet, med pause mellom forespørslene.
- Prisene er fra morgenen samme dag. Tidspunktet står ved hver vare, og fasiten lenker til tilbudet og Prisjakt for å sjekke dagens pris.
- Faste spillere og statistikk ligger i nettleseren på hver enhet og deles ikke mellom enheter.
