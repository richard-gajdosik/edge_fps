// =========================================================================
//  PLAYER — state, tuning, viewmodel, collision, movement, camera
// =========================================================================
const player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  hw: 0.4, height: 1.75, eye: 1.62, lastSafe: new THREE.Vector3(),
  onGround: false, wallrun: 0, wallNormal: new THREE.Vector3(),
  sliding: false, crouching: false, slidePress: 0, slideTime: 0, crouchT: 0,
  hp: 100, lastHurt: -99, invuln: 0,
  coyote: 0, jumpBuffer: 0, airJumps: 0,
  mantle: null, bobPhase: 0, swingSign: 1, landKick: 0,
  yaw: 0, pitch: 0, camRoll: 0,
};

const P = {
  gravity: 26, walk: 6.5, run: 11.5, slideSpeed: 16,
  groundAccel: 95, airAccel: 30, friction: 9,
  jump: 9.2, doubleJump: 8.4, wallJumpUp: 8.5, wallJumpOut: 8.0,
  wallRunGravity: 5, wallRunBoost: 12, wallStick: 0.55,
  slideBoost: 1.28, slideMaxTime: 1.1, crouchSpeed: 3.6, mantleDur: 0.26,
  standHeight: 1.75, crouchHeight: 1.0,
};

// =========================================================================
//  VIEWMODEL  (arms follow camera, legs follow body/yaw)
// =========================================================================
function limbBox(parent, w,h,d, x,y,z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); m.castShadow = false; parent.add(m); return m;
}
// --- ARMS (children of camera) — Minecraft-style single chunky block ---
const arms = new THREE.Group(); camera.add(arms);
function buildArm(side) {
  const g = new THREE.Group();
  g.position.set(0.24*side, -0.34, -0.28);
  // one solid forearm block extending forward (-z), skin coloured (contrasts white)
  limbBox(g, 0.17, 0.17, 0.52, 0, 0, -0.26, matSkin);
  g.rotation.x = -0.38; g.rotation.y = -0.14*side;
  arms.add(g); return g;
}
const armL = buildArm(-1), armR = buildArm(1);
const armBaseX = armL.rotation.x;

// --- LEGS (in scene, positioned at feet each frame) — single block per leg ---
const legs = new THREE.Group(); scene.add(legs);
function buildLeg(side) {
  const g = new THREE.Group();          // pivot at hip
  g.position.set(0.17*side, 0.90, 0);
  limbBox(g, 0.22, 0.92, 0.22, 0, -0.46, 0, matPants);  // one chunky leg
  legs.add(g); return g;
}
const legL = buildLeg(-1), legR = buildLeg(1);

// =========================================================================
//  COLLISION  (see physics.js — moveBody / spaceFree)
// =========================================================================

// wall detection (for wall-run)
function detectWall() {
  const torso = player.pos.y + player.height * 0.5;
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const dist = player.hw + P.wallStick;
  for (const dir of [1, -1]) {
    const px = player.pos.x + right.x*dir*dist, pz = player.pos.z + right.z*dir*dist;
    for (const c of colliders) {
      if (!c.wall) continue;
      if (px>c.min.x && px<c.max.x && pz>c.min.z && pz<c.max.z && torso>c.min.y && torso<c.max.y) {
        return { side: dir, normal: new THREE.Vector3(-right.x*dir, 0, -right.z*dir).normalize() };
      }
    }
  }
  return null;
}

// ledge detection (for mantle)
function detectLedge() {
  const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const reach = player.hw + 0.45;  // probe just past the body
  const fx = player.pos.x + fwd.x*reach, fz = player.pos.z + fwd.z*reach;
  let best = null;
  for (const c of colliders) {
    if (fx>c.min.x && fx<c.max.x && fz>c.min.z && fz<c.max.z) {
      const rel = c.max.y - player.pos.y;
      if (rel > 0.5 && rel < 1.75) {
        const stand = new THREE.Vector3(fx + fwd.x*0.25, c.max.y, fz + fwd.z*0.25);
        if (spaceFree(player, stand, P.standHeight) && (!best || stand.y < best.y)) best = stand;
      }
    }
  }
  return best;
}

// =========================================================================
//  MOVEMENT
// =========================================================================
function accelerate(dir, wishSpeed, accel, dt) {
  const cur = player.vel.x*dir.x + player.vel.z*dir.z;
  const add = wishSpeed - cur;
  if (add <= 0) return;
  let a = accel*dt*wishSpeed; if (a > add) a = add;
  player.vel.x += dir.x*a; player.vel.z += dir.z*a;
}
function applyFriction(dt) {
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp < 0.01) { player.vel.x = 0; player.vel.z = 0; return; }
  const ns = Math.max(sp - sp*P.friction*dt, 0), f = ns/sp;
  player.vel.x *= f; player.vel.z *= f;
}

// room to stand up at the current spot?
function canStand() { return spaceFree(player, player.pos, P.standHeight); }

// called on the crouch key's first keydown (auto-repeat is ignored)
function pressCrouch() { player.slidePress = 0.16; }

function startMantle(target) {
  player.mantle = { from: player.pos.clone(), to: target.clone(), t: 0 };
  player.vel.set(0,0,0);
  sfxMantle();
}

function updateMovement(dt) {
  // --- MANTLE in progress ---
  if (player.mantle) {
    player.mantle.t += dt / P.mantleDur;
    const k = Math.min(player.mantle.t, 1);
    // up first, then over the edge — the body never cuts through the ledge corner
    const m = player.mantle, ease = x => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
    const ky = ease(k / 0.5), kx = ease((k - 0.5) / 0.5);
    player.pos.set(m.from.x + (m.to.x - m.from.x) * kx,
                   m.from.y + (m.to.y + 0.02 - m.from.y) * ky,
                   m.from.z + (m.to.z - m.from.z) * kx);
    if (k >= 1) {
      player.pos.copy(player.mantle.to);
      const f = new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
      player.vel.set(f.x*3, 0, f.z*3);
      player.mantle = null; player.onGround = true; player.airJumps = 1;
      player.lastSafe.copy(player.pos);
    }
    return;
  }

  const fwd   = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3( Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  let ix=0, iz=0;
  if (keys['KeyW']) iz+=1; if (keys['KeyS']) iz-=1;
  if (keys['KeyD']) ix+=1; if (keys['KeyA']) ix-=1;
  const wish = new THREE.Vector3(right.x*ix + fwd.x*iz, 0, right.z*ix + fwd.z*iz);
  const hasInput = wish.lengthSq() > 0;
  if (hasInput) wish.normalize();

  const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
  const crouch = keys['ControlLeft'] || keys['ControlRight'] || keys['KeyC'];
  player.coyote -= dt; player.jumpBuffer -= dt; player.slidePress -= dt;
  const speedMul = weaponSpeedMul();
  const speedH = Math.hypot(player.vel.x, player.vel.z);

  // --- MANTLE trigger (airborne, moving forward toward a ledge) ---
  if (!player.onGround && iz > 0 && player.vel.y < 4) {
    const ledge = detectLedge();
    if (ledge) { startMantle(ledge); return; }
  }

  // --- WALL RUN ---
  const wall = (!player.onGround && player.vel.y < 6) ? detectWall() : null;
  if (wall && speedH > 4 && !crouch) {
    if (!player.wallrun) player.vel.y = Math.max(player.vel.y, 1.5);
    player.wallrun = wall.side; player.wallNormal.copy(wall.normal);
    player.airJumps = 1;
    const tangent = fwd.clone().sub(wall.normal.clone().multiplyScalar(fwd.dot(wall.normal)));
    if (tangent.lengthSq() < 0.001) tangent.copy(right).multiplyScalar(wall.side);
    tangent.normalize();
    const along = player.vel.x*tangent.x + player.vel.z*tangent.z;
    const target = Math.max(along, P.wallRunBoost);
    player.vel.x = tangent.x*target; player.vel.z = tangent.z*target;
    player.vel.y -= P.wallRunGravity*dt;
    if (player.jumpBuffer > 0) {
      player.vel.y = P.wallJumpUp;
      player.vel.x += wall.normal.x*P.wallJumpOut; player.vel.z += wall.normal.z*P.wallJumpOut;
      player.wallrun = 0; player.jumpBuffer = 0; player.coyote = 0;
      sfxJump(1.1);
    }
  } else {
    player.wallrun = 0;
    if (player.onGround) {
      player.coyote = 0.1; player.airJumps = 1;
      // Fortnite-style slide: ONE slide per crouch press (holding the key never
      // re-triggers it — after the slide you just stay crouched)
      if (player.slidePress > 0 && !player.sliding && speedH > 4.5) {
        player.sliding = true; player.slideTime = 0; player.slidePress = 0;
        const boost = Math.max(speedH, P.run) * P.slideBoost;
        const f = boost / Math.max(speedH, 0.001);
        player.vel.x *= f; player.vel.z *= f;
        sfxSlide();
      }
      if (player.sliding) {
        player.slideTime += dt;
        // end: crouch released (after a short minimum), slowed down or too long
        if ((!crouch && player.slideTime > 0.22) || speedH < 3.2 || player.slideTime > P.slideMaxTime)
          player.sliding = false;
      }
      player.crouching = !player.sliding && (crouch || !canStand());
      if (player.sliding) {
        const drop = speedH * 1.25 * dt, ns = Math.max(speedH - drop, 0);
        if (speedH > 0) { const f = ns/speedH; player.vel.x*=f; player.vel.z*=f; }
        if (hasInput) accelerate(wish, speedH, 14, dt); // gentle steering during slide
      } else {
        applyFriction(dt);
        const ws = player.crouching ? P.crouchSpeed : (sprinting ? P.run : P.walk);
        if (hasInput) accelerate(wish, ws * speedMul, P.groundAccel, dt);
      }
      player.vel.y = -1;
    } else {
      player.sliding = false;
      player.crouching = !canStand();
      if (hasInput) accelerate(wish, (sprinting ? P.run : P.walk) * speedMul, P.airAccel, dt);
      player.vel.y -= P.gravity*dt;
    }

    // JUMP: ground/coyote, else double jump
    if (player.jumpBuffer > 0) {
      if (player.coyote > 0 && canStand()) {
        player.vel.y = P.jump; player.sliding = false; player.crouching = false;
        player.jumpBuffer = 0; player.coyote = 0; player.onGround = false;
        sfxJump(1);
      } else if (player.airJumps > 0) {
        player.vel.y = P.doubleJump; player.airJumps--;
        player.jumpBuffer = 0;
        sfxJump(1.25);
        // little flair: kick arms
        armFlair = 1;
      }
    }
  }
  // collision height: low while sliding / crouching (slide under obstacles)
  const low = player.sliding || player.crouching;
  player.height = low ? P.crouchHeight : P.standHeight;
  const crouchTarget = low ? 1 : (player.wallrun ? 0.6 : 0);
  player.crouchT += (crouchTarget - player.crouchT) * Math.min(1, dt*12);

  const hit = moveBody(player, dt);
  if (hit.landed) {
    player.landKick = Math.min(hit.impact/16, 0.6);
    sfxLand(Math.min(0.15 + hit.impact/40, 0.6));
  }

  const cp = mapState.checkpoints[curCheckpoint];
  if (player.pos.y < (cp && cp.killY !== undefined ? cp.killY : -25)) respawn();
  checkFinish();
  updateCheckpoint();
}

// =========================================================================
//  CAMERA + VIEWMODEL ANIMATION
// =========================================================================
let armFlair = 0;
let bobOffset = 0;

function updateCamera(dt) {
  // head bob from movement
  const sp = Math.hypot(player.vel.x, player.vel.z);
  const moving = player.onGround && sp > 0.5;
  if (moving) player.bobPhase += dt * (6 + sp*0.6);
  const bobY = moving ? Math.sin(player.bobPhase*2) * Math.min(sp*0.004, 0.05) : 0;

  player.landKick *= Math.max(0, 1 - dt*8);

  const eyeH = player.eye - player.crouchT*0.72 + bobY - player.landKick*0.3;
  camera.position.set(player.pos.x, player.pos.y + eyeH, player.pos.z);

  // view = aim + weapon recoil punch (decays back in weapons.js)
  const lim = Math.PI/2 - 0.02;
  const pitch = Math.max(-lim, Math.min(lim, player.pitch + gun.recoilPitch));
  const yaw = player.yaw + gun.recoilYaw;
  const dir = new THREE.Vector3(
    -Math.sin(yaw)*Math.cos(pitch),
     Math.sin(pitch),
    -Math.cos(yaw)*Math.cos(pitch)
  );
  camera.up.set(0,1,0);
  camera.lookAt(camera.position.clone().add(dir));

  let rollTarget = 0;
  if (player.wallrun) rollTarget = player.wallrun*0.18;
  else if (player.sliding) rollTarget = 0.05;
  else rollTarget = Math.sin(player.bobPhase) * (moving ? Math.min(sp*0.002,0.02) : 0);
  player.camRoll += (rollTarget - player.camRoll)*Math.min(1, dt*8);
  camera.rotateZ(player.camRoll);
  if (camShake > 0) {
    camera.rotateX((Math.random() - 0.5) * camShake * 0.06);
    camera.rotateY((Math.random() - 0.5) * camShake * 0.06);
    camShake = Math.max(0, camShake - dt * 3);
  }

  // speed widens the FOV, aiming down sights narrows it
  const fov = (SETTINGS.fov + Math.min(sp*0.7, 16) * (1 - gun.adsT)) * adsFovScale();
  camera.fov += (fov - camera.fov)*Math.min(1, dt*(gun.ads ? 16 : 8));
  camera.updateProjectionMatrix();

  animateViewmodel(dt, sp, moving);
}

function animateViewmodel(dt, sp, moving) {
  const swing = Math.sin(player.bobPhase);
  const amp = Math.min(sp*0.06, 0.7);

  // footstep sound on swing zero-cross
  const sign = swing >= 0 ? 1 : -1;
  if (moving && sign !== player.swingSign) {
    sfxStep(Math.min(0.1 + sp*0.012, 0.28));
  }
  player.swingSign = sign;

  // LEGS follow body position + yaw
  legs.position.set(player.pos.x, player.pos.y, player.pos.z);
  legs.rotation.y = player.yaw;
  let legTargetL, legTargetR;
  if (!player.onGround) { legTargetL = -0.5; legTargetR = 0.7; }        // tuck in air
  else if (player.sliding) { legTargetL = 1.2; legTargetR = 0.6; }      // legs forward
  else if (player.crouching) { legTargetL = 0.9 + swing*amp*0.5; legTargetR = 0.9 - swing*amp*0.5; }
  else { legTargetL = swing*amp; legTargetR = -swing*amp; }
  legL.rotation.x += (legTargetL - legL.rotation.x) * Math.min(1, dt*14);
  legR.rotation.x += (legTargetR - legR.rotation.x) * Math.min(1, dt*14);

  // ARMS (counter-swing) + flair on double jump / wallrun reach
  armFlair *= Math.max(0, 1 - dt*4);
  let aL = armBaseX - swing*amp*0.6 - armFlair*0.8;
  if (player.wallrun === -1) aL = armBaseX - 0.6;   // reach toward left wall
  armL.rotation.x += (aL - armL.rotation.x) * Math.min(1, dt*12);
  // right arm holds the weapon — posed in weapons.js
  animateWeaponArm(dt, swing, amp);
}
