// =========================================================================
//  ENVIRONMENT — sky dome with sun, low-poly backdrop (skyline, terrain,
//  clouds). Shared by all maps, never cleared by loadMap().
// =========================================================================

// deterministic random so the backdrop is the same every load
let _seed = 1337;
function srand() { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; }

// ---------- sky dome ----------
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1500, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      uTop:      { value: new THREE.Color(MOOD.skyTop) },
      uHorizon:  { value: new THREE.Color(MOOD.skyHorizon) },
      uBottom:   { value: new THREE.Color(MOOD.skyBottom) },
      uSunColor: { value: new THREE.Color(MOOD.sunColor) },
      uSunDir:   { value: MOOD.sunDir },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uBottom, uSunColor, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.55, h), 0.65));
        col = mix(col, uBottom, smoothstep(0.0, -0.2, h));
        float s = max(dot(d, uSunDir), 0.0);
        // warm haze band around the sun near the horizon
        col = mix(col, uSunColor, pow(s, 4.0) * exp(-abs(h) * 6.0) * 0.45);
        // glow + disc
        col += uSunColor * (pow(s, 24.0) * 0.35 + pow(s, 260.0) * 0.8);
        col = mix(col, vec3(1.0, 0.95, 0.85), smoothstep(0.9989, 0.9993, s));
        // subtle banding for a stylised, low-poly sky
        col = floor(col * 48.0 + 0.5) / 48.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
sky.renderOrder = -1;
scene.add(sky);

const backdrop = new THREE.Group(); scene.add(backdrop);
// backdrop is centred between both maps (arena at origin, parkour 0..210 on z)
const BACK_CENTER = new THREE.Vector3(0, 0, 100);

// ---------- low-poly terrain far below the course ----------
(function buildTerrain() {
  const geo = new THREE.PlaneGeometry(2400, 2400, 70, 70);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const n = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 14
            + Math.sin(x * 0.041 + z * 0.027) * 5
            + (srand() - 0.5) * 6;
    // flat-ish valley under the play area, hills rising toward the horizon
    pos.setY(i, n + Math.max(0, r - 260) * 0.12);
  }
  const terrain = new THREE.Mesh(geo.toNonIndexed(), new THREE.MeshStandardMaterial({
    color: 0x4a3f45, roughness: 1, flatShading: true,
  }));
  terrain.geometry.computeVertexNormals();
  terrain.position.set(BACK_CENTER.x, -70, BACK_CENTER.z);
  terrain.receiveShadow = false;
  backdrop.add(terrain);
})();

// ---------- skyline: tall low-poly towers in a ring around the maps ----------
(function buildSkyline() {
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const mats = [0x5a5058, 0x6b5f63, 0x4a4450, 0x7a6c6a].map(c =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  const lit = new THREE.MeshStandardMaterial({ color: 0xff5a2a, emissive: 0xff3a10, emissiveIntensity: 0.9 });
  for (let i = 0; i < 120; i++) {
    const a = srand() * Math.PI * 2;
    const r = 250 + srand() * 230;
    const w = 12 + srand() * 26, d = 12 + srand() * 26;
    const h = 50 + srand() * srand() * 150;
    const x = BACK_CENTER.x + Math.cos(a) * r, z = BACK_CENTER.z + Math.sin(a) * r;
    const m = new THREE.Mesh(unit, mats[i % mats.length]);
    m.scale.set(w, h, d);
    m.position.set(x, -70 + h / 2, z);
    m.rotation.y = Math.floor(srand() * 4) * Math.PI / 8;
    backdrop.add(m);
    // occasional stepped top
    if (srand() < 0.4) {
      const t = new THREE.Mesh(unit, m.material);
      t.scale.set(w * 0.6, 8 + srand() * 20, d * 0.6);
      t.position.set(x, -70 + h + t.scale.y / 2, z); t.rotation.y = m.rotation.y;
      backdrop.add(t);
    }
    // a thin glowing accent line on some towers
    if (srand() < 0.25) {
      const l = new THREE.Mesh(unit, lit);
      l.scale.set(w * 1.02, 0.8, d * 1.02);
      l.position.set(x, -70 + h * (0.5 + srand() * 0.45), z); l.rotation.y = m.rotation.y;
      backdrop.add(l);
    }
  }
})();

// ---------- low-poly clouds ----------
const clouds = new THREE.Group(); backdrop.add(clouds);
(function buildClouds() {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8c3ad, roughness: 1, flatShading: true,
                                               emissive: 0x3a2430, emissiveIntensity: 0.6, fog: false });
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    const a = srand() * Math.PI * 2, r = 500 + srand() * 600;
    g.position.set(BACK_CENTER.x + Math.cos(a) * r, 200 + srand() * 160, BACK_CENTER.z + Math.sin(a) * r);
    const parts = 3 + Math.floor(srand() * 4);
    for (let j = 0; j < parts; j++) {
      const p = new THREE.Mesh(geo, mat);
      const s = 12 + srand() * 16;
      p.scale.set(s * 1.8, s * 0.32, s * 1.1);
      p.position.set((j - parts / 2) * s * 1.2, srand() * 4, (srand() - 0.5) * s * 0.8);
      p.rotation.set(0, srand() * 3, 0);
      g.add(p);
    }
    clouds.add(g);
  }
})();

function updateEnvironment(dt) {
  clouds.rotation.y += dt * 0.002;
}

// ---------- film grain texture for the #grain overlay (generated, no files) ----------
(function buildGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255;
  }
  g.putImageData(img, 0, 0);
  document.getElementById('grain').style.backgroundImage = `url(${c.toDataURL()})`;
})();
