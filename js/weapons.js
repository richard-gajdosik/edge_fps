// =========================================================================
//  WEAPONS — hitscan guns, viewmodel, recoil, spread, reload, switching
// =========================================================================
// To add a weapon: add an entry to WEAPONS (+ a build function for the model)
// and its id to weaponOrder. Slot keys (1, 2, ...) follow weaponOrder.

const WEAPONS = {
  pistol: {
    name: 'PISTOĽ', auto: false, rpm: 400, dmg: 55, crit: 2.0, mag: 12, reload: 1.1,
    spread: 0.002, moveSpread: 0.012, airSpread: 0.014, bloom: 0.014, bloomMax: 0.03,
    kick: 0.035, kickYaw: 0.006, kickAnim: 0.22, range: 300, sound: 'pistol',
    build: buildPistol,
  },
  smg: {
    name: 'SAMOPAL', auto: true, rpm: 800, dmg: 17, crit: 1.6, mag: 30, reload: 1.6,
    spread: 0.008, moveSpread: 0.014, airSpread: 0.018, bloom: 0.004, bloomMax: 0.04,
    kick: 0.011, kickYaw: 0.008, kickAnim: 0.07, range: 200, sound: 'smg',
    build: buildSmg,
  },
};
const weaponOrder = ['pistol', 'smg'];
const SWITCH_TIME = 0.32;
const FLOW_ACCURACY = 0.55;  // spread multiplier while wall-running / sliding

const gun = {
  id: 'pistol', last: 'smg', pending: null,
  ammo: {}, cooldown: 0, fireBuffer: 0, trigger: false,
  reloading: 0, switching: 0, autoReload: 0,
  bloom: 0, kick: 0, flash: 0,
  recoilPitch: 0, recoilYaw: 0,
};
function refillAmmo() { for (const id of weaponOrder) gun.ammo[id] = WEAPONS[id].mag; }
refillAmmo();

// ---------- models (grip at the origin, barrel toward -z) ----------
function part(g, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); g.add(m); return m;
}
function buildPistol() {
  const g = new THREE.Group();
  part(g, 0.05, 0.12, 0.06, 0, -0.02, 0.01, matGun).rotation.x = 0.22;   // grip
  part(g, 0.052, 0.035, 0.19, 0, 0.05, -0.06, matGunLight);             // frame
  part(g, 0.058, 0.05, 0.23, 0, 0.09, -0.075, matGun);                  // slide
  part(g, 0.06, 0.012, 0.09, 0, 0.118, -0.03, matAccent);               // red stripe
  part(g, 0.014, 0.018, 0.014, 0, 0.122, -0.18, matGunLight);           // front sight
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.09, -0.2); g.add(muzzle);
  g.userData.muzzle = muzzle;
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
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.08, -0.42); g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

// ---------- viewmodel: guns are children of the right arm ----------
// The arm pitches up toward the screen center; the gun counter-rotates so the
// barrel points along the view when the arm is at rest.
const HOLD_X = 0.45;
const HOLD_POS = new THREE.Vector3(0.18, -0.46, -0.08);
const gunModels = {};
for (const id of weaponOrder) {
  const m = WEAPONS[id].build();
  m.position.set(0, 0.05, -0.5);
  m.rotation.x = -HOLD_X;
  m.scale.setScalar(0.72);
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

function currentMuzzle() { return gunModels[gun.id].userData.muzzle; }
function attachFlash() { currentMuzzle().add(flashMesh); }
attachFlash();

function animateWeaponArm(dt, swing, amp) {
  const w = WEAPONS[gun.id];
  gun.kick = Math.max(0, gun.kick - dt * 9);
  let rx = HOLD_X + swing * amp * 0.08 - armFlair * 0.15 + gun.kick * w.kickAnim;
  let rz = 0;
  const pos = HOLD_POS.clone();
  pos.y += Math.abs(swing) * amp * 0.015;
  pos.z += gun.kick * 0.05;
  if (gun.switching > 0) {
    const k = Math.sin(Math.PI * (1 - gun.switching / SWITCH_TIME));
    rx -= k * 0.9; pos.y -= k * 0.12;
  }
  if (gun.reloading > 0) {
    const k = Math.sin(Math.PI * (1 - gun.reloading / w.reload));
    rx -= k * 0.35; rz += k * 0.55; pos.y -= k * 0.05;
  }
  const f = Math.min(1, dt * 18);
  armR.rotation.x += (rx - armR.rotation.x) * f;
  armR.rotation.z += (rz - armR.rotation.z) * f;
  armR.position.lerp(pos, f);
}

// ---------- aiming ----------
function currentSpread() {
  const w = WEAPONS[gun.id];
  let s = w.spread + gun.bloom;
  if (player.wallrun || player.sliding) s *= FLOW_ACCURACY;
  else if (!player.onGround) s += w.airSpread;
  else s += w.moveSpread * Math.min(Math.hypot(player.vel.x, player.vel.z) / P.run, 1);
  return s;
}

const raycaster = new THREE.Raycaster();
const _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function fire(time) {
  const w = WEAPONS[gun.id];
  gun.ammo[gun.id]--;
  gun.cooldown = 60 / w.rpm;

  camera.updateMatrixWorld(true);
  camera.getWorldDirection(_dir);
  _right.setFromMatrixColumn(camera.matrixWorld, 0);
  _up.setFromMatrixColumn(camera.matrixWorld, 1);
  const s = currentSpread(), r = s * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
  _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();

  raycaster.set(camera.position, _dir);
  raycaster.far = w.range;
  const hit = raycaster.intersectObjects(solids.concat(aliveTargetMeshes()), false)[0];

  currentMuzzle().getWorldPosition(_muzzle);
  const end = hit ? hit.point : camera.position.clone().addScaledVector(_dir, w.range);
  spawnTracer(_muzzle, end);

  if (hit) {
    const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : _dir.clone().negate();
    const t = hit.object.userData.target;
    if (t) {
      const crit = !!hit.object.userData.crit;
      const killed = damageTarget(t, w.dmg * (crit ? w.crit : 1), time);
      showHitmarker(crit || killed);
      sfxHit(crit);
      spawnImpact(hit.point, n, true);
    } else {
      spawnImpact(hit.point, n, false);
    }
  }

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

function startReload() {
  const w = WEAPONS[gun.id];
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

  gun.flash -= dt;
  flashMesh.visible = gun.flash > 0;
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
  if (!active) return;

  const wants = w.auto ? gun.trigger : gun.fireBuffer > 0;
  if (wants && gun.cooldown <= 0) {
    gun.fireBuffer = 0;
    if (gun.ammo[gun.id] > 0) fire(time);
    else { sfxEmpty(); startReload(); gun.cooldown = 0.25; }
  }
}
