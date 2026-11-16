# Calculator hulp

Een Chrome-extensie die naast de calculatie op deatabix.nl een paneel toont met
de stucloper- en wandoppervlakte, de parkeeruren en een correctie-check.

## Installeren

1. Download de nieuwste versie: ga naar **Releases** (rechts op deze pagina) en
   klik bij de bovenste versie op `calculator-hulp-<versie>.zip`.
2. Pak de zip uit naar een vaste plek, bijvoorbeeld je map Documenten. Laat de
   map daar staan: Chrome laadt de extensie elke keer uit die map.
3. Open in Chrome de pagina `chrome://extensions`.
4. Zet rechtsboven **Ontwikkelaarsmodus** aan.
5. Klik op **Uitgepakte extensie laden** en kies de uitgepakte map (de map waar
   `manifest.json` in staat).
6. Open een calculatie op deatabix.nl: het paneel verschijnt vanzelf.

Werkt ook in Microsoft Edge, via `edge://extensions`.

Heb je al een andere versie van de Calculator hulp geïnstalleerd? Verwijder die
dan eerst, anders staan er twee panelen.

## Bijwerken

**Op een Mac, automatisch:** open Terminal (via Spotlight: Cmd + spatie, typ
"Terminal"), plak deze regel en druk op Enter:

```
curl -fsSL https://raw.githubusercontent.com/robinsmets/calculator-hulp/main/update-mac.sh | bash
```

De eerste keer vraagt hij om de map van de extensie: sleep die map in het
Terminal-venster en druk op Enter. Daarna onthoudt hij de map. Hij zet ook een icoon
"Calculator hulp bijwerken" op je bureaublad: de volgende keer is bijwerken
dubbelklikken op dat icoon. Hij haalt de
nieuwste versie op en vervangt de bestanden in die map. Klik daarna in
`chrome://extensions` bij de extensie op het rondje (opnieuw laden).

**Op Windows, automatisch:** open PowerShell (Start-menu, typ "PowerShell"),
plak deze regel en druk op Enter:

```
irm https://raw.githubusercontent.com/robinsmets/calculator-hulp/main/update-windows.ps1 | iex
```

De eerste keer opent er een venster om de map van de extensie te kiezen; daarna
onthoudt hij de map. Hij zet ook een icoon
"Calculator hulp bijwerken" op je bureaublad: de volgende keer is bijwerken
dubbelklikken op dat icoon. Klik daarna in `chrome://extensions` bij de extensie op het
rondje (opnieuw laden).

**Met de hand:** download de nieuwe zip en vervang de bestanden in je
extensiemap door die uit de zip. Klik daarna in `chrome://extensions` op
opnieuw laden. Het versienummer staat in het extensie-venster (klik op het
icoon in de werkbalk).

Controleer altijd zelf voordat je iets overneemt.
