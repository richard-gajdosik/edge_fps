// =========================================================================
//  ENGINE — scene, camera, renderer, lights, shared materials
// =========================================================================
const app = document.getElementById('app');

// ---------- Mood / palette (dusk) ----------
// One place to retune the whole look: sky gradient, fog, sun.
const MOOD = {
  skyTop:     0x1f2838,
  skyHorizon: 0xc98a6c,
  skyBottom:  0x2b2530,
  sunColor:   0xffc08a,
  sunDir:     new THREE.Vector3(0.42, 0.42, 0.87).normalize(),  // low, warm sun ahead of the parkour course
  sunIntensity: 2.3,
  hemiSky:    0x6d7fa3,
  hemiGround: 0x5a4640,
  hemiIntensity: 0.8,
  fogNear:    15,
  fogFar:     430,
  exposure:   1.05,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(MOOD.skyHorizon);
// fog runs after tone mapping in r128, so its color matches the sky horizon exactly
scene.fog = new THREE.Fog(MOOD.skyHorizon, MOOD.fogNear, MOOD.fogFar);

const camera = new THREE.PerspectiveCamera(80, innerWidth/innerHeight, 0.02, 2000);
scene.add(camera); // so viewmodel arms (camera children) render

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = MOOD.exposure;
app.appendChild(renderer.domElement);

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(MOOD.hemiSky, MOOD.hemiGround, MOOD.hemiIntensity));
const sun = new THREE.DirectionalLight(MOOD.sunColor, MOOD.sunIntensity);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = 60;
sun.shadow.camera.left=-sc; sun.shadow.camera.right=sc; sun.shadow.camera.top=sc; sun.shadow.camera.bottom=-sc;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);

// the shadow frustum follows the player so long maps keep their shadows;
// the sky dome follows the camera so it is always "infinitely" far
function updateSun(focus) {
  sun.position.copy(focus).addScaledVector(MOOD.sunDir, 200);
  sun.target.position.copy(focus);
  if (typeof sky !== 'undefined') sky.position.copy(camera.position);
}

// ---------- Materials (warm concrete + glowing accent) ----------
const matWhite  = new THREE.MeshStandardMaterial({ color: 0xe4dbcf, roughness: 0.92 });
const matLight  = new THREE.MeshStandardMaterial({ color: 0xc9c0b4, roughness: 1 });
const matGray   = new THREE.MeshStandardMaterial({ color: 0x8a8a92, roughness: 1 });
const matAccent = new THREE.MeshStandardMaterial({ color: 0xff4a24, roughness: 0.5,
                                                   emissive: 0xff3010, emissiveIntensity: 0.45 });
const matWall   = new THREE.MeshStandardMaterial({ color: 0xd6cdc0, roughness: 0.9 });
const edgeMat   = new THREE.LineBasicMaterial({ color: 0x140f12, transparent: true, opacity: 0.28 });

// ---------- Custom surface shader ----------
// Injected into MeshStandardMaterial via onBeforeCompile, so real lights and
// shadows keep working. Adds:
//   - fake AO by face orientation (tops bright, undersides dark)
//   - fresnel darkening at silhouettes (shapes read against the haze)
//   - world-space concrete panel seams every 2 m + per-panel tint variation
//     (low-poly look with some texture, no image files)
function applyRimShader(mat, panels = true) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 vWPos;\nvarying vec3 vWN;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vWN = normalize(mat3(modelMatrix) * normal);`
    );
    shader.fragmentShader = 'varying vec3 vWPos;\nvarying vec3 vWN;\n' + shader.fragmentShader.replace(
      '#include <output_fragment>',
      `float _fres = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
       float _ao = 0.62 + 0.38 * clamp(vWN.y * 0.5 + 0.5, 0.0, 1.0);
       outgoingLight *= _ao;
       outgoingLight = mix(outgoingLight, outgoingLight * 0.5, _fres * 0.8);
       ${panels ? `
       vec3 _an = abs(vWN);
       vec2 _uv = (_an.y > 0.5 ? vWPos.xz : (_an.x > 0.5 ? vWPos.zy : vWPos.xy)) * 0.5;
       vec2 _f = fract(_uv);
       vec2 _d = min(_f, 1.0 - _f) / max(fwidth(_uv), vec2(1e-4));
       float _line = 1.0 - clamp(min(_d.x, _d.y) / 1.3, 0.0, 1.0);
       float _h = fract(sin(dot(floor(_uv) + floor(vWPos.y * 0.5) * 7.0, vec2(12.9898, 78.233))) * 43758.5453);
       outgoingLight *= (0.93 + 0.1 * _h) * (1.0 - _line * 0.22);` : ''}
       #include <output_fragment>`
    );
  };
  mat.customProgramCacheKey = () => panels ? 'edge-surface-panels' : 'edge-surface';
  mat.needsUpdate = true;
}
[matWhite, matLight, matGray, matWall, matAccent].forEach(m => applyRimShader(m));

// body materials
const matSkin  = new THREE.MeshStandardMaterial({ color: 0xd7a17d, roughness: 1 });
const matPants = new THREE.MeshStandardMaterial({ color: 0x333940, roughness: 1 });

// weapon materials
const matGun      = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.55, metalness: 0.2 });
const matGunLight = new THREE.MeshStandardMaterial({ color: 0x505962, roughness: 0.6 });
