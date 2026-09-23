# EDGE — parkour

First-person parkour hra v štýle Mirror's Edge. Čistá biela low-poly mapa,
minimalistické UI, dôraz na pohyb a rýchlosť. Celé v jednom HTML súbore
([`parkour.html`](parkour.html)) — beží priamo v prehliadači, bez inštalácie.

## Spustenie

Dvojklik na `parkour.html`, alebo cez lokálny server:

```bash
python3 -m http.server 8777
# potom otvor http://localhost:8777/parkour.html
```

Klikni do plochy (zamkne myš, spustí zvuk) a bež.

## Ovládanie

| Klávesa | Akcia |
|---|---|
| **WASD** | pohyb |
| **SHIFT** | šprint |
| **SPACE** | skok · double jump · wall-jump |
| **SHIFT + CTRL / C** | slide (Fortnite štýl) |
| **W k okraju** | climb / mantle hore |
| **stena + smer** | wall-run |
| **M** | hudba zap/vyp |
| **R** | respawn na checkpoint |

## Čo je vnútri (technicky)

- **Three.js** (r128, cez CDN) — render, low-poly geometria, tiene.
- **Momentum movement engine** (Quake/Source štýl) — akcelerácia + trenie,
  air-strafe, wall-run, wall-jump, double jump, buffered slide, mantle.
- **Custom shadery** cez `onBeforeCompile` — fresnel rim + fake AO, aby biele
  plochy nesplývali s bielym pozadím (a súčasne fungujú reálne tiene).
- **Viewmodel** — blokové ruky a nohy (Minecraft štýl) s walk/run cyklom.
- **Procedurálny zvuk** (Web Audio API) — kroky, skok, dopad, slide, mantle +
  drum & bass hudba (174 BPM, breakbeat + sub/reese bass). Žiadne audio súbory.

## Ladenie

Konštanty pohybu sú pohromade v objekte `P` (gravitácia, rýchlosti, sila skoku,
slide boost, dĺžka mantle...). Sila shaderu je v `applyRimShader` (`_ao`, `_fres`).
