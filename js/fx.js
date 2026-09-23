// =========================================================================
//  FX — particles, bullet holes, tracers
// =========================================================================
const fxGroup = new THREE.Group(); scene.add(fxGroup);

const partGeo  = new THREE.BoxGeometry(1, 1, 1);
const matSpark = new THREE.MeshBasicMaterial({ color: 0xffb347 });
const matDust  = new THREE.MeshBasicMaterial({ color: 0x8d969f });

const particles = [];
function spawnParticle(pos, vel, size, mat, life, gravity = 20) {
  const m = new THREE.Mesh(partGeo, mat);
  m.position.copy(pos); m.scale.setScalar(size);
  m.rotation.set(Math.random()*6, Math.random()*6, 0);
  fxGroup.add(m);
  particles.push({ mesh: m, vel, life, maxLife: life, size, gravity,
                   spin: (Math.random() - 0.5) * 14 });
}

function randomDir(scale) {
  return new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(scale);
}

function spawnImpact(point, normal, onTarget) {
  const n = onTarget ? 6 : 5;
  for (let i = 0; i < n; i++) {
    const v = normal.clone().multiplyScalar(3 + Math.random()*3).add(randomDir(5));
    spawnParticle(point, v, 0.025 + Math.random()*0.03, onTarget ? matAccent : matSpark, 0.25 + Math.random()*0.15);
  }
  if (!onTarget) {
    for (let i = 0; i < 3; i++) {
      const v = normal.clone().multiplyScalar(1 + Math.random()).add(randomDir(1.5));
      spawnParticle(point, v, 0.05 + Math.random()*0.05, matDust, 0.5, 4);
    }
    spawnDecal(point, normal);
  }
}

function spawnDebris(pos) {
  for (let i = 0; i < 16; i++) {
    const v = randomDir(9); v.y += 4;
    spawnParticle(pos.clone().add(randomDir(0.8)), v, 0.08 + Math.random()*0.14,
                  i % 3 === 0 ? matAccent : matWhite, 1.0 + Math.random()*0.5, 22);
  }
}

// ---- bullet holes ----
const decalGeo = new THREE.PlaneGeometry(0.1, 0.1);
const matDecal = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8,
  depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const decals = [], MAX_DECALS = 80;
function spawnDecal(point, normal) {
  const d = new THREE.Mesh(decalGeo, matDecal);
  d.position.copy(point).addScaledVector(normal, 0.004);
  d.lookAt(d.position.clone().add(normal));
  d.rotateZ(Math.random() * Math.PI);
  fxGroup.add(d); decals.push(d);
  if (decals.length > MAX_DECALS) fxGroup.remove(decals.shift());
}

// ---- tracers ----
const tracers = [];
function spawnTracer(from, to) {
  const len = from.distanceTo(to);
  if (len < 0.5) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.85 });
  const m = new THREE.Mesh(partGeo, mat);
  m.scale.set(0.012, 0.012, len);
  m.position.lerpVectors(from, to, 0.5);
  m.lookAt(to);
  fxGroup.add(m);
  tracers.push({ mesh: m, life: 0.06, maxLife: 0.06 });
}

function updateFx(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { fxGroup.remove(p.mesh); particles.splice(i, 1); continue; }
    p.vel.y -= p.gravity * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.y += p.spin * dt;
    p.mesh.scale.setScalar(p.size * Math.min(1, p.life / p.maxLife * 2));
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    if (t.life <= 0) { fxGroup.remove(t.mesh); t.mesh.material.dispose(); tracers.splice(i, 1); continue; }
    t.mesh.material.opacity = 0.85 * t.life / t.maxLife;
  }
}

function clearFx() {
  for (const t of tracers) t.mesh.material.dispose();
  particles.length = 0; tracers.length = 0; decals.length = 0;
  while (fxGroup.children.length) fxGroup.remove(fxGroup.children[0]);
}
