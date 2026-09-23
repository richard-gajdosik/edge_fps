// =========================================================================
//  LEVEL — geometry helpers, collider registry, map registry + loading
// =========================================================================
// Everything a map builds goes into `level`, so switching maps is just
// clearLevel() + build(). Maps live in js/maps/*.js and call registerMap().

const level = new THREE.Group(); scene.add(level);
const colliders = [];   // AABBs for the player
const solids = [];      // meshes bullets can hit (level geometry)
const brushes = [];     // convex solids for Source-style hull traces (surf maps)

const MAPS = {}, mapOrder = [];
function registerMap(def) { MAPS[def.id] = def; mapOrder.push(def.id); }

const mapState = {
  id: null, def: null,
  start: new THREE.Vector3(), startYaw: 0,
  checkpoints: [], finish: null, finishZone: null,
};

// box(x, y, z, w, h, d) — x/z are the center, y is the BOTTOM of the box.
// opts.wall  → wall-runnable surface
// opts.edges → false to skip the dark outline
// opts.solid → false for decoration (no collision, bullets pass)
function box(x, y, z, w, h, d, mat = matWhite, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y + h/2, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  level.add(mesh);
  if (opts.edges !== false) {
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat);
    line.position.copy(mesh.position);
    level.add(line);
  }
  if (opts.solid === false) { mesh.castShadow = false; return mesh; }   // decoration only
  colliders.push({
    min: new THREE.Vector3(x - w/2, y, z - d/2),
    max: new THREE.Vector3(x + w/2, y + h, z + d/2),
    wall: !!opts.wall
  });
  const bmin = new THREE.Vector3(x - w/2, y, z - d/2), bmax = new THREE.Vector3(x + w/2, y + h, z + d/2);
  brushes.push({ planes: planesFromAABB(bmin, bmax), min: bmin, max: bmax });
  solids.push(mesh);
  return mesh;
}

// addCheckpoint(x, y, z, opts)
//   opts.zone  → { min:{x,y,z}, max:{x,y,z} } trigger box (partial is fine, e.g. only min.z)
//                instead of "within 5 m of the point"
//   opts.killY → falling below this height sends you back to this checkpoint
function addCheckpoint(x, y, z, opts = {}) {
  const c = new THREE.Vector3(x, y, z);
  c.zone = opts.zone || null; c.killY = opts.killY;
  mapState.checkpoints.push(c);
}
function setFinish(x, y, z) { mapState.finish = new THREE.Vector3(x, y, z); }
function setFinishZone(min, max) { mapState.finishZone = { min, max }; }
function inZone(p, z) {
  const mn = z.min || {}, mx = z.max || {};
  return !(p.x < (mn.x ?? -Infinity) || p.y < (mn.y ?? -Infinity) || p.z < (mn.z ?? -Infinity) ||
           p.x > (mx.x ?? Infinity)  || p.y > (mx.y ?? Infinity)  || p.z > (mx.z ?? Infinity));
}

function clearLevel() {
  level.traverse(o => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material && o.userData.ownMaterial) o.material.dispose();
  });
  while (level.children.length) level.remove(level.children[0]);
  colliders.length = 0; solids.length = 0; brushes.length = 0; targets.length = 0; bots.length = 0;
  clearFx();
}

function loadMap(id) {
  const def = MAPS[id] || MAPS[mapOrder[0]];
  clearLevel();
  mapState.id = def.id; mapState.def = def;
  mapState.start.copy(def.start); mapState.startYaw = def.startYaw || 0;
  const start = def.start.clone(); start.killY = def.killY;
  mapState.checkpoints = [start];
  mapState.finish = null; mapState.finishZone = null;
  player.hw = 0.4;
  def.build();

  // checkpoint rings
  mapState.checkpoints.forEach((c, i) => {
    if (i === 0 || def.noRings) return;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xff4a24 }));
    ring.position.copy(c); ring.position.y += 0.2; ring.rotation.x = Math.PI/2;
    ring.userData.spin = true; ring.userData.ownMaterial = true;
    level.add(ring);
  });
}

