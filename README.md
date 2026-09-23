# EDGE — parkour FPS

First-person parkour hra v štýle Mirror's Edge, kombinovaná so streľbou.
Čistá biela low-poly mapa, minimalistické UI, dôraz na pohyb, rýchlosť a
streľbu v pohybe (wall-run, slide, vzduch). Beží priamo v prehliadači,
bez inštalácie a bez build kroku.

## Spustenie

Dvojklik na `index.html`, alebo cez lokálny server:

```bash
python3 -m http.server 8777
# potom otvor http://localhost:8777/
```

V menu vyber mapu, klikni **HRAŤ** (zamkne myš, spustí zvuk). `ESC` = pauza.

## Mapy

| Mapa | Popis |
|---|---|
| **PARKOUR** | Trať na čas s checkpointmi. Každý zostrelený terč = **−1 s** z výsledného času. Best time sa ukladá pre každú mapu zvlášť. |
| **ARÉNA** | Testovacia mapa so stenami — wall-run koridor, dlhá stena, pilier na wall-jump, mantle bloky, schody, strelnica a pohyblivé terče, ktoré sa po 3 s obnovia. Bez cieľa. |

## Zbrane

| Zbraň | Režim | Poškodenie | Zásobník | Poznámka |
|---|---|---|---|---|
| **PISTOĽ** (1) | poloautomat | 55 (×2 do stredu) | 12 | presná, zásah do červeného stredu terč zničí jednou ranou |
| **SAMOPAL** (2) | automat | 17 (×1.6 do stredu) | 30 | rýchla kadencia, väčší rozptyl a „bloom“ pri dlhej dávke |

Hitscan streľba, rozptyl sa zväčšuje pri behu a vo vzduchu. **Počas wall-runu
a slidu je presnosť lepšia** (bonus za plynulý pohyb). Zameriavač ukazuje
aktuálny rozptyl. Recoil, záblesk, stopovky, diery po guľkách, hitmarker.

## Ovládanie

| Klávesa | Akcia |
|---|---|
| **WASD** | pohyb |
| **SHIFT** | šprint |
| **SPACE** | skok · double jump · wall-jump |
| **SHIFT + CTRL / C** | slide (Fortnite štýl) |
| **W k okraju** | climb / mantle hore |
| **stena + smer** | wall-run |
| **Ľavé tlačidlo myši** | streľba |
| **1 / 2 · koliesko** | pištoľ / samopal |
| **Q** | posledná zbraň |
| **R** | nabiť |
| **T** | respawn na checkpoint |
| **M** | hudba zap/vyp |

## Štruktúra projektu

Obyčajné `<script>` súbory (nie ES moduly) so zdieľaným globálnym scope —
vďaka tomu hra funguje aj cez `file://`. Poradie načítania v `index.html` je dôležité.

```
index.html          UI (HUD, menu) + načítanie skriptov
css/style.css       štýly HUD a menu
js/engine.js        scéna, kamera, renderer, svetlá, materiály, rim shader
js/audio.js         procedurálny zvuk: SFX pohybu, zbraní + drum & bass hudba
js/level.js         box(), kolízie, registry máp, loadMap()/clearLevel()
js/fx.js            častice, diery po guľkách, stopovky
js/targets.js       terče (HP, crit zóna, pohyb, obnova)
js/player.js        hráč, konštanty pohybu P, viewmodel, kolízie, pohyb, kamera
js/weapons.js       definície zbraní WEAPONS, modely, streľba, recoil, reload
js/maps/*.js        jednotlivé mapy (registerMap)
js/game.js          vstup, menu/výber mapy, stav behu, HUD, hlavná slučka
```

### Pridanie mapy

Vytvor `js/maps/moja.js` a pridaj ho do `index.html` pred `js/game.js`:

```js
registerMap({
  id: 'moja', name: 'MOJA MAPA', desc: 'Krátky popis do menu.',
  start: new THREE.Vector3(0, 0, 0), startYaw: 0,   // yaw 0 = pohľad do -z
  timed: true,          // má cieľ + best time
  targetBonus: 1.0,     // sekundy odpočítané za terč
  respawnTargets: false,
  build() {
    box(0, -1, 0, 20, 1, 20, matLight);              // x, y(spodok), z, w, h, d
    box(5, 0, 0, 1, 6, 12, matWall, { wall: true }); // wall-run stena
    addCheckpoint(0, 0, 10);
    addTarget(0, 3, -8, { move: { axis: [1,0,0], amp: 3, speed: 1 } });
    setFinish(0, 0, -9);
  },
});
```

Menu tlačidlo mapy sa vytvorí automaticky.

### Pridanie zbrane

V `js/weapons.js` pridaj záznam do `WEAPONS` (štatistiky + `build` funkcia pre
model, grip v počiatku, hlaveň smerom do −z, `userData.muzzle`) a jeho id do
`weaponOrder`. Sloty (1, 2, 3…), HUD a prepínanie sa odvodia automaticky.

## Technicky

- **Three.js** (r128, cez CDN) — render, low-poly geometria, tiene (tieňová
  kamera sleduje hráča).
- **Momentum movement engine** (Quake/Source štýl) — akcelerácia + trenie,
  air-strafe, wall-run, wall-jump, double jump, buffered slide, mantle.
- **Custom shadery** cez `onBeforeCompile` — fresnel rim + fake AO, aby biele
  plochy nesplývali s bielym pozadím.
- **Viewmodel** — blokové ruky a nohy (Minecraft štýl), zbraň v pravej ruke
  s animáciou recoilu, prebíjania a prepínania.
- **Procedurálny zvuk** (Web Audio API) — žiadne audio súbory.

## Ladenie

- Pohyb: objekt `P` v `js/player.js` (gravitácia, rýchlosti, skok, slide…).
- Zbrane: `WEAPONS` v `js/weapons.js` (kadencia `rpm`, `dmg`, `spread`,
  `kick`, `reload`…), `FLOW_ACCURACY` = bonus presnosti pri wall-rune/slide.
- Terče: `TARGET_HP`, `TARGET_RESPAWN` v `js/targets.js`.
- Shader: `applyRimShader` v `js/engine.js` (`_ao`, `_fres`).

## Nápady na ďalej

- nepriatelia, ktorí strieľajú späť (drony / veže)
- viac zbraní (brokovnica, sniper), zameriavanie pravým tlačidlom
- ďalšie mapy, editor máp / načítanie z JSON
- nastavenia (citlivosť myši, FOV, hlasitosť)
