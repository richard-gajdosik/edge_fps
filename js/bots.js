// =========================================================================
//  BOTS — simple enemy AI for maps with `bots: true` (the arena)
// =========================================================================
// Wander → spot the player (line of sight) → react → strafe + shoot bursts.
// Their aim gets worse the faster / more acrobatically you move, so parkour
// (sliding, wall-running, air time) is your best defence.

const bots = [];
const BOT = {
  hp: 100, respawn: 4, speed: 5.2, sight: 75, reaction: 0.45,
  keepMin: 8, keepMax: 24, burst: 3, burstGap: 0.13, burstCd: [0.9, 1.7],
  dmg: 8, accuracy: 0.55,
};

const botUnit = new THREE.BoxGeometry(1, 1, 1); botUnit.userData.shared = true;
const matBotBody  = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.8 });
const matBotLimb  = new THREE.MeshStandardMaterial({ color: 0x1d1e23, roughness: 0.9 });
const matBotVisor = new THREE.MeshStandardMaterial({ color: 0xff6a2a, emissive: 0xff5a1a, emissiveIntensity: 1.3 });

function botPart(parent, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(botUnit, mat);
  m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true;
  parent.add(m); return m;
}

function createBot() {
  const g = new THREE.Group();
  const bodyMat = matBotBody.clone(); bodyMat.emissive = new THREE.Color(0xff3010); bodyMat.emissiveIntensity = 0;
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.14 * side, 0.9, 0); g.add(hip);
    botPart(hip, 0.2, 0.9, 0.22, 0, -0.45, 0, matBotLimb);
    legs.push(hip);
  }
  const torso = botPart(g, 0.56, 0.66, 0.34, 0, 1.24, 0, bodyMat);
  torso.userData.ownMaterial = true;
  botPart(g, 0.58, 0.06, 0.36, 0, 1.4, 0, matAccent);                     // chest stripe
  const head = botPart(g, 0.32, 0.3, 0.32, 0, 1.74, 0, bodyMat);
  botPart(g, 0.3, 0.07, 0.04, 0, 1.76, -0.17, matBotVisor);                // visor
  botPart(g, 0.11, 0.11, 0.5, 0.33, 1.3, -0.18, matBotLimb);               // gun arm
  botPart(g, 0.07, 0.09, 0.4, 0.33, 1.36, -0.46, matGun);                  // gun
  const tip = new THREE.Object3D(); tip.position.set(0.33, 1.36, -0.68); g.add(tip);
  g.visible = false;
  level.add(g);

  const b = {
    group: g, bodyMat, legs, tip, hitMeshes: [],
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), lastSafe: new THREE.Vector3(),
    hw: 0.35, height: 1.9, onGround: false,
    yaw: 0, hp: BOT.hp, alive: false, respawnAt: 0, flash: 0,
    canSee: false, senseT: 0, aware: 0, lastSeenT: -99, lastSeenPos: new THREE.Vector3(),
    dest: new THREE.Vector3(), strafe: 1, strafeT: 0, stuckT: 0, stuckFrom: new THREE.Vector3(),
    fireCd: 1, burstLeft: 0, walkPhase: 0,
  };
  g.traverse(o => { if (o.isMesh && o !== g) { o.userData.bot = b; b.hitMeshes.push(o); } });
  head.userData.crit = true;
  bots.push(b);
  return b;
}

function randomArenaPoint(out) {
  const a = mapState.def.botArea;
  return out.set(a.minX + Math.random() * (a.maxX - a.minX), 0, a.minZ + Math.random() * (a.maxZ - a.minZ));
}

function spawnBot(b, time) {
  const spawns = mapState.def.botSpawns;
  // pick the spawn farthest from the player out of a few random ones
  let best = null, bestD = -1;
  for (let i = 0; i < 3; i++) {
    const s = spawns[Math.floor(Math.random() * spawns.length)];
    const d = s.distanceTo(player.pos);
    if (d > bestD) { bestD = d; best = s; }
  }
  b.pos.copy(best); b.lastSafe.copy(best); b.vel.set(0, 0, 0);
  b.hp = BOT.hp; b.alive = true; b.group.visible = true;
  b.aware = 0; b.canSee = false; b.lastSeenT = -99; b.fireCd = 1 + Math.random();
  b.yaw = Math.random() * Math.PI * 2;
  randomArenaPoint(b.dest);
  b.stuckFrom.copy(b.pos); b.stuckT = 0;
}

function spawnBots(n, time) {
  for (const b of bots) level.remove(b.group);
  bots.length = 0;
  for (let i = 0; i < n; i++) spawnBot(createBot(), time);
}

function aliveBotMeshes() {
  const out = [];
  for (const b of bots) if (b.alive) out.push(...b.hitMeshes);
  return out;
}

function damageBot(b, dmg, time) {
  if (!b.alive) return false;
  b.hp -= dmg; b.flash = 1;
  // getting shot reveals where you are
  b.lastSeenPos.copy(player.pos); b.lastSeenT = time;
  if (b.hp > 0) return false;
  b.alive = false; b.group.visible = false;
  b.respawnAt = time + BOT.respawn;
  spawnDebris(b.pos.clone().add(new THREE.Vector3(0, 1.1, 0)));
  sfxBreak();
  onBotKilled(b);
  return true;
}

const _eye = new THREE.Vector3(), _to = new THREE.Vector3(), _ray = new THREE.Raycaster();
function botSeesPlayer(b) {
  if (player.hp <= 0) return false;
  _eye.copy(b.pos); _eye.y += 1.7;
  _to.copy(camera.position).sub(_eye);
  const dist = _to.length();
  if (dist > BOT.sight) return false;
  _ray.set(_eye, _to.normalize()); _ray.far = dist;
  return _ray.intersectObjects(solids, false).length === 0;
}

// hit chance drops with distance and with how hard you're moving
function botHitChance(dist) {
  const sp = Math.hypot(player.vel.x, player.vel.z);
  let k = BOT.accuracy * THREE.MathUtils.clamp(1 - dist / 90, 0.2, 1);
  k *= 1 - Math.min(sp / 18, 0.55);
  if (player.wallrun || player.sliding || !player.onGround) k *= 0.65;
  return k;
}

const _tip = new THREE.Vector3(), _aim = new THREE.Vector3();
function botShoot(b, dist, time) {
  b.tip.getWorldPosition(_tip);
  _aim.copy(camera.position); _aim.y -= 0.35;
  if (Math.random() < botHitChance(dist) && player.invuln <= 0) {
    damagePlayer(BOT.dmg, _tip, time);
  } else {
    _aim.add(randomDir(3.5));
  }
  spawnTracer(_tip, _aim);
  sfxBotShot(dist);
}

function updateBots(dt, time) {
  for (const b of bots) {
    if (!b.alive) { if (time > b.respawnAt) spawnBot(b, time); continue; }

    // --- perception ---
    b.senseT -= dt;
    if (b.senseT <= 0) { b.senseT = 0.15; b.canSee = botSeesPlayer(b); }
    const toP = _to.copy(player.pos).sub(b.pos); toP.y = 0;
    const dist = toP.length();
    if (b.canSee) { b.aware = Math.min(b.aware + dt, 3); b.lastSeenPos.copy(player.pos); b.lastSeenT = time; }
    else b.aware = Math.max(0, b.aware - dt * 0.5);

    // --- decide where to go ---
    const wish = new THREE.Vector3();
    let faceYaw = null;
    if (b.canSee) {
      toP.normalize();
      faceYaw = Math.atan2(-toP.x, -toP.z);
      if (dist > BOT.keepMax) wish.copy(toP);
      else if (dist < BOT.keepMin) wish.copy(toP).negate();
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.8 + Math.random() * 1.4; }
      wish.x += -toP.z * b.strafe * 0.8; wish.z += toP.x * b.strafe * 0.8;
    } else {
      const goal = (time - b.lastSeenT < 6) ? b.lastSeenPos : b.dest;
      wish.copy(goal).sub(b.pos); wish.y = 0;
      if (wish.length() < 1.5) { randomArenaPoint(b.dest); b.lastSeenT = -99; }
    }
    if (wish.lengthSq() > 0.001) wish.normalize().multiplyScalar(BOT.speed);

    // --- move ---
    const f = Math.min(1, dt * (b.onGround ? 8 : 1.5));
    b.vel.x += (wish.x - b.vel.x) * f;
    b.vel.z += (wish.z - b.vel.z) * f;
    if (b.onGround && b.vel.y <= 0) b.vel.y = -1; else b.vel.y -= P.gravity * dt;
    moveBody(b, dt);
    if (b.pos.y < -20) { spawnBot(b, time); continue; }

    // stuck → hop, then pick another destination
    b.stuckT += dt;
    if (b.stuckT > 1.2) {
      if (b.pos.distanceTo(b.stuckFrom) < 0.8) {
        if (b.onGround) b.vel.y = 8.5;
        randomArenaPoint(b.dest); b.strafe *= -1;
      }
      b.stuckT = 0; b.stuckFrom.copy(b.pos);
    }

    // --- turn + animate ---
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (faceYaw === null && hs > 0.5) faceYaw = Math.atan2(-b.vel.x, -b.vel.z);
    if (faceYaw !== null) {
      let d = faceYaw - b.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      b.yaw += d * Math.min(1, dt * 8);
    }
    b.group.position.copy(b.pos);
    b.group.rotation.y = b.yaw;
    b.walkPhase += dt * hs * 1.6;
    const sw = Math.sin(b.walkPhase) * Math.min(hs * 0.12, 0.7);
    b.legs[0].rotation.x = sw; b.legs[1].rotation.x = -sw;
    b.flash = Math.max(0, b.flash - dt * 8);
    b.bodyMat.emissiveIntensity = b.flash * 1.2;

    // --- shoot ---
    if (b.canSee && b.aware > BOT.reaction && player.hp > 0) {
      b.fireCd -= dt;
      if (b.fireCd <= 0) {
        if (b.burstLeft > 0) { botShoot(b, dist, time); b.burstLeft--; b.fireCd = BOT.burstGap; }
        else { b.burstLeft = BOT.burst; b.fireCd = BOT.burstCd[0] + Math.random() * (BOT.burstCd[1] - BOT.burstCd[0]); }
      }
    }
  }
}
