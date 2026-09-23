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
  if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') { player.slideBuffer = 0.16; e.preventDefault(); }
  if (e.code === 'KeyT') respawn();
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyQ') lastWeapon();
  if (e.code.startsWith('Digit')) selectSlot(parseInt(e.code.slice(5), 10) - 1);
});
addEventListener('keyup', e => { keys[e.code] = false; });

document.addEventListener('mousedown', e => {
  if (!locked || e.button !== 0) return;
  gun.trigger = true; gun.fireBuffer = 0.15;
});
document.addEventListener('mouseup', e => { if (e.button === 0) gun.trigger = false; });
document.addEventListener('wheel', e => { if (locked) cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });

document.addEventListener('mousemove', e => {
  if (!locked) return;
  player.yaw   -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
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

function requestLock() { renderer.domElement.requestPointerLock(); }
playBtn.addEventListener('click', () => { initAudio(); startRun(); requestLock(); });
resumeBtn.addEventListener('click', () => { initAudio(); requestLock(); });

for (const id of mapOrder) {
  const b = document.createElement('button');
  b.className = 'map'; b.dataset.map = id;
  b.innerHTML = `<b>${MAPS[id].name}</b><span>${MAPS[id].desc}</span>`;
  b.addEventListener('click', () => selectMap(id));
  elMaps.appendChild(b);
}

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
  menuOverlay(); updateBestLabel(); updateResume();
  playBtn.textContent = 'HRAŤ';
}

function updateResume() { resumeBtn.style.display = running ? '' : 'none'; }

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('hidden', locked);
  const now = performance.now();
  if (!locked) {
    gun.trigger = false;
    for (const k in keys) keys[k] = false;
    if (running) { pausedAt = now; setOverlay('<b>EDGE</b>', 'PAUZA · ' + mapState.def.name); playBtn.textContent = 'REŠTART'; }
  } else if (pausedAt) {
    startTime += now - pausedAt; pausedAt = 0;
  }
  updateResume();
});

// ---------- run state ----------
let running = false, startTime = 0, pausedAt = 0, elapsed = 0, curCheckpoint = 0;
let targetsHit = 0;

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
  targetsHit = 0; elapsed = 0; pausedAt = 0;
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

function respawn() { respawnTo(curCheckpoint); }
function respawnTo(i) {
  curCheckpoint = i;
  player.pos.copy(mapState.checkpoints[i]); player.vel.set(0,0,0);
  player.wallrun = 0; player.sliding = false; player.mantle = null; player.airJumps = 1;
  if (i === 0) { player.yaw = mapState.startYaw; player.pitch = 0; }
}
function updateCheckpoint() {
  const cps = mapState.checkpoints;
  for (let i = curCheckpoint+1; i < cps.length; i++) {
    if (player.pos.distanceTo(cps[i]) < 5) {
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
  elSlots.appendChild(s);
}

function updateHud(dt) {
  const sp = Math.hypot(player.vel.x, player.vel.z);
  elSpeed.textContent = Math.round(sp * 7.2);
  elFill.style.width = Math.min(100, (sp/P.slideSpeed)*100) + '%';
  if (running && !pausedAt) { elapsed = (performance.now() - startTime)/1000; elTime.textContent = elapsed.toFixed(2); }
  elTargets.innerHTML = mapState.def.respawnTargets
    ? `<b>${targetsHit}</b>` : `<b>${targetsHit}</b> / ${targets.length}`;

  let st = '';
  if (player.mantle) st = 'CLIMB';
  else if (player.wallrun) st = 'WALL-RUN';
  else if (player.sliding) st = 'SLIDE';
  else if (!player.onGround) st = player.airJumps > 0 ? 'AIR' : 'DOUBLE';
  elState.textContent = st;
  elState.style.opacity = st ? 1 : 0;

  // weapon
  const w = WEAPONS[gun.id], ammo = gun.ammo[gun.id];
  elAmmo.innerHTML = `<b>${ammo}</b><span> / ${w.mag}</span>`;
  elAmmo.classList.toggle('low', ammo <= Math.ceil(w.mag * 0.25));
  elWName.textContent = gun.reloading > 0 ? 'NABÍJANIE…' : w.name;
  for (const s of elSlots.children) s.classList.toggle('on', s.dataset.w === (gun.pending || gun.id));

  // crosshair gap follows the actual bullet spread
  const px = currentSpread() / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * innerHeight / 2;
  elCross.style.setProperty('--gap', (4 + px).toFixed(1) + 'px');

  hitTimer -= dt;
  elHit.style.opacity = hitTimer > 0 ? 1 : 0;
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last)/1000, 0.033); last = now;
  const time = now / 1000;

  if (locked) { for (let i=0;i<2;i++) updateMovement(dt/2); }
  updateCamera(dt);
  updateWeapons(dt, time, locked);
  updateTargets(dt, time);
  updateFx(dt);
  updateSun(player.pos);

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
requestAnimationFrame(loop);
