// =========================================================================
//  LEVEL — geometry helpers, collider registry, map registry + loading
// =========================================================================
// Everything a map builds goes into `level`, so switching maps is just
// clearLevel() + build(). Maps live in js/maps/*.js and call registerMap().

const level = new THREE.Group(); scene.add(level);
const colliders = [];   // AABBs for the player
const solids = [];      // meshes bullets can hit (level geometry)

const MAPS = {}, mapOrder = [];
function registerMap(def) { MAPS[def.id] = def; mapOrder.push(def.id); }

const mapState = {
  id: null, def: null,
  start: new THREE.Vector3(), startYaw: 0,
  checkpoints: [], finish: null,
};

// box(x, y, z, w, h, d) — x/z are the center, y is the BOTTOM of the box.
// opts.wall  → wall-runnable surface
// opts.edges → false to skip the dark outline
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
  colliders.push({
    min: new THREE.Vector3(x - w/2, y, z - d/2),
    max: new THREE.Vector3(x + w/2, y + h, z + d/2),
    wall: !!opts.wall
  });
  solids.push(mesh);
  return mesh;
}

function addCheckpoint(x, y, z) { mapState.checkpoints.push(new THREE.Vector3(x, y, z)); }
function setFinish(x, y, z) { mapState.finish = new THREE.Vector3(x, y, z); }

function clearLevel() {
  level.traverse(o => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material && o.userData.ownMaterial) o.material.dispose();
  });
  while (level.children.length) level.remove(level.children[0]);
  colliders.length = 0; solids.length = 0; targets.length = 0;
  clearFx();
}

function loadMap(id) {
  const def = MAPS[id] || MAPS[mapOrder[0]];
  clearLevel();
  mapState.id = def.id; mapState.def = def;
  mapState.start.copy(def.start); mapState.startYaw = def.startYaw || 0;
  mapState.checkpoints = [def.start.clone()];
  mapState.finish = null;
  def.build();

  // checkpoint rings
  mapState.checkpoints.forEach((c, i) => {
    if (i === 0) return;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xe63030 }));
    ring.position.copy(c); ring.position.y += 0.2; ring.rotation.x = Math.PI/2;
    ring.userData.spin = true; ring.userData.ownMaterial = true;
    level.add(ring);
  });
}

const grid = new THREE.GridHelper(600, 120, 0xc4cbd2, 0xdde2e7);
grid.position.y = -30; scene.add(grid);
