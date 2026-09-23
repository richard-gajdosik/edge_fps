// =========================================================================
//  PHYSICS — robust AABB movement for any body (player, bots)
// =========================================================================
// body = { pos, vel, hw, height, onGround, lastSafe }
//
// Why it can't tunnel / fall through anymore:
//  - movement is sub-stepped so no step moves more than MAX_STEP
//  - every axis resolves by where the body CAME FROM (previous position),
//    never by the sign of the velocity, so a tiny float overlap can never
//    teleport the body to the far side of a box (the old "fell under the
//    floor after jumping next to a wall" bug)
//  - a final depenetration pass pushes out sideways / up, never down
//  - if the body is still stuck, it snaps back to the last safe position

const MAX_STEP = 0.2;     // meters per sub-step
const SKIN = 0.002;       // gap kept between body and walls
const EPS = 1e-4;
const STEP_UP = 0.35;     // small ledges are walked onto automatically

const _bb = { min: new THREE.Vector3(), max: new THREE.Vector3() };
function bodyBox(b, pos = b.pos, height = b.height, shrink = 0) {
  _bb.min.set(pos.x - b.hw + shrink, pos.y + shrink,          pos.z - b.hw + shrink);
  _bb.max.set(pos.x + b.hw - shrink, pos.y + height - shrink, pos.z + b.hw - shrink);
  return _bb;
}
function overlap(a, b) {
  return a.min.x < b.max.x && a.max.x > b.min.x &&
         a.min.y < b.max.y && a.max.y > b.min.y &&
         a.min.z < b.max.z && a.max.z > b.min.z;
}
function overlapsAny(b, pos = b.pos, height = b.height, shrink = EPS) {
  const box = bodyBox(b, pos, height, shrink);
  for (const c of colliders) if (overlap(box, c)) return c;
  return null;
}
const _tp = new THREE.Vector3();
function spaceFree(b, pos, height = b.height) { return !overlapsAny(b, pos, height, 0.01); }

function resolveHorizontal(b, axis, prev, allowStep) {
  const box = bodyBox(b, b.pos, b.height, EPS);
  for (const c of colliders) {
    if (!overlap(box, c)) continue;
    // walk up small ledges instead of stopping
    if (allowStep && c.max.y - b.pos.y <= STEP_UP && c.max.y - b.pos.y > 0) {
      _tp.copy(b.pos); _tp.y = c.max.y + SKIN;
      if (spaceFree(b, _tp)) { b.pos.y = _tp.y; bodyBox(b, b.pos, b.height, EPS); continue; }
    }
    if (prev + b.hw <= c.min[axis] + EPS)      b.pos[axis] = c.min[axis] - b.hw - SKIN;
    else if (prev - b.hw >= c.max[axis] - EPS) b.pos[axis] = c.max[axis] + b.hw + SKIN;
    else continue;                  // was already overlapping on this axis → depenetrate later
    b.vel[axis] = 0;
    bodyBox(b, b.pos, b.height, EPS);
  }
}

function resolveVertical(b, prevY) {
  let ground = false;
  const box = bodyBox(b, b.pos, b.height, EPS);
  for (const c of colliders) {
    if (!overlap(box, c)) continue;
    if (prevY >= c.max.y - EPS) {                       // came from above → land
      b.pos.y = c.max.y;
      if (b.vel.y < 0) b.vel.y = 0;
      ground = true;
    } else if (prevY + b.height <= c.min.y + EPS) {     // came from below → bonk head
      b.pos.y = c.min.y - b.height - SKIN;
      if (b.vel.y > 0) b.vel.y = 0;
    } else continue;
    bodyBox(b, b.pos, b.height, EPS);
  }
  return ground;
}

// push out of anything we are still inside: sideways or up, never down
function depenetrate(b) {
  for (let iter = 0; iter < 4; iter++) {
    const c = overlapsAny(b);
    if (!c) return true;
    const opts = [
      { ax: 'x', d: c.max.x - (b.pos.x - b.hw) + SKIN },
      { ax: 'x', d: -((b.pos.x + b.hw) - c.min.x + SKIN) },
      { ax: 'z', d: c.max.z - (b.pos.z - b.hw) + SKIN },
      { ax: 'z', d: -((b.pos.z + b.hw) - c.min.z + SKIN) },
      { ax: 'y', d: c.max.y - b.pos.y },
    ];
    opts.sort((p, q) => Math.abs(p.d) - Math.abs(q.d));
    const o = opts[0];
    b.pos[o.ax] += o.d;
    if (o.ax !== 'y') b.vel[o.ax] = 0; else if (b.vel.y < 0) b.vel.y = 0;
  }
  return !overlapsAny(b);
}

// returns { landed, impact }
function moveBody(b, dt) {
  const wasAir = !b.onGround;
  b.onGround = false;
  let landed = false, impact = 0;

  const travel = Math.max(Math.abs(b.vel.x), Math.abs(b.vel.y), Math.abs(b.vel.z)) * dt;
  const steps = Math.min(12, Math.max(1, Math.ceil(travel / MAX_STEP)));
  const h = dt / steps;

  for (let s = 0; s < steps; s++) {
    const allowStep = !wasAir || b.onGround;
    let prev = b.pos.x; b.pos.x += b.vel.x * h; resolveHorizontal(b, 'x', prev, allowStep);
    prev = b.pos.z;     b.pos.z += b.vel.z * h; resolveHorizontal(b, 'z', prev, allowStep);
    const vy = b.vel.y;
    prev = b.pos.y;     b.pos.y += b.vel.y * h;
    if (resolveVertical(b, prev)) {
      if (wasAir && !landed && vy < -4) { landed = true; impact = -vy; }
      b.onGround = true;
    }
  }

  if (!depenetrate(b) && b.lastSafe) { b.pos.copy(b.lastSafe); b.vel.set(0, 0, 0); }
  if (b.onGround && b.lastSafe && !overlapsAny(b)) b.lastSafe.copy(b.pos);
  return { landed, impact };
}
