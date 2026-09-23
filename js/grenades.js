// =========================================================================
//  GRENADES — bouncing projectiles, explosion damage + knockback
// =========================================================================
// Knockback also hits the player: a grenade under your feet = grenade jump.

const NADE_R = 0.1, NADE_FUSE = 1.8;
const BLAST_R = 6.5, BLAST_DMG = 150, SELF_DMG = 0.35, BLAST_PUSH = 12;

const grenades = [];
const _gb = { min: new THREE.Vector3(), max: new THREE.Vector3() };

function pointBlocked(p, r) {
  _gb.min.set(p.x - r, p.y - r, p.z - r); _gb.max.set(p.x + r, p.y + r, p.z + r);
  for (const c of colliders) if (overlap(_gb, c)) return c;
  // sloped brushes (surf ramps) — point inside all planes, inflated by r
  for (const b of brushes) {
    if (b.planes.length <= 6) continue;          // plain boxes are covered above
    if (b.planes.every(pl => pl.n.dot(p) <= pl.d + r)) return b;
  }
  return null;
}

function spawnGrenade(pos, vel) {
  const mesh = new THREE.Mesh(nadeGeo, matNade);
  mesh.castShadow = true;
  mesh.position.copy(pos);
  fxGroup.add(mesh);
  grenades.push({ mesh, pos: pos.clone(), vel: vel.clone(), fuse: NADE_FUSE,
                  spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0) });
}

function updateGrenades(dt, time) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.fuse -= dt;
    if (g.fuse <= 0) {
      fxGroup.remove(g.mesh); grenades.splice(i, 1);
      explode(g.pos, time);
      continue;
    }
    g.vel.y -= 22 * dt;
    const steps = Math.max(1, Math.ceil(g.vel.length() * dt / 0.08));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const ax of ['x', 'y', 'z']) {
        const prev = g.pos[ax];
        g.pos[ax] += g.vel[ax] * h;
        if (pointBlocked(g.pos, NADE_R)) {
          g.pos[ax] = prev;
          const sp = Math.abs(g.vel[ax]);
          if (sp > 2) sfxBounce(sp * 0.01);
          g.vel[ax] *= -0.4;
          // friction on the other axes when it hits the ground
          if (ax === 'y') { g.vel.x *= 0.7; g.vel.z *= 0.7; }
          g.spin.multiplyScalar(0.7);
        }
      }
    }
    g.mesh.position.copy(g.pos);
    g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt;
    if (g.pos.y < -80) { fxGroup.remove(g.mesh); grenades.splice(i, 1); }
  }
}

// ---- explosion ----
const blastGeo = new THREE.IcosahedronGeometry(1, 1);
const blasts = [];
const blastLight = new THREE.PointLight(0xff8a3a, 0, 30, 2);
scene.add(blastLight);

function explode(pos, time) {
  // visuals
  const mat = new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0.9 });
  const m = new THREE.Mesh(blastGeo, mat);
  m.position.copy(pos); m.scale.setScalar(0.5);
  fxGroup.add(m);
  blasts.push({ mesh: m, t: 0 });
  blastLight.position.copy(pos); blastLight.intensity = 8;
  for (let i = 0; i < 22; i++) {
    const v = randomDir(16); v.y = Math.abs(v.y) + 3;
    spawnParticle(pos, v, 0.08 + Math.random() * 0.12, i % 2 ? matSpark : matAccent, 0.5 + Math.random() * 0.4, 18);
  }
  for (let i = 0; i < 10; i++) {
    const v = randomDir(4); v.y = Math.abs(v.y) + 1.5;
    spawnParticle(pos.clone().add(randomDir(1.5)), v, 0.4 + Math.random() * 0.4, matSmoke, 1.3 + Math.random() * 0.6, -1);
  }
  const pd = pos.distanceTo(camera.position);
  sfxExplosion(Math.max(0.25, 1 - pd / 60));
  addShake(Math.max(0, 1.2 - pd / 25));

  // damage + knockback
  for (const t of targets) {
    if (!t.alive) continue;
    const d = t.group.position.distanceTo(pos);
    if (d < BLAST_R) damageTarget(t, BLAST_DMG * (1 - d / BLAST_R) + 20, time);
  }
  for (const b of bots) {
    if (!b.alive) continue;
    const c = b.pos.clone(); c.y += b.height * 0.5;
    const d = c.distanceTo(pos);
    if (d < BLAST_R) {
      const k = 1 - d / BLAST_R;
      pushBody(b, c, pos, k);
      if (damageBot(b, BLAST_DMG * k + 10, time)) showHitmarker(true);
    }
  }
  const pc = player.pos.clone(); pc.y += player.height * 0.5;
  const d = pc.distanceTo(pos);
  if (d < BLAST_R) {
    const k = 1 - d / BLAST_R;
    pushBody(player, pc, pos, k);
    player.sliding = false; player.wallrun = 0; player.mantle = null;
    damagePlayer(BLAST_DMG * k * SELF_DMG, pos, time);
  }
}

function pushBody(b, center, from, k) {
  const dir = center.clone().sub(from);
  if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
  dir.normalize();
  b.vel.addScaledVector(dir, BLAST_PUSH * k);
  b.vel.y = Math.max(b.vel.y, 0) + BLAST_PUSH * 0.45 * k;
  b.onGround = false;
}

function updateBlasts(dt) {
  blastLight.intensity = Math.max(0, blastLight.intensity - dt * 30);
  for (let i = blasts.length - 1; i >= 0; i--) {
    const b = blasts[i];
    b.t += dt;
    const k = b.t / 0.35;
    if (k >= 1) { fxGroup.remove(b.mesh); b.mesh.material.dispose(); blasts.splice(i, 1); continue; }
    b.mesh.scale.setScalar(0.5 + (BLAST_R * 0.55) * (1 - Math.pow(1 - k, 3)));
    b.mesh.material.opacity = 0.9 * (1 - k);
  }
}

function clearGrenades() {
  for (const b of blasts) b.mesh.material.dispose();
  grenades.length = 0; blasts.length = 0; blastLight.intensity = 0;
}
