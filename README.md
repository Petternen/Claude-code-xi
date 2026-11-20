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
2. Velg **kategorier** (44 i 5 grupper) og **antall runder** (standard 1, kan utvides underveis).
3. Hver spiller skriver inn sitt gjett etter tur. Tallene er skjult som standard («Ikke la de andre se skjermen»). Øyet viser dem.
4. **Vis riktig pris:** fasit, rangering, avvik i kroner og prosent. Den som er nærmest vinner runden. Er to like nær, deler de seieren.
5. **Resultat:** flest rundeseire vinner spillet. Likt antall gir uavgjort.

Under hvert produkt står de samme vilkårene som på PC: butikk, inkl. 25 % mva, frakt (beløp, metode, transportør, leveringstid), ordinær pris uten rabatt/kampanje/kupong, ny vare på lager, når prisen ble hentet og hva tilbudet gjelder.

## Mobil/nettbrett sammenlignet med PC-versjonen
| | PC-versjonen | Mobil og nettbrett |
|---|---|---|
| Priser | Hentes live fra Prisjakt for hver runde | Hentes fra Prisjakt hver morgen (436 varer), med tidspunkt per vare |
| Utvalgsregler | Ny, på lager, ordinær pris, tilbud ⅓ opp fra billigste, inkl. frakt og mva | Samme |
| Spillere | Faste brukere (felles database) + gjester | Faste spillere per enhet + gjester |
| Statistikk | Toppliste og historikk på serveren | Toppliste og historikk på enheten |
| Flere enheter samtidig (rom) | Ja | Nei, én skjerm som sendes rundt |
| Trenger server | Ja (PC eller firmaserver) | Nei, GitHub Pages |

## Tastatur (nettbrett med tastatur / PC)
| Skjerm | Taster |
|---|---|
| Oppsett | `N` nytt navn, `Enter` start, `F` fortsett pågående spill, `T` statistikk |
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
npm run data                  # hent nye priser til app/data/produkter.json (ca. 2–3 min)
npm install && npx playwright install chromium   # første gang
npm test                      # Python-tester + nettlesertester (ca. 1 min)
```

| Mappe | Innhold |
|---|---|
| `app/` | Selve appen: `index.html`, `app.js`, `app.css`, `fx.js` (konfetti), `sw.js` (offline), `manifest.webmanifest`, `ikoner/`, `data/produkter.json` |
| `scraper/` | `prisjakt.py` (portert fra PC-versjonen) og `bygg_data.py` som lager datasettet |
| `tests/` | `test_prisjakt.py` (uten nett), `e2e/` nettlesertester på iPhone SE, iPhone 13, Android, iPad stående/liggende og PC |

## Rettet i forhold til PC-versjonen
- **Tilbud uten fraktinfo felte hele varen.** Prisjakt skriver `"$undefined"` når et felt mangler. Ett slikt tilbud krasjet `_beste_tilbud`, og varen ble hoppet over i stillhet. Nå hoppes bare det ene tilbudet over. Samme retting bør inn i `prisjakt.py` på PC.
- **Butikklogoer og App Store-/Google Play-merker** ble med i bildegalleriet. De filtreres nå bort.
- **Tilbudsnavnet** («Tilbudet gjelder») renses for pris og kampanjetekst, som produktnavnet.

## Kjente begrensninger
- Prisjakt har ikke åpent API. Hentingen leser produktsidene deres og kan slutte å virke hvis sidene endres. Bruksvilkårene deres bør sjekkes før appen deles bredt. Hentingen skjer én gang i døgnet, med pause mellom forespørslene.
- Prisene er fra morgenen samme dag. Tidspunktet står ved hver vare, og fasiten lenker til tilbudet og Prisjakt for å sjekke dagens pris.
- Faste spillere og statistikk ligger i nettleseren på hver enhet og deles ikke mellom enheter.
