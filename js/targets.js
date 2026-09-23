// =========================================================================
//  TARGETS — shootable panels (red bullseye = critical hit)
// =========================================================================
const targets = [];
const TARGET_HP = 100;
const TARGET_RESPAWN = 3;   // seconds, only on maps with respawnTargets

const tgtPanelGeo = new THREE.BoxGeometry(1.1, 1.1, 0.12);
const tgtRingGeo  = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 24);
const tgtBullGeo  = new THREE.CylinderGeometry(0.19, 0.19, 0.16, 20);
const tgtPoleGeo  = new THREE.BoxGeometry(0.1, 1, 0.1);
[tgtPanelGeo, tgtRingGeo, tgtBullGeo, tgtPoleGeo].forEach(g => g.userData.shared = true);
const matTgtRing = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });

// addTarget(x, y, z, opts) — y is the panel CENTER.
//   opts.rotY  → turn the panel (0 = faces ±z, PI/2 = faces ±x)
//   opts.pole  → length of a stand below the panel
//   opts.move  → { axis:[x,y,z], amp, speed } sine motion around the spawn point
function addTarget(x, y, z, opts = {}) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = opts.rotY || 0;

  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9,
                                                    emissive: 0xe63030, emissiveIntensity: 0 });
  applyRimShader(panelMat);
  const panel = new THREE.Mesh(tgtPanelGeo, panelMat);
  panel.userData.ownMaterial = true;
  const ring = new THREE.Mesh(tgtRingGeo, matTgtRing); ring.rotation.x = Math.PI/2;
  const bull = new THREE.Mesh(tgtBullGeo, matAccent);  bull.rotation.x = Math.PI/2;
  for (const m of [panel, ring, bull]) { m.castShadow = true; g.add(m); }
  if (opts.pole) {
    const p = new THREE.Mesh(tgtPoleGeo, matGray);
    p.scale.y = opts.pole; p.position.y = -0.55 - opts.pole/2; p.castShadow = true;
    g.add(p);
  }
  level.add(g);

  const t = {
    group: g, panelMat, hp: TARGET_HP, alive: true, respawnAt: 0, flash: 0,
    base: g.position.clone(), move: opts.move || null, phase: Math.random() * Math.PI * 2,
    hitMeshes: [panel, ring, bull],
  };
  for (const m of t.hitMeshes) m.userData.target = t;
  bull.userData.crit = true;
  targets.push(t);
  return t;
}

function aliveTargetMeshes() {
  const out = [];
  for (const t of targets) if (t.alive) out.push(...t.hitMeshes);
  return out;
}

// returns true when the hit destroyed the target
function damageTarget(t, dmg, time) {
  if (!t.alive) return false;
  t.hp -= dmg; t.flash = 1;
  t.group.scale.setScalar(0.88);
  if (t.hp > 0) return false;
  t.alive = false; t.group.visible = false;
  t.respawnAt = time + TARGET_RESPAWN;
  spawnDebris(t.group.position);
  sfxBreak();
  onTargetDestroyed(t);
  return true;
}

function reviveTarget(t) {
  t.alive = true; t.hp = TARGET_HP; t.group.visible = true;
  t.group.scale.setScalar(0.01);
}
function resetTargets() { for (const t of targets) reviveTarget(t); }

function updateTargets(dt, time) {
  const respawn = mapState.def && mapState.def.respawnTargets;
  for (const t of targets) {
    if (!t.alive) { if (respawn && time > t.respawnAt) reviveTarget(t); else continue; }
    if (t.move) {
      const s = Math.sin(time * t.move.speed + t.phase) * t.move.amp;
      t.group.position.set(t.base.x + t.move.axis[0]*s, t.base.y + t.move.axis[1]*s, t.base.z + t.move.axis[2]*s);
    }
    t.flash = Math.max(0, t.flash - dt * 8);
    t.panelMat.emissiveIntensity = t.flash * 0.7;
    const sc = t.group.scale.x + (1 - t.group.scale.x) * Math.min(1, dt * 12);
    t.group.scale.setScalar(sc);
  }
}
