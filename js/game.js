// =========================================================================
//  GAME — input, menu / map select, run state, HUD, main loop
// =========================================================================

// ---------- input ----------
const keys = {};
let locked = false;

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyM') toggleMusic();
  if (!locked) return;
  if (e.code === 'Space') { player.jumpBuffer = 0.12; e.preventDefault(); }
  if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') {
    if (!e.repeat) pressCrouch();          // holding the key = one slide, then crouch
    e.preventDefault();
  }
  if (e.code === 'KeyG' && !e.repeat) throwGrenade();
  if (e.code === 'KeyT') respawn();
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyQ') lastWeapon();
  if (e.code.startsWith('Digit')) selectSlot(parseInt(e.code.slice(5), 10) - 1);
});
addEventListener('keyup', e => { keys[e.code] = false; });

document.addEventListener('mousedown', e => {
  if (!locked) return;
  if (e.button === 0) { gun.trigger = true; gun.fireBuffer = 0.15; }
  if (e.button === 2) gun.adsHeld = true;
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) gun.trigger = false;
  if (e.button === 2) gun.adsHeld = false;
});
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('wheel', e => { if (locked) cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });

// pointerrawupdate (Chrome/Edge) fires as soon as the mouse reports, not once
// per frame like mousemove → less input latency. Falls back to mousemove.
const LOOK_EVENT = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'mousemove';
document.addEventListener(LOOK_EVENT, e => {
  if (!locked) return;
  const sens = 0.0022 * aimSensitivity() * SETTINGS.sens;
  player.yaw   -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  const lim = Math.PI/2 - 0.02;
  player.pitch = Math.max(-lim, Math.min(lim, player.pitch));
});

// ---------- menu ----------
const overlay   = document.getElementById('overlay');
const playBtn   = document.getElementById('play');
const resumeBtn = document.getElementById('resume');
const elTitle   = overlay.querySelector('h1');
const elSub     = document.getElementById('subtitle');
const elMaps    = document.getElementById('maps');

// unadjustedMovement = raw mouse input (no OS acceleration / smoothing);
// browsers without it reject the request, then we lock the normal way
function requestLock() {
  const c = renderer.domElement;
  try {
    const p = c.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { c.requestPointerLock(); } catch (e) {} });
  } catch (e) { c.requestPointerLock(); }
}
playBtn.addEventListener('click', () => { initAudio(); startRun(); requestLock(); });
resumeBtn.addEventListener('click', () => { initAudio(); requestLock(); });

for (const id of mapOrder) {
  const b = document.createElement('button');
  b.className = 'map'; b.dataset.map = id;
  b.innerHTML = `<b>${MAPS[id].name}</b><span>${MAPS[id].desc}</span>`;
  b.addEventListener('click', () => selectMap(id));
  elMaps.appendChild(b);
}

// ---------- bots option (maps with bots: true) ----------
const BOT_COUNTS = [0, 2, 4, 6];
const elMapOpts = document.getElementById('mapopts');
const botsBtn = document.getElementById('botsbtn');
let botCount = 4;
try { const v = parseInt(localStorage.getItem('edge_bots'), 10); if (BOT_COUNTS.includes(v)) botCount = v; } catch (e) {}
function updateBotsBtn() {
  botsBtn.textContent = 'BOTI: ' + (botCount ? botCount : 'VYP');
  botsBtn.classList.toggle('on', botCount > 0);
  elMapOpts.style.display = mapState.def && mapState.def.bots ? '' : 'none';
}
botsBtn.addEventListener('click', () => {
  botCount = BOT_COUNTS[(BOT_COUNTS.indexOf(botCount) + 1) % BOT_COUNTS.length];
  try { localStorage.setItem('edge_bots', botCount); } catch (e) {}
  if (running && mapState.def.bots) spawnBots(botCount, performance.now() / 1000);
  updateBotsBtn();
});
function botsActive() { return !!mapState.def.bots && bots.length > 0; }

function setOverlay(title, sub) { elTitle.innerHTML = title; elSub.textContent = sub; }
function menuOverlay() { setOverlay('<b>EDGE</b>', mapState.def.name + ' · FPS'); }

function selectMap(id) {
  if (id !== mapState.id) {
    loadMap(id);
    running = false; pausedAt = 0;
    respawnTo(0);
    try { localStorage.setItem('edge_map', id); } catch (e) {}
  }
  for (const b of elMaps.children) b.classList.toggle('on', b.dataset.map === mapState.id);
  menuOverlay(); updateBestLabel(); updateResume(); updateBotsBtn();
  playBtn.textContent = 'HRAŤ';
}

function updateResume() { resumeBtn.style.display = running ? '' : 'none'; }

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('hidden', locked);
  const now = performance.now();
  if (!locked) {
    gun.trigger = false; gun.adsHeld = false;
    for (const k in keys) keys[k] = false;
    if (running) { pausedAt = now; setOverlay('<b>EDGE</b>', 'PAUZA · ' + mapState.def.name); playBtn.textContent = 'REŠTART'; }
  } else if (pausedAt) {
    startTime += now - pausedAt; pausedAt = 0;
  }
  updateResume();
});

// ---------- run state ----------
let running = false, startTime = 0, pausedAt = 0, elapsed = 0, curCheckpoint = 0;
let targetsHit = 0, kills = 0, deaths = 0;

const elSpeed   = document.querySelector('#speed b');
const elFill    = document.getElementById('speedfill');
const elTime    = document.getElementById('time');
const elTargets = document.getElementById('targets');
const elState   = document.getElementById('state');
const elFlash   = document.getElementById('flash');
const elBest    = document.getElementById('best');
const elAmmo    = document.getElementById('ammo');
const elWName   = document.getElementById('wname');
const elSlots   = document.getElementById('slots');
const elCross   = document.getElementById('cross');
const elHit     = document.getElementById('hitmarker');
const elHpNum   = document.querySelector('#hpnum b');
const elHpFill  = document.getElementById('hpfill');
const elHurt    = document.getElementById('hurt');
const elScope   = document.getElementById('scope');
const elScore   = document.getElementById('score');
const elBanner  = document.getElementById('banner');
const elNades   = document.getElementById('nades');
const elSpeedLabel = document.getElementById('speedlabel');
const elSurf    = document.getElementById('surfspeed');
const elSurfNum = document.querySelector('#surfspeed b');
const elSurfBar = document.querySelector('#surfbar div');
const elLines   = document.getElementById('speedlines');

function bestKey() { return 'edge_best_' + mapState.id; }
function getBest() { try { return parseFloat(localStorage.getItem(bestKey()) || '0') || 0; } catch (e) { return 0; } }
function updateBestLabel(isNew) {
  if (!mapState.def.timed) { elBest.textContent = ''; return; }
  const b = getBest();
  elBest.textContent = b ? 'BEST ' + b.toFixed(2) + 's' + (isNew ? '  ★ NEW' : '') : 'BEST —';
}

function startRun() {
  respawnTo(0); resetTargets(); refillAmmo(); clearFx();
  gun.reloading = 0;
  player.hp = 100; player.invuln = 0;
  targetsHit = 0; kills = 0; deaths = 0; elapsed = 0; pausedAt = 0;
  spawnBots(mapState.def.bots ? botCount : 0, performance.now() / 1000);
  running = true; startTime = performance.now();
  playBtn.textContent = 'HRAŤ';
}

function finishRun() {
  running = false;
  elapsed = (performance.now() - startTime)/1000;
  const bonus = targetsHit * mapState.def.targetBonus;
  const final = Math.max(0, elapsed - bonus);
  const best = getBest();
  const isNew = !best || final < best;
  if (isNew) { try { localStorage.setItem(bestKey(), final.toFixed(2)); } catch (e) {} }
  updateBestLabel(isNew);
  document.exitPointerLock();
  setOverlay(final.toFixed(2) + '<b>s</b>',
    `FINISH · ${elapsed.toFixed(2)}s − ${targetsHit}/${targets.length} TERČOV`);
  playBtn.textContent = 'ZNOVA';
}

function onTargetDestroyed() { targetsHit++; }
function onBotKilled() { kills++; showBanner('+1 KILL'); }

let bannerT = 0;
function showBanner(text) { elBanner.textContent = text; bannerT = 1.2; }

// ---------- player health ----------
const HP_REGEN_DELAY = 4, HP_REGEN = 30;
let hurtT = 0;
function damagePlayer(dmg, from, time) {
  if (player.invuln > 0 || player.hp <= 0) return;
  player.hp -= dmg; player.lastHurt = time;
  hurtT = Math.min(1, hurtT + 0.35 + dmg / 60);
  sfxHurt();
  if (player.hp <= 0) playerDied();
}
function playerDied() {
  deaths++;
  showBanner('ZABITÝ');
  elFlash.style.opacity = 0.5; setTimeout(() => elFlash.style.opacity = 0, 80);
  respawn();
  player.hp = 100; player.invuln = 1.5;
  if (botsActive()) refillAmmo();
}
function updateHealth(dt, time) {
  player.invuln = Math.max(0, player.invuln - dt);
  if (player.hp < 100 && time - player.lastHurt > HP_REGEN_DELAY) player.hp = Math.min(100, player.hp + HP_REGEN * dt);
}

function respawn() { respawnTo(curCheckpoint); }
function respawnTo(i) {
  curCheckpoint = i;
  player.pos.copy(mapState.checkpoints[i]); player.vel.set(0,0,0);
  player.wallrun = 0; player.sliding = false; player.crouching = false; player.mantle = null; player.airJumps = 1;
  player.height = P.standHeight; player.lastSafe.copy(player.pos);
  if (i === 0 || mapState.def.resetYaw) { player.yaw = mapState.startYaw; if (i === 0) player.pitch = 0; }
  srcAccum = 0; player.onGround = false; player.surfing = false;
}
function checkFinish() {
  if (!running) return;
  if ((mapState.finish && player.pos.distanceTo(mapState.finish) < 4) ||
      (mapState.finishZone && inZone(player.pos, mapState.finishZone))) finishRun();
}
function updateCheckpoint() {
  const cps = mapState.checkpoints;
  for (let i = curCheckpoint+1; i < cps.length; i++) {
    if (cps[i].zone ? inZone(player.pos, cps[i].zone) : player.pos.distanceTo(cps[i]) < 5) {
      curCheckpoint = i;
      elFlash.style.opacity = 0.6; setTimeout(() => elFlash.style.opacity = 0, 60);
    }
  }
}

// ---------- HUD ----------
let hitTimer = 0;
function showHitmarker(strong) {
  hitTimer = strong ? 0.22 : 0.12;
  elHit.classList.toggle('crit', strong);
}

for (let i = 0; i < weaponOrder.length; i++) {
  const s = document.createElement('span');
  s.dataset.w = weaponOrder[i];
  s.textContent = (i + 1) + ' ' + WEAPONS[weaponOrder[i]].name;
  s.title = WEAPONS[weaponOrder[i]].name;
  elSlots.appendChild(s);
}

// write to the DOM only when a value actually changed — avoids style/layout
// work every frame (that work competes with rendering and adds latency)
function hset(el, key, val) {
  const c = el._hud || (el._hud = {});
  if (c[key] === val) return;
  c[key] = val;
  if (key === 'text') el.textContent = val;
  else if (key === 'html') el.innerHTML = val;
  else if (key.startsWith('--')) el.style.setProperty(key, val);
  else el.style[key] = val;
}

function updateHud(dt) {
  const sp = Math.hypot(player.vel.x, player.vel.z);
  const surf = mapState.def.physics === 'source';
  hset(elSpeed, 'text', surf ? Math.round(sp / U) : Math.round(sp * 7.2));
  hset(elSpeedLabel, 'text', surf ? 'U/S' : 'SPEED');
  // surf: big speedometer (horizontal speed in Source units) + speed lines
  hset(elSurf, 'display', surf ? 'block' : 'none');
  if (surf) {
    const ups = sp / U;
    hset(elSurfNum, 'text', Math.round(ups));
    const k = Math.min(ups / 3000, 1);
    hset(elSurf, 'color', `rgb(${243 + 12*k | 0}, ${236 - 162*k | 0}, ${227 - 191*k | 0})`);
    hset(elSurfBar, 'width', (k * 100).toFixed(0) + '%');
    const lo = Math.max(0, Math.min(0.55, (ups - 700) / 2400));
    hset(elLines, 'opacity', lo.toFixed(2));
    hset(elLines, 'display', lo > 0 ? 'block' : 'none');
  } else hset(elLines, 'display', 'none');
  // surf timer only starts once you leave the start zone
  if (running && !pausedAt && mapState.def.startZone && inZone(player.pos, mapState.def.startZone)) startTime = performance.now();
  hset(elFill, 'width', Math.min(100, (sp/P.slideSpeed)*100).toFixed(0) + '%');
  if (running && !pausedAt) { elapsed = (performance.now() - startTime)/1000; hset(elTime, 'text', elapsed.toFixed(2)); }
  hset(elTargets, 'html', mapState.def.respawnTargets
    ? `<b>${targetsHit}</b>` : `<b>${targetsHit}</b> / ${targets.length}`);

  let st = '';
  if (player.mantle) st = 'CLIMB';
  else if (player.surfing) st = 'SURF';
  else if (player.wallrun) st = 'WALL-RUN';
  else if (player.sliding) st = 'SLIDE';
  else if (player.crouching) st = 'CROUCH';
  else if (!player.onGround) st = player.airJumps > 0 ? 'AIR' : 'DOUBLE';
  hset(elState, 'text', st);
  hset(elState, 'opacity', st ? 1 : 0);

  // weapon
  const w = WEAPONS[gun.id], ammo = gun.ammo[gun.id];
  if (w.type === 'gun') {
    hset(elAmmo, 'html', `<b>${ammo}</b><span> / ${w.mag}</span>`);
    elAmmo.classList.toggle('low', ammo <= Math.ceil(w.mag * 0.25));
  } else if (w.type === 'throw') {
    hset(elAmmo, 'html', `<b>${gun.grenades}</b><span> / ${MAX_GRENADES}</span>`);
    elAmmo.classList.toggle('low', gun.grenades === 0);
  } else { hset(elAmmo, 'html', '<b>∞</b>'); elAmmo.classList.remove('low'); }
  hset(elNades, 'text', 'G GRANÁT ' + '●'.repeat(gun.grenades) + '○'.repeat(MAX_GRENADES - gun.grenades));
  hset(elWName, 'text', gun.reloading > 0 ? 'NABÍJANIE…' : w.name);
  for (const s of elSlots.children) s.classList.toggle('on', s.dataset.w === (gun.pending || gun.id));

  // crosshair gap follows the actual bullet spread
  const px = currentSpread() / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * innerHeight / 2;
  hset(elCross, '--gap', (4 + px).toFixed(1) + 'px');
  hset(elCross, 'opacity', gun.scoped ? '0' : (1 - gun.adsT * 0.5).toFixed(2));
  hset(elScope, 'opacity', gun.scoped ? 1 : 0);

  // health
  const hp = Math.max(0, Math.ceil(player.hp));
  hset(elHpNum, 'text', hp);
  hset(elHpFill, 'width', hp + '%');
  elHpFill.classList.toggle('low', hp <= 35);
  hurtT = Math.max(0, hurtT - dt * 1.6);
  hset(elHurt, 'opacity', Math.max(hurtT, player.hp < 35 ? 0.35 : 0).toFixed(2));

  hset(elScore, 'display', botsActive() ? '' : 'none');
  hset(elScore, 'html', `<b>${kills}</b> K · ${deaths} D`);
  bannerT -= dt;
  hset(elBanner, 'opacity', (bannerT > 0 ? Math.min(1, bannerT * 3) : 0).toFixed(2));

  hitTimer -= dt;
  hset(elHit, 'opacity', hitTimer > 0 ? 1 : 0);
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = (now - last)/1000;
  const dt = Math.min(rawDt, 0.033); last = now;
  updateFps(rawDt);
  const time = now / 1000;

  if (locked) {
    if (mapState.def.physics === 'source') updateSourceMovement(dt);
    else for (let i=0;i<2;i++) updateMovement(dt/2);
  }
  updateCamera(dt);
  updateWeapons(dt, time, locked);
  if (locked) { updateBots(dt, time); updateGrenades(dt, time); updateHealth(dt, time); }
  updateBlasts(dt);
  updateTargets(dt, time);
  updateFx(dt);
  updateSun(player.pos);
  updateEnvironment(dt);

  for (const o of level.children) if (o.userData.spin) o.rotation.z += dt*1.5;

  updateHud(dt);
  renderer.render(scene, camera);
}

// ---------- boot ----------
let savedMap = null;
try { savedMap = localStorage.getItem('edge_map'); } catch (e) {}
loadMap(MAPS[savedMap] ? savedMap : mapOrder[0]);
respawnTo(0);
selectMap(mapState.id);
updateBotsBtn();
applySettings();
requestAnimationFrame(loop);
