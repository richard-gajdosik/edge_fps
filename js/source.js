// =========================================================================
//  SOURCE MOVEMENT — CS:GO / Source engine style physics for surf maps
// =========================================================================
// A port of the parts of Source's CGameMovement that make surf work:
//   - fixed 128 tick simulation
//   - AirAccelerate with the 30 u/s wish-speed cap  → air strafing gains speed
//   - sv_airaccelerate 150 (standard surf server value)
//   - hull (AABB) traces against convex brushes, TryPlayerMove with
//     ClipVelocity (overbounce 1.0) → you slide along ramp planes
//   - a surface only counts as ground if normal.y >= 0.7 (~45.6°);
//     anything steeper is a surf ramp: you stay "in the air" on it
//   - moving up faster than 140 u/s never grounds you (ramp launches)
//   - auto-bunnyhop: holding SPACE jumps on the landing tick (no friction)
// Units: Source uses inches ("u"); 1 u = 0.0254 m. Constants are given in u.

const U = 0.0254;
const SRC = {
  tick: 1 / 128,
  gravity: 800 * U,
  maxspeed: 250 * U,          // knife / run speed
  accelerate: 5.5,            // sv_accelerate (CS:GO)
  airaccelerate: 150,         // sv_airaccelerate (surf)
  airWishCap: 30 * U,         // hard-coded in AirAccelerate
  friction: 5.2,              // sv_friction (CS:GO)
  stopspeed: 80 * U,
  jumpImpulse: 301.993 * U,   // sqrt(2 * 800 * 57)
  maxvelocity: 3500 * U,      // sv_maxvelocity
  stepsize: 18 * U,
  groundNormal: 0.7,
  launchSpeed: 140 * U,       // faster than this upward = never on ground
  hullHalf: 16 * U,           // 32 u wide hull
  hullHeight: 72 * U,
};
const TRACE_EPS = 0.03125 * U;   // DIST_EPSILON

// ---------- brushes (convex solids: planes n·p <= d) ----------
function planesFromAABB(min, max) {
  return [
    { n: new THREE.Vector3(1, 0, 0),  d:  max.x }, { n: new THREE.Vector3(-1, 0, 0), d: -min.x },
    { n: new THREE.Vector3(0, 1, 0),  d:  max.y }, { n: new THREE.Vector3(0, -1, 0), d: -min.y },
    { n: new THREE.Vector3(0, 0, 1),  d:  max.z }, { n: new THREE.Vector3(0, 0, -1), d: -min.z },
  ];
}
function addBrush(planes, min, max) {
  const b = { planes, min: min.clone(), max: max.clone() };
  brushes.push(b);
  return b;
}

// ramp(x, z0, z1, baseY, peakY, halfW, opts) — a surf ramp running along z.
//   opts.side: 'both' (A-frame), 'left' (face looks toward -x), 'right' (toward +x)
function ramp(x, z0, z1, baseY, peakY, halfW, opts = {}) {
  const side = opts.side || 'both';
  const H = peakY - baseY;
  const xl = side === 'right' ? x : x - halfW;
  const xr = side === 'left'  ? x : x + halfW;
  // cross-section (x, y)
  const pts = side === 'both'  ? [[xl, baseY], [x, peakY], [xr, baseY]]
            : side === 'left'  ? [[xl, baseY], [x, peakY], [x, baseY]]
            :                    [[x, baseY], [x, peakY], [xr, baseY]];
  const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, opts.mat || matWall);
  mesh.position.z = z0;
  mesh.castShadow = true; mesh.receiveShadow = true;
  level.add(mesh);
  const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat);
  line.position.z = z0; level.add(line);
  solids.push(mesh);

  const min = new THREE.Vector3(xl, baseY, z0), max = new THREE.Vector3(xr, peakY, z1);
  const planes = planesFromAABB(min, max);          // axial bevels
  if (side !== 'right') {                            // left slope
    const n = new THREE.Vector3(-H, halfW, 0).normalize();
    planes.push({ n, d: n.x * xl + n.y * baseY });
  }
  if (side !== 'left') {                             // right slope
    const n = new THREE.Vector3(H, halfW, 0).normalize();
    planes.push({ n, d: n.x * xr + n.y * baseY });
  }
  addBrush(planes, min, max);
  return mesh;
}

// ---------- hull trace ----------
// Sweep an AABB (feet position, half width hw, height h) from start to end.
const _c0 = new THREE.Vector3(), _c1 = new THREE.Vector3();
function traceHull(start, end, hw, h) {
  const hh = h / 2;
  _c0.set(start.x, start.y + hh, start.z);
  _c1.set(end.x, end.y + hh, end.z);
  const res = { fraction: 1, normal: null, startsolid: false, endpos: end.clone() };
  const sminx = Math.min(_c0.x, _c1.x) - hw, smaxx = Math.max(_c0.x, _c1.x) + hw;
  const sminy = Math.min(_c0.y, _c1.y) - hh, smaxy = Math.max(_c0.y, _c1.y) + hh;
  const sminz = Math.min(_c0.z, _c1.z) - hw, smaxz = Math.max(_c0.z, _c1.z) + hw;

  for (const b of brushes) {
    if (smaxx < b.min.x || sminx > b.max.x || smaxy < b.min.y || sminy > b.max.y ||
        smaxz < b.min.z || sminz > b.max.z) continue;
    let enter = -1, leave = 1, hitN = null, startOut = false, endOut = false, miss = false;
    for (const p of b.planes) {
      const n = p.n;
      // Minkowski: push the plane out by the box's support distance
      const d = p.d + Math.abs(n.x) * hw + Math.abs(n.y) * hh + Math.abs(n.z) * hw;
      const d1 = n.x * _c0.x + n.y * _c0.y + n.z * _c0.z - d;
      const d2 = n.x * _c1.x + n.y * _c1.y + n.z * _c1.z - d;
      if (d1 > 0) startOut = true;
      if (d2 > 0) endOut = true;
      if (d1 > 0 && (d2 >= TRACE_EPS || d2 >= d1 - 1e-9)) { miss = true; break; }
      if (d1 <= 0 && d2 <= 0) continue;
      if (d1 > d2) {
        const f = Math.max(0, (d1 - TRACE_EPS) / (d1 - d2));
        if (f > enter) { enter = f; hitN = n; }
      } else {
        const f = Math.min(1, (d1 + TRACE_EPS) / (d1 - d2));
        if (f < leave) leave = f;
      }
    }
    if (miss) continue;
    if (!startOut) { res.startsolid = true; if (!endOut) { res.fraction = 0; res.normal = null; } continue; }
    if (enter < leave && enter > -1 && enter < res.fraction) {
      res.fraction = Math.max(0, enter); res.normal = hitN;
    }
  }
  res.endpos.copy(start).lerp(end, res.fraction);
  return res;
}

// ---------- Source movement ----------
function clipVelocity(v, n, overbounce) {
  const backoff = v.dot(n) * overbounce;
  v.addScaledVector(n, -backoff);
  const adjust = v.dot(n);
  if (adjust < 0) v.addScaledVector(n, -adjust);
}

const _end = new THREE.Vector3(), _orig = new THREE.Vector3(), _primal = new THREE.Vector3();
function tryPlayerMove(dt) {
  const planes = [];
  let timeLeft = dt;
  _orig.copy(player.vel); _primal.copy(player.vel);
  for (let bump = 0; bump < 4; bump++) {
    if (player.vel.lengthSq() < 1e-10) break;
    _end.copy(player.pos).addScaledVector(player.vel, timeLeft);
    const tr = traceHull(player.pos, _end, SRC.hullHalf, SRC.hullHeight);
    if (tr.startsolid && tr.fraction === 0) { unstick(); break; }
    if (tr.fraction > 0) { player.pos.copy(tr.endpos); _orig.copy(player.vel); planes.length = 0; }
    if (tr.fraction === 1 || !tr.normal) break;
    if (tr.normal.y > 0.05 && tr.normal.y < SRC.groundNormal) { player.surfing = true; player.surfNormal = tr.normal; }
    timeLeft -= timeLeft * tr.fraction;
    if (planes.length >= 5) { player.vel.set(0, 0, 0); break; }
    // same plane hit twice (float precision): nudge off it instead of
    // treating it as a crease (cross(n, n) = 0 would kill all velocity)
    if (planes.some(pl => pl.dot(tr.normal) > 0.99)) {
      player.vel.addScaledVector(tr.normal, 0.01 * U);
      continue;
    }
    planes.push(tr.normal);

    // find a velocity that slides along every touched plane
    let i;
    for (i = 0; i < planes.length; i++) {
      player.vel.copy(_orig);
      clipVelocity(player.vel, planes[i], 1.0);
      let j;
      for (j = 0; j < planes.length; j++)
        if (j !== i && player.vel.dot(planes[j]) < -1e-7) break;
      if (j === planes.length) break;
    }
    if (i === planes.length) {           // go along the crease
      if (planes.length !== 2) { player.vel.set(0, 0, 0); break; }
      const dir = new THREE.Vector3().crossVectors(planes[0], planes[1]);
      if (dir.lengthSq() < 1e-12) { player.vel.set(0, 0, 0); break; }
      dir.normalize();
      player.vel.copy(dir.multiplyScalar(dir.dot(player.vel)));
    }
    if (player.vel.dot(_primal) <= 0) { player.vel.set(0, 0, 0); break; }
  }
}

function unstick() {
  const tries = [[0, 0.05, 0], [0, 0.15, 0], [0.1, 0, 0], [-0.1, 0, 0], [0, 0, 0.1], [0, 0, -0.1], [0, 0.4, 0]];
  const p = new THREE.Vector3();
  for (const t of tries) {
    p.set(player.pos.x + t[0], player.pos.y + t[1], player.pos.z + t[2]);
    if (!traceHull(p, p, SRC.hullHalf, SRC.hullHeight).startsolid) { player.pos.copy(p); return; }
  }
}

function srcFriction(dt) {
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (sp < 0.1 * U) { player.vel.x = 0; player.vel.z = 0; return; }
  const control = sp < SRC.stopspeed ? SRC.stopspeed : sp;
  const ns = Math.max(sp - control * SRC.friction * dt, 0) / sp;
  player.vel.x *= ns; player.vel.z *= ns;
}

function srcAccelerate(wishdir, wishspeed, accel, dt) {
  const cur = player.vel.dot(wishdir);
  const add = wishspeed - cur;
  if (add <= 0) return;
  const a = Math.min(accel * dt * wishspeed, add);
  player.vel.addScaledVector(wishdir, a);
}

function srcAirAccelerate(wishdir, wishspeed, dt) {
  const ws = Math.min(wishspeed, SRC.airWishCap);      // the magic 30 u/s cap
  const cur = player.vel.dot(wishdir);
  const add = ws - cur;
  if (add <= 0) return;
  const a = Math.min(SRC.airaccelerate * wishspeed * dt, add);
  player.vel.addScaledVector(wishdir, a);
}

function categorizePosition() {
  if (player.vel.y > SRC.launchSpeed) { player.onGround = false; return; }
  _end.copy(player.pos); _end.y -= 2 * U;
  const tr = traceHull(player.pos, _end, SRC.hullHalf, SRC.hullHeight);
  if (tr.normal && tr.fraction < 1 && tr.normal.y >= SRC.groundNormal) {
    player.onGround = true;
    player.pos.copy(tr.endpos);
  } else {
    player.onGround = false;
    if (tr.normal && tr.fraction < 1 && tr.normal.y > 0.05) { player.surfing = true; player.surfNormal = tr.normal; }
  }
}

// ground move with Source-style stair stepping
const _s0 = new THREE.Vector3(), _v0 = new THREE.Vector3(), _dp = new THREE.Vector3(), _dv = new THREE.Vector3();
function walkMove(dt) {
  _s0.copy(player.pos); _v0.copy(player.vel);
  tryPlayerMove(dt);
  _dp.copy(player.pos); _dv.copy(player.vel);
  const flatDist = Math.hypot(_dp.x - _s0.x, _dp.z - _s0.z);
  if (flatDist > Math.hypot(_v0.x, _v0.z) * dt * 0.95) return;   // not blocked
  // try again from one step up, then drop back down
  player.pos.copy(_s0); player.vel.copy(_v0);
  _end.copy(player.pos); _end.y += SRC.stepsize;
  player.pos.copy(traceHull(player.pos, _end, SRC.hullHalf, SRC.hullHeight).endpos);
  tryPlayerMove(dt);
  _end.copy(player.pos); _end.y -= SRC.stepsize;
  const tr = traceHull(player.pos, _end, SRC.hullHalf, SRC.hullHeight);
  const stepDist = Math.hypot(tr.endpos.x - _s0.x, tr.endpos.z - _s0.z);
  if (tr.normal && tr.normal.y >= SRC.groundNormal && stepDist > flatDist) {
    player.pos.copy(tr.endpos);
  } else { player.pos.copy(_dp); player.vel.copy(_dv); }
}

const _wish = new THREE.Vector3();
function sourceTick(dt) {
  const fwdX = -Math.sin(player.yaw), fwdZ = -Math.cos(player.yaw);
  const rgtX =  Math.cos(player.yaw), rgtZ = -Math.sin(player.yaw);
  let fm = 0, sm = 0;
  if (keys['KeyW']) fm += 1; if (keys['KeyS']) fm -= 1;
  if (keys['KeyD']) sm += 1; if (keys['KeyA']) sm -= 1;
  _wish.set(fwdX * fm + rgtX * sm, 0, fwdZ * fm + rgtZ * sm);
  let wishspeed = 0;
  if (_wish.lengthSq() > 0) { _wish.normalize(); wishspeed = SRC.maxspeed * weaponSpeedMul(); }
  player.surfing = false;

  // StartGravity (half before the move, half after — like Source)
  player.vel.y -= SRC.gravity * 0.5 * dt;

  // auto-bunnyhop: holding space jumps on the landing tick, before friction
  if (player.onGround && (keys['Space'] || player.jumpBuffer > 0)) {
    player.vel.y = SRC.jumpImpulse;
    player.onGround = false; player.jumpBuffer = 0;
    sfxJump(1);
  }

  if (player.onGround) {
    player.vel.y = 0;
    srcFriction(dt);
    srcAccelerate(_wish, wishspeed, SRC.accelerate, dt);
    const sp = Math.hypot(player.vel.x, player.vel.z);
    if (sp > SRC.maxspeed * 1.0001 && wishspeed > 0) { const k = SRC.maxspeed / sp; player.vel.x *= k; player.vel.z *= k; }
    walkMove(dt);
  } else {
    srcAirAccelerate(_wish, wishspeed, dt);
    tryPlayerMove(dt);
  }

  const wasAir = !player.onGround, vyBefore = player.vel.y;
  categorizePosition();
  if (player.onGround) {
    player.vel.y = 0;
    if (wasAir && vyBefore < -4) {
      player.landKick = Math.min(-vyBefore / 16, 0.6);
      sfxLand(Math.min(0.15 - vyBefore / 40, 0.6));
    }
  } else player.vel.y -= SRC.gravity * 0.5 * dt;          // FinishGravity

  // sv_maxvelocity clamps each axis
  const mv = SRC.maxvelocity;
  player.vel.x = THREE.MathUtils.clamp(player.vel.x, -mv, mv);
  player.vel.y = THREE.MathUtils.clamp(player.vel.y, -mv, mv);
  player.vel.z = THREE.MathUtils.clamp(player.vel.z, -mv, mv);
}

let srcAccum = 0;
function updateSourceMovement(dt) {
  player.hw = SRC.hullHalf; player.height = SRC.hullHeight;
  player.sliding = false; player.crouching = false; player.wallrun = 0; player.mantle = null;
  player.crouchT += (0 - player.crouchT) * Math.min(1, dt * 12);
  player.jumpBuffer -= dt;
  srcAccum += dt;
  let n = 0;
  while (srcAccum >= SRC.tick && n < 20) { sourceTick(SRC.tick); srcAccum -= SRC.tick; n++; }
  if (n >= 20) srcAccum = 0;

  const cp = mapState.checkpoints[curCheckpoint];
  if (player.pos.y < (cp.killY !== undefined ? cp.killY : -25)) respawn();
  checkFinish();
  updateCheckpoint();
}
