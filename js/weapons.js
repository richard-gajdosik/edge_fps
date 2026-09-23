// =========================================================================
//  WEAPONS — guns (hitscan), knife (melee), grenades (thrown), ADS zoom,
//  viewmodel, recoil, spread, reload, switching
// =========================================================================
// To add a weapon: add an entry to WEAPONS (+ a build function for the model)
// and its id to weaponOrder. Slot keys (1, 2, ...) follow weaponOrder.
//   type 'gun'   → hitscan, magazine, optional zoom (right mouse)
//   type 'melee' → short-range hit, no ammo
//   type 'throw' → grenade, uses gun.grenades

const WEAPONS = {
  pistol: {
    type: 'gun', name: 'PISTOĽ', auto: false, rpm: 400, dmg: 55, crit: 2.0, mag: 12, reload: 1.1,
    spread: 0.002, moveSpread: 0.012, airSpread: 0.014, bloom: 0.014, bloomMax: 0.03,
    kick: 0.035, kickYaw: 0.006, kickAnim: 0.22, range: 300, sound: 'pistol',
    zoom: 0.78, adsSpread: 0.35, build: buildPistol,
  },
  smg: {
    type: 'gun', name: 'SAMOPAL', auto: true, rpm: 800, dmg: 17, crit: 1.6, mag: 30, reload: 1.6,
    spread: 0.008, moveSpread: 0.014, airSpread: 0.018, bloom: 0.004, bloomMax: 0.04,
    kick: 0.011, kickYaw: 0.008, kickAnim: 0.07, range: 200, sound: 'smg',
    zoom: 0.72, adsSpread: 0.5, build: buildSmg,
  },
  sniper: {
    type: 'gun', name: 'SNIPERKA', auto: false, rpm: 50, dmg: 120, crit: 2.5, mag: 5, reload: 2.2,
    spread: 0.05, moveSpread: 0.03, airSpread: 0.03, bloom: 0, bloomMax: 0,
    kick: 0.09, kickYaw: 0.012, kickAnim: 0.35, range: 800, sound: 'sniper',
    zoom: 0.25, scope: true, adsSpread: 0.012, build: buildSniper,
  },
  knife: {
    type: 'melee', name: 'NÔŽ', rpm: 120, dmg: 55, crit: 2.0, range: 2.6, speedMul: 1.1,
    viewScale: 1.5, viewY: 0.12,
    build: buildKnife,
  },
  grenade: {
    type: 'throw', name: 'GRANÁT', rpm: 75, build: buildGrenade,
  },
};
const weaponOrder = ['pistol', 'smg', 'sniper', 'knife', 'grenade'];
const SWITCH_TIME = 0.32;
const FLOW_ACCURACY = 0.55;  // spread multiplier while wall-running / sliding
const MAX_GRENADES = 3, GRENADE_REGEN = 10;   // +1 grenade every 10 s

const gun = {
  id: 'pistol', last: 'smg', pending: null,
  ammo: {}, grenades: MAX_GRENADES, grenadeRegen: 0,
  cooldown: 0, fireBuffer: 0, trigger: false,
  reloading: 0, switching: 0, autoReload: 0,
  bloom: 0, kick: 0, flash: 0, swingT: 0,
  adsHeld: false, ads: false, adsT: 0, scoped: false,
  recoilPitch: 0, recoilYaw: 0,
};
function refillAmmo() {
  for (const id of weaponOrder) if (WEAPONS[id].type === 'gun') gun.ammo[id] = WEAPONS[id].mag;
  gun.grenades = MAX_GRENADES; gun.grenadeRegen = 0;
}
refillAmmo();

// ---------- models (grip at the origin, barrel / blade toward -z) ----------
function part(g, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); g.add(m); return m;
}
function addMuzzle(g, z, y) {
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, y, z); g.add(muzzle);
  g.userData.muzzle = muzzle;
}
function buildPistol() {
  const g = new THREE.Group();
  part(g, 0.05, 0.12, 0.06, 0, -0.02, 0.01, matGun).rotation.x = 0.22;   // grip
  part(g, 0.052, 0.035, 0.19, 0, 0.05, -0.06, matGunLight);             // frame
  part(g, 0.058, 0.05, 0.23, 0, 0.09, -0.075, matGun);                  // slide
  part(g, 0.06, 0.012, 0.09, 0, 0.118, -0.03, matAccent);               // red stripe
  part(g, 0.014, 0.018, 0.014, 0, 0.122, -0.18, matGunLight);           // front sight
  addMuzzle(g, -0.2, 0.09);
  return g;
}
function buildSmg() {
  const g = new THREE.Group();
  part(g, 0.046, 0.12, 0.06, 0, -0.02, 0.01, matGun).rotation.x = 0.18;  // grip
  part(g, 0.07, 0.085, 0.36, 0, 0.07, -0.1, matGun);                     // receiver
  part(g, 0.072, 0.014, 0.2, 0, 0.1, -0.12, matAccent);                  // red stripe
  part(g, 0.03, 0.03, 0.14, 0, 0.08, -0.34, matGunLight);                // barrel
  part(g, 0.04, 0.16, 0.05, 0, -0.03, -0.16, matGunLight).rotation.x = -0.1; // magazine
  part(g, 0.04, 0.05, 0.16, 0, 0.06, 0.14, matGunLight);                 // stock
  part(g, 0.02, 0.03, 0.05, 0, 0.125, -0.02, matGun);                    // rear sight
  addMuzzle(g, -0.42, 0.08);
  return g;
}
function buildSniper() {
  const g = new THREE.Group();
  part(g, 0.045, 0.12, 0.06, 0, -0.02, 0.01, matGun).rotation.x = 0.2;   // grip
  part(g, 0.065, 0.08, 0.5, 0, 0.065, -0.12, matGun);                    // body
  part(g, 0.028, 0.028, 0.42, 0, 0.075, -0.58, matGunLight);             // long barrel
  part(g, 0.04, 0.04, 0.06, 0, 0.075, -0.8, matGun);                     // muzzle brake
  part(g, 0.05, 0.05, 0.2, 0, 0.145, -0.1, matGun);                      // scope tube
  part(g, 0.062, 0.062, 0.04, 0, 0.145, -0.2, matGunLight);              // scope front
  part(g, 0.058, 0.058, 0.04, 0, 0.145, 0.0, matGunLight);               // scope rear
  part(g, 0.067, 0.014, 0.16, 0, 0.1, -0.3, matAccent);                  // red stripe
  part(g, 0.05, 0.09, 0.22, 0, 0.03, 0.2, matGunLight);                  // stock
  part(g, 0.02, 0.05, 0.02, 0, 0.12, -0.04, matGun);                     // bolt handle
  addMuzzle(g, -0.83, 0.075);
  return g;
}
const matBlade = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.3, metalness: 0.6 });
function buildKnife() {
  const g = new THREE.Group();
  part(g, 0.035, 0.05, 0.12, 0, 0, 0.0, matGun);                         // handle
  part(g, 0.06, 0.02, 0.02, 0, 0, -0.065, matAccent);                    // guard
  const b = part(g, 0.045, 0.01, 0.2, 0, 0.004, -0.17, matBlade);        // blade (flat side up)
  part(g, 0.02, 0.01, 0.05, -0.008, 0.004, -0.28, matBlade).rotation.y = 0.5; // tip
  b.castShadow = false;
  return g;
}
const nadeGeo = new THREE.IcosahedronGeometry(0.06, 0);
const matNade = new THREE.MeshStandardMaterial({ color: 0x3d4a3a, roughness: 0.7, flatShading: true });
function buildGrenade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(nadeGeo, matNade); body.position.set(0, 0.04, -0.03); g.add(body);
  part(g, 0.05, 0.02, 0.05, 0, 0.1, -0.03, matGunLight);                 // cap
  part(g, 0.012, 0.05, 0.03, 0.03, 0.08, -0.01, matAccent);              // lever
  return g;
}

// ---------- viewmodel: weapons are children of the right arm ----------
// The arm pitches up toward the screen center; the weapon counter-rotates so
// the barrel points along the view when the arm is at rest.
const HOLD_X = 0.45;
const HOLD_POS = new THREE.Vector3(0.18, -0.46, -0.08);
const ADS_POS  = new THREE.Vector3(0.0, -0.39, -0.02);   // gun centred under the crosshair
const gunModels = {};
for (const id of weaponOrder) {
  const w = WEAPONS[id], m = w.build();
  m.position.set(0, 0.05 + (w.viewY || 0), -0.5);
  m.rotation.x = -HOLD_X;
  m.scale.setScalar(0.72 * (w.viewScale || 1));
  m.visible = id === gun.id;
  m.traverse(o => { o.castShadow = false; });
  armR.add(m);
  gunModels[id] = m;
}
armR.rotation.y = 0;

// muzzle flash (always in the scene; toggled via visibility/intensity so the
// shader light count never changes and nothing recompiles mid-fight)
const flashMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0),
  new THREE.MeshBasicMaterial({ color: 0xffd27a }));
flashMesh.visible = false;
const flashLight = new THREE.PointLight(0xffc070, 0, 10, 2);
camera.add(flashLight); flashLight.position.set(0.2, -0.1, -0.7);

function currentMuzzle() { return gunModels[gun.id].userData.muzzle || null; }
function attachFlash() { const m = currentMuzzle(); if (m) m.add(flashMesh); }
attachFlash();

// ---------- zoom (right mouse) ----------
function canAds() {
  const w = WEAPONS[gun.id];
  return !!w.zoom && gun.switching <= 0 && gun.reloading <= 0 && !player.mantle;
}
function adsFovScale() {
  const w = WEAPONS[gun.id];
  return w.zoom ? 1 + (w.zoom - 1) * gun.adsT : 1;
}
function weaponSpeedMul() {
  const w = WEAPONS[gun.id];
  if (gun.ads) return w.scope ? 0.65 : 0.8;
  return w.speedMul || 1;
}
// mouse sensitivity follows the zoom so aiming feels the same
function aimSensitivity() { return Math.min(1, camera.fov / 80); }

function animateWeaponArm(dt, swing, amp) {
  const w = WEAPONS[gun.id];
  gun.kick = Math.max(0, gun.kick - dt * 9);
  const bobK = 1 - gun.adsT * 0.85;
  let rx = HOLD_X + (swing * amp * 0.08 - armFlair * 0.15) * bobK + gun.kick * (w.kickAnim || 0);
  let ry = 0, rz = 0;
  const pos = HOLD_POS.clone().lerp(ADS_POS, gun.adsT);
  pos.y += Math.abs(swing) * amp * 0.015 * bobK;
  pos.z += gun.kick * 0.05;
  if (gun.switching > 0) {
    const k = Math.sin(Math.PI * (1 - gun.switching / SWITCH_TIME));
    rx -= k * 0.9; pos.y -= k * 0.12;
  }
  if (gun.reloading > 0) {
    const k = Math.sin(Math.PI * (1 - gun.reloading / w.reload));
    rx -= k * 0.35; rz += k * 0.55; pos.y -= k * 0.05;
  }
  if (gun.swingT > 0) {                      // knife slash / grenade throw
    const k = Math.sin(Math.PI * gun.swingT);
    if (w.type === 'melee') { rx += k * 0.5; ry += k * 0.9; rz -= k * 0.6; pos.x -= k * 0.12; pos.z -= k * 0.12; }
    else { rx += k * 1.1; pos.z -= k * 0.15; pos.y += k * 0.08; }
    gun.swingT = Math.max(0, gun.swingT - dt * 4);
  }
  const f = Math.min(1, dt * 18);
  armR.rotation.x += (rx - armR.rotation.x) * f;
  armR.rotation.y += (ry - armR.rotation.y) * f;
  armR.rotation.z += (rz - armR.rotation.z) * f;
  armR.position.lerp(pos, f);
  // the scope overlay replaces the viewmodel when fully zoomed
  armR.visible = !gun.scoped;
  armL.visible = !gun.scoped;
}

// ---------- aiming ----------
function currentSpread() {
  const w = WEAPONS[gun.id];
  if (w.type !== 'gun') return 0.01;
  let s = w.spread + gun.bloom;
  if (player.wallrun || player.sliding) s *= FLOW_ACCURACY;
  else if (!player.onGround) s += w.airSpread;
  else s += w.moveSpread * Math.min(Math.hypot(player.vel.x, player.vel.z) / P.run, 1);
  return s * (1 + (w.adsSpread - 1) * gun.adsT);
}

const raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function hittables() { return solids.concat(aliveTargetMeshes(), aliveBotMeshes()); }

// shared hit logic for bullets and the knife; returns true if something damageable was hit
function applyHit(hit, dmg, critMul, time) {
  const t = hit.object.userData.target, b = hit.object.userData.bot;
  const crit = !!hit.object.userData.crit;
  const d = dmg * (crit ? critMul : 1);
  let killed = false;
  if (t) killed = damageTarget(t, d, time);
  else if (b) killed = damageBot(b, d, time);
  else return false;
  showHitmarker(crit || killed);
  sfxHit(crit);
  return true;
}
function hitNormal(hit, fallback) {
  return hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : fallback.clone().negate();
}

function aimRay(spread) {
  camera.updateMatrixWorld(true);
  camera.getWorldDirection(_dir);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  const r = spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
  _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
  raycaster.set(camera.position, _dir);
}

function fire(time) {
  const w = WEAPONS[gun.id];
  gun.ammo[gun.id]--;
  gun.cooldown = 60 / w.rpm;

  aimRay(currentSpread());
  raycaster.far = w.range;
  const hit = raycaster.intersectObjects(hittables(), false)[0];

  const m = currentMuzzle();
  if (gun.scoped || !m) _muzzle.copy(camera.position).addScaledVector(_up, -0.15);
  else m.getWorldPosition(_muzzle);
  const end = hit ? hit.point : camera.position.clone().addScaledVector(_dir, w.range);
  spawnTracer(_muzzle, end);

  if (hit) spawnImpact(hit.point, hitNormal(hit, _dir), applyHit(hit, w.dmg, w.crit, time));

  // feedback
  gun.recoilPitch += w.kick * (0.8 + Math.random() * 0.4);
  gun.recoilYaw += (Math.random() - 0.5) * 2 * w.kickYaw;
  gun.bloom = Math.min(gun.bloom + w.bloom, w.bloomMax);
  gun.kick = 1; gun.flash = 0.045;
  flashMesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  flashMesh.scale.set(1 + Math.random() * 0.6, 1 + Math.random() * 0.6, 2.2);
  sfxShot(w.sound);
  if (gun.ammo[gun.id] <= 0) gun.autoReload = 0.2;
}

function stab(time) {
  const w = WEAPONS[gun.id];
  gun.cooldown = 60 / w.rpm;
  gun.swingT = 1;
  sfxSwish();
  aimRay(0);
  raycaster.far = w.range;
  const hit = raycaster.intersectObjects(hittables(), false)[0];
  if (!hit) return;
  const dmg = applyHit(hit, w.dmg, w.crit, time);
  spawnImpact(hit.point, hitNormal(hit, _dir), dmg);
  if (!dmg) sfxClick(600, 0.12);
}

function throwGrenade() {
  if (gun.grenades <= 0 || gun.cooldown > 0) return false;
  gun.grenades--;
  gun.cooldown = 60 / WEAPONS.grenade.rpm;
  camera.updateMatrixWorld(true);
  camera.getWorldDirection(_dir);
  const from = camera.position.clone().addScaledVector(_dir, 0.5);
  if (pointBlocked(from, NADE_R)) from.copy(camera.position);
  const vel = _dir.clone().multiplyScalar(19).add(new THREE.Vector3(0, 2.5, 0))
                .addScaledVector(player.vel, 0.6);
  spawnGrenade(from, vel);
  if (gun.id === 'grenade') gun.swingT = 1; else armFlair = 1;
  sfxSwish();
  return true;
}

function startReload() {
  const w = WEAPONS[gun.id];
  if (w.type !== 'gun') return;
  if (gun.reloading > 0 || gun.switching > 0 || gun.ammo[gun.id] >= w.mag) return;
  gun.reloading = w.reload;
  sfxReload(w.reload);
}

function selectWeapon(id) {
  if (!WEAPONS[id] || id === gun.id || gun.pending) return;
  gun.pending = id;
  gun.switching = SWITCH_TIME;
  gun.reloading = 0; gun.autoReload = 0;
  sfxSwitch();
}
function selectSlot(i) { if (weaponOrder[i]) selectWeapon(weaponOrder[i]); }
function cycleWeapon(dir) {
  const cur = weaponOrder.indexOf(gun.pending || gun.id);
  selectWeapon(weaponOrder[(cur + dir + weaponOrder.length) % weaponOrder.length]);
}
function lastWeapon() { selectWeapon(gun.last); }

function updateWeapons(dt, time, active) {
  const w = WEAPONS[gun.id];
  gun.cooldown -= dt; gun.fireBuffer -= dt;
  gun.bloom = Math.max(0, gun.bloom - dt * (gun.trigger ? 0.02 : 0.08));
  const rec = Math.min(1, dt * 9);
  gun.recoilPitch -= gun.recoilPitch * rec;
  gun.recoilYaw -= gun.recoilYaw * rec;

  // grenade regen
  if (gun.grenades < MAX_GRENADES) {
    gun.grenadeRegen += dt;
    if (gun.grenadeRegen >= GRENADE_REGEN) { gun.grenades++; gun.grenadeRegen = 0; }
  } else gun.grenadeRegen = 0;

  // zoom
  gun.ads = active && gun.adsHeld && canAds();
  gun.adsT += ((gun.ads ? 1 : 0) - gun.adsT) * Math.min(1, dt * (w.scope ? 14 : 16));
  if (gun.adsT < 0.001) gun.adsT = 0;
  gun.scoped = !!w.scope && gun.adsT > 0.85;

  gun.flash -= dt;
  flashMesh.visible = gun.flash > 0 && !gun.scoped;
  flashLight.intensity = gun.flash > 0 ? 1.6 : 0;

  if (gun.switching > 0) {
    gun.switching -= dt;
    if (gun.pending && gun.switching < SWITCH_TIME / 2) {
      gunModels[gun.id].visible = false;
      gun.last = gun.id; gun.id = gun.pending; gun.pending = null;
      gunModels[gun.id].visible = true;
      attachFlash();
    }
    return;
  }
  if (gun.reloading > 0) {
    gun.reloading -= dt;
    if (gun.reloading <= 0) { gun.reloading = 0; gun.ammo[gun.id] = w.mag; }
    return;
  }
  if (gun.autoReload > 0) { gun.autoReload -= dt; if (gun.autoReload <= 0) startReload(); }
  // grenade in hand hidden while none are left
  if (w.type === 'throw') gunModels.grenade.visible = gun.grenades > 0 && gun.cooldown < 0.3;
  if (!active) return;

  const wants = w.auto ? gun.trigger : gun.fireBuffer > 0;
  if (!wants || gun.cooldown > 0) return;
  gun.fireBuffer = 0;
  if (w.type === 'melee') stab(time);
  else if (w.type === 'throw') {
    if (!throwGrenade()) { sfxEmpty(); gun.cooldown = 0.25; }
  } else if (gun.ammo[gun.id] > 0) fire(time);
  else { sfxEmpty(); startReload(); gun.cooldown = 0.25; }
}
