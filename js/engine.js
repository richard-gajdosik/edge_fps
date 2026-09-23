// =========================================================================
//  ENGINE — scene, camera, renderer, lights, shared materials
// =========================================================================
const app = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef1f4);
scene.fog = new THREE.Fog(0xeef1f4, 60, 220);

const camera = new THREE.PerspectiveCamera(80, innerWidth/innerHeight, 0.02, 1000);
scene.add(camera); // so viewmodel arms (camera children) render

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0xcdd3da, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 0.85);
const SUN_OFFSET = new THREE.Vector3(40, 90, 30);
sun.position.copy(SUN_OFFSET);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = 80;
sun.shadow.camera.left=-sc; sun.shadow.camera.right=sc; sun.shadow.camera.top=sc; sun.shadow.camera.bottom=-sc;
sun.shadow.camera.far = 300; sun.shadow.bias = -0.0004;
scene.add(sun); scene.add(sun.target);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// the shadow frustum follows the player so long maps keep their shadows
function updateSun(focus) {
  sun.position.copy(focus).add(SUN_OFFSET);
  sun.target.position.copy(focus);
}

// ---------- Materials ----------
const matWhite  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
const matLight  = new THREE.MeshStandardMaterial({ color: 0xf3f5f7, roughness: 1 });
const matGray   = new THREE.MeshStandardMaterial({ color: 0xd7dce1, roughness: 1 });
const matAccent = new THREE.MeshStandardMaterial({ color: 0xe63030, roughness: 0.6 });
const matWall   = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
const edgeMat   = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.34 });

// ---------- Custom shader: fresnel rim (dark silhouette) + fake AO ----------
// Injected into MeshStandardMaterial so we keep real shadows AND add contrast
// so white surfaces stop blending into the white background.
function applyRimShader(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying float vRimNY;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vRimNY = normalize(mat3(modelMatrix) * normal).y;'
    );
    shader.fragmentShader = 'varying float vRimNY;\n' + shader.fragmentShader.replace(
      '#include <output_fragment>',
      `float _fres = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
       float _ao = 0.68 + 0.32 * clamp(vRimNY * 0.5 + 0.5, 0.0, 1.0); // top faces brighter
       outgoingLight *= _ao;
       outgoingLight = mix(outgoingLight, outgoingLight * 0.42, _fres * 0.9); // dark rim at silhouettes
       #include <output_fragment>`
    );
  };
  mat.needsUpdate = true;
}
[matWhite, matLight, matGray, matWall, matAccent].forEach(applyRimShader);

// body materials
const matSkin  = new THREE.MeshStandardMaterial({ color: 0xd7a17d, roughness: 1 });
const matPants = new THREE.MeshStandardMaterial({ color: 0x333940, roughness: 1 });

// weapon materials
const matGun      = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.55, metalness: 0.2 });
const matGunLight = new THREE.MeshStandardMaterial({ color: 0x505962, roughness: 0.6 });
