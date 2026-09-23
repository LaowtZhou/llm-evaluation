import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#universe');
const mission = document.querySelector('#mission');
const loading = document.querySelector('#loadingState');
const progress = document.querySelector('#loadingProgress');
const caption = document.querySelector('#loadingCaption');
const errorState = document.querySelector('#errorState');
const errorMessage = document.querySelector('#errorMessage');
const toast = document.querySelector('#toast');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
let scene;
let camera;
let controls;
let ship;
let driveGlow = [];
let running = true;
let immersive = false;
let soundEngine = null;
let frameHandle = 0;
let lastFrame = 0;
let viewIndex = 0;
let toastTimer;
const initialCamera = new THREE.Vector3(42, 18, 24);
const viewPresets = [
  { position: new THREE.Vector3(42, 18, 24), target: new THREE.Vector3(0, 0, 0), label: '主视角' },
  { position: new THREE.Vector3(-40, 14, 26), target: new THREE.Vector3(0, 0, -1), label: '左舷视角' },
  { position: new THREE.Vector3(15, 42, 15), target: new THREE.Vector3(0, 0, 0), label: '俯瞰视角' },
  { position: new THREE.Vector3(0, 11, 54), target: new THREE.Vector3(0, 0, 0), label: '舰首视角' },
];

function setLoad(percent, message) {
  progress.style.width = `${percent}%`;
  caption.textContent = `INITIALIZING VOXEL FIELD · ${String(percent).padStart(2, '0')}% · ${message}`;
}

function fail(message) {
  loading.classList.add('is-hidden');
  errorMessage.textContent = message;
  errorState.hidden = false;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1700);
}

function initRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    fail('当前浏览器无法启动 WebGL。请更新浏览器或启用硬件加速后重试。');
    return false;
  }
  const pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.35 : 1.8);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.setClearColor(0x000000, 0);
  return true;
}

function initScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.copy(initialCamera);
  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.045;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.22;
  controls.minDistance = 11;
  controls.maxDistance = 90;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI * 0.82;
  controls.enablePan = false;
  controls.saveState();
  scene.add(new THREE.HemisphereLight(0x9dc6f6, 0x171a28, 2.0));

  const keyLight = new THREE.DirectionalLight(0xffe5c9, 3.2);
  keyLight.position.set(-12, 15, 15);
  scene.add(keyLight);
  const coldLight = new THREE.DirectionalLight(0x60a9ff, 2.7);
  coldLight.position.set(8, 3, -14);
  scene.add(coldLight);
  const warmRim = new THREE.PointLight(0xf47a36, 16, 30, 2);
  warmRim.position.set(-11, 3, -2);
  scene.add(warmRim);

  createStarfield();
  ship = createShip();
  scene.add(ship);
  createFlightMarkers();
}

const voxelSize = 0.29;
const microVoxelSize = 0.045;
const minimumShipVoxels = 2_000_000;
const voxelMaterials = {
  hull: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.75, metalness: 0.19 }),
  light: new THREE.MeshStandardMaterial({ color: 0xf5f1e6, roughness: 0.62, metalness: 0.12 }),
  shadow: new THREE.MeshStandardMaterial({ color: 0x63738c, roughness: 0.65, metalness: 0.32 }),
  navy: new THREE.MeshStandardMaterial({ color: 0x344b6b, roughness: 0.72, metalness: 0.26 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x202b3b, roughness: 0.76, metalness: 0.3 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xe66d2e, roughness: 0.52, metalness: 0.28, emissive: 0x351304 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x297ce0, roughness: 0.36, metalness: 0.23, emissive: 0x061e52 }),
  cyan: new THREE.MeshStandardMaterial({ color: 0x5ac7ff, roughness: 0.26, metalness: 0.06, emissive: 0x0676ef, emissiveIntensity: 2.4 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffb15d, roughness: 0.45, metalness: 0.15, emissive: 0x43200a }),
};

function createShip() {
  const group = new THREE.Group();
  group.scale.setScalar(0.92);
  const buckets = Object.fromEntries(Object.keys(voxelMaterials).map((key) => [key, []]));

  function voxel(x, y, z, material = 'hull', sx = 1, sy = 1, sz = 1, rz = 0, ry = 0) {
    buckets[material].push({ x, y, z, sx, sy, sz, rz, ry });
  }

  // Central keel: each cross-section is built as a dense, stepped voxel hull.
  for (let z = -8.1; z <= 8.2; z += 0.34) {
    const taper = z > 4.8 ? Math.max(0.19, (8.6 - z) / 3.8) : (z < -6.2 ? Math.max(0.58, (8.4 + z) / 2.2) : 1);
    const width = (z > 6.7 ? 1.45 : z > 3.8 ? 2.2 : z < -6.4 ? 1.95 : 2.65) * taper;
    const height = (z > 6.5 ? 1.2 : z > 3.8 ? 1.65 : 1.9) * taper;
    for (let x = -width; x <= width; x += 0.34) {
      for (let y = -height; y <= height; y += 0.34) {
        const edge = Math.abs(x) > width - 0.38 || Math.abs(y) > height - 0.38;
        const hash = Math.abs(Math.sin(x * 34.1 + y * 51.3 + z * 19.7));
        if (!edge && hash > 0.84) continue;
        let type = 'hull';
        if (Math.abs(x) < 0.38 && y > height * 0.7 && Math.floor((z + 8.1) / 0.68) % 2 === 0) type = 'orange';
        else if (Math.abs(x) > width * 0.67) type = hash > 0.53 ? 'shadow' : 'navy';
        else if (y < -height * 0.62) type = 'navy';
        else if (hash > 0.92) type = 'light';
        voxel(x, y, z, type, 1.05, 1, 1.1);
      }
    }
  }

  // Two voxelized orbital habitats. Ring cross-sections use stepped blocks and exposed panel ribs.
  function addHabitatRing(radius, z, angleOffset, material = 'light', radialLayers = 4, depthLayers = 3) {
    const steps = 200;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 + angleOffset;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let r = 0; r < radialLayers; r++) {
        for (let d = 0; d < depthLayers; d++) {
          const ringRadius = radius + (r - (radialLayers - 1) / 2) * 0.33;
          const depth = z + (d - (depthLayers - 1) / 2) * 0.32;
          const x = ringRadius * ca, y = ringRadius * sa;
          const rib = i % 10 === 0;
          const chosen = rib ? (i % 20 === 0 ? 'orange' : 'navy') : (d === 0 && r === radialLayers - 1 ? 'shadow' : material);
          voxel(x, y, depth, chosen, 1.34, 1.22, 1.13, a + Math.PI / 2);
        }
      }
    }
    // Small habitation pods punctuate the orbital ring.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + angleOffset;
      const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      for (let b = -2; b <= 2; b++) voxel(x + Math.cos(a) * b * 0.28, y + Math.sin(a) * b * 0.28, z + 0.8, b === 0 ? 'orange' : 'hull', 1.7, 1.5, 2.5, a + Math.PI / 2);
      voxel(x, y, z + 1.3, 'gold', 1.35, 1.2, 0.8, a + Math.PI / 2);
    }
  }
  addHabitatRing(6.2, 0.4, 0, 'hull', 5, 4);
  addHabitatRing(5.25, -1.15, Math.PI / 200, 'light', 3, 3);

  // Cross braces make the ring feel engineered and tie both habitat decks into the keel.
  for (let arm = 0; arm < 8; arm++) {
    const angle = arm * Math.PI / 4;
    const start = 2.05, end = 5.15;
    for (let step = 0; step < 14; step++) {
      const r = start + (end - start) * (step / 13);
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
      voxel(x, y, 0.45, step % 4 === 0 ? 'orange' : 'shadow', 1.7, 1.3, 2.7, angle);
      voxel(x, y, -1.12, step % 5 === 0 ? 'light' : 'navy', 1.55, 1.2, 2.2, angle);
    }
  }

  // Layered forward command deck and angular sensor mast.
  for (let layer = 0; layer < 10; layer++) {
    const z = 5.7 + layer * 0.38;
    const half = Math.max(0.25, 1.25 - layer * 0.115);
    for (let x = -half; x <= half; x += 0.32) {
      for (let y = -0.42; y <= 0.78; y += 0.32) voxel(x, y + 1.8, z, layer % 4 === 0 ? 'orange' : (y > 0.3 ? 'light' : 'hull'));
    }
  }
  for (let z = 8.7; z <= 10.2; z += 0.32) {
    const w = Math.max(0.2, (10.4 - z) * 0.48);
    for (let x = -w; x <= w; x += 0.3) for (let y = -w; y <= w; y += 0.3) voxel(x, y + 1.9, z, Math.abs(x) < 0.32 ? 'light' : 'navy');
  }
  // Sensor mast creates the distinctive high silhouette in the reference.
  for (let i = 0; i < 12; i++) {
    const z = 7.4 + i * 0.23;
    voxel(-0.45 + i * 0.07, 2.35 + i * 0.17, z, i % 4 === 0 ? 'orange' : 'light', 1.2, 1.3, 1.25, -0.11);
    voxel(0.45 - i * 0.04, 2.3 + i * 0.16, z - 0.15, 'navy', 1.1, 1.1, 1.2, 0.1);
  }
  for (let x = -1.9; x <= 1.9; x += 0.32) voxel(x, 2.35, 4.95, Math.abs(x) < 0.35 ? 'orange' : 'light', 1.1, 1.1, 1.5);

  // Engine pods and blue armored thruster housings at the aft.
  const engines = [-2.35, 0, 2.35];
  for (const [engineIndex, x0] of engines.entries()) {
    const y0 = engineIndex === 1 ? -1.25 : -1.55;
    for (let z = -11.8; z <= -7.0; z += 0.34) {
      const widen = 1 + (z < -10.6 ? Math.min(0.55, (-10.6 - z) * 0.3) : 0);
      for (let x = -0.98; x <= 0.98; x += 0.34) {
        for (let y = -0.98; y <= 0.98; y += 0.34) {
          const shell = Math.abs(x) > 0.55 || Math.abs(y) > 0.55 || z > -7.8;
          const color = shell ? ((Math.abs(x) < 0.35 && z > -8.0) ? 'orange' : (Math.abs(y) > 0.72 ? 'light' : 'navy')) : 'dark';
          voxel(x0 + x * widen, y0 + y * widen, z, color, 1.1, 1.1, 1.18);
        }
      }
    }
    // Square exhaust aperture with a luminous inner nozzle.
    for (let edge = -3; edge <= 3; edge++) {
      const q = edge * 0.33;
      for (const z of [-11.95, -12.25]) {
        voxel(x0 + q, y0 - 1.08, z, edge % 2 ? 'blue' : 'light', 1.18, 1.1, 1.5);
        voxel(x0 + q, y0 + 1.08, z, edge % 2 ? 'navy' : 'hull', 1.18, 1.1, 1.5);
        voxel(x0 - 1.08, y0 + q, z, 'navy', 1.15, 1.1, 1.5);
        voxel(x0 + 1.08, y0 + q, z, 'hull', 1.15, 1.1, 1.5);
      }
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      voxel(x0 + Math.cos(a) * 0.55, y0 + Math.sin(a) * 0.55, -12.38, 'cyan', 1.05, 1.05, 1.35);
    }
    const glow = new THREE.PointLight(0x2c8dff, 30, 14, 2.2);
    glow.position.set(x0, y0, -12.7);
    group.add(glow);
    driveGlow.push(glow);
    addExhaust(group, x0, y0, -13.4, engineIndex);
  }

  // Bridge fins, docking arms, orange hazard stripes, and instrument details.
  for (const side of [-1, 1]) {
    for (let z = -4; z <= 6; z += 0.34) {
      const x = side * (2.7 + (z > 2 ? (z - 2) * 0.09 : 0));
      voxel(x, 0.28, z, z % 2 < 0.3 ? 'orange' : 'shadow', 1.6, 1.2, 1.35, side * 0.12);
      if (Math.round(z * 10) % 4 === 0) voxel(x * 1.08, -0.45, z, 'light', 1.2, 1.1, 1.1);
    }
    for (let i = 0; i < 8; i++) {
      voxel(side * (3.0 + i * 0.27), -0.3, 0.5, i % 3 === 0 ? 'orange' : 'navy', 1.35, 1.1, 1.5, side * 0.08);
      voxel(side * (3.0 + i * 0.27), -0.3, -1.15, 'light', 1.4, 1.15, 1.35, side * 0.08);
    }
  }

  // Repeatable surface modules: tiny solar squares, windows, radiator vanes, and service lights.
  for (let i = 0; i < 370; i++) {
    const z = -7.7 + (i % 47) * 0.34;
    const side = i % 2 ? 1 : -1;
    const x = side * (2.9 + (i % 5) * 0.18);
    const y = ((Math.floor(i / 2) % 9) - 4) * 0.31;
    const color = i % 11 === 0 ? 'gold' : i % 3 === 0 ? 'blue' : 'light';
    voxel(x, y, z, color, 0.55, 0.6, 0.75, side * 0.08);
  }

  setLoad(48, 'RASTERIZING MICRO-VOXEL HULL');
  const voxelCount = createDenseVoxelModel(buckets, group);
  group.userData.voxelCount = voxelCount;
  group.userData.sculptRuntime = {
    voxelCount,
    resolution: microVoxelSize,
    internalFacesRemoved: true,
    animatedParts: ['central-keel', 'habitat-rings', 'engine-clusters'],
  };
  return group;
}

function createDenseVoxelModel(buckets, parent) {
  const keys = Object.keys(voxelMaterials);
  const materialIds = new Map(keys.map((key, index) => [key, index + 1]));
  const descriptors = [];
  for (const key of keys) {
    for (const part of buckets[key]) descriptors.push({ ...part, materialId: materialIds.get(key) });
  }

  const bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  const extentScratch = new THREE.Matrix4();
  for (const part of descriptors) {
    extentScratch.makeRotationFromEuler(new THREE.Euler(0, part.ry, part.rz));
    const m = extentScratch.elements;
    const hx = voxelSize * part.sx * 0.5, hy = voxelSize * part.sy * 0.5, hz = voxelSize * part.sz * 0.5;
    const ex = Math.abs(m[0]) * hx + Math.abs(m[4]) * hy + Math.abs(m[8]) * hz;
    const ey = Math.abs(m[1]) * hx + Math.abs(m[5]) * hy + Math.abs(m[9]) * hz;
    const ez = Math.abs(m[2]) * hx + Math.abs(m[6]) * hy + Math.abs(m[10]) * hz;
    bounds.minX = Math.min(bounds.minX, part.x - ex); bounds.maxX = Math.max(bounds.maxX, part.x + ex);
    bounds.minY = Math.min(bounds.minY, part.y - ey); bounds.maxY = Math.max(bounds.maxY, part.y + ey);
    bounds.minZ = Math.min(bounds.minZ, part.z - ez); bounds.maxZ = Math.max(bounds.maxZ, part.z + ez);
  }

  const step = microVoxelSize;
  const minIX = Math.floor(bounds.minX / step) - 1;
  const minIY = Math.floor(bounds.minY / step) - 1;
  const minIZ = Math.floor(bounds.minZ / step) - 1;
  const sizeX = Math.ceil(bounds.maxX / step) - minIX + 1;
  const sizeY = Math.ceil(bounds.maxY / step) - minIY + 1;
  const sizeZ = Math.ceil(bounds.maxZ / step) - minIZ + 1;
  const fieldLength = sizeX * sizeY * sizeZ;
  const field = new Uint8Array(fieldLength);
  const firstCapacity = Math.min(fieldLength, Math.max(4096, descriptors.length * 160));
  let occupied = new Uint32Array(firstCapacity);
  let occupiedCount = 0;
  const position = new THREE.Vector3();
  const local = new THREE.Vector3();
  const inverse = new THREE.Quaternion();

  for (let p = 0; p < descriptors.length; p++) {
    const part = descriptors[p];
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, part.ry, part.rz));
    inverse.copy(quaternion).invert();
    const halfX = voxelSize * part.sx * 0.5, halfY = voxelSize * part.sy * 0.5, halfZ = voxelSize * part.sz * 0.5;
    const m = extentScratch.makeRotationFromQuaternion(quaternion).elements;
    const ex = Math.abs(m[0]) * halfX + Math.abs(m[4]) * halfY + Math.abs(m[8]) * halfZ;
    const ey = Math.abs(m[1]) * halfX + Math.abs(m[5]) * halfY + Math.abs(m[9]) * halfZ;
    const ez = Math.abs(m[2]) * halfX + Math.abs(m[6]) * halfY + Math.abs(m[10]) * halfZ;
    const x0 = Math.max(0, Math.floor((part.x - ex) / step) - minIX);
    const x1 = Math.min(sizeX - 1, Math.ceil((part.x + ex) / step) - minIX);
    const y0 = Math.max(0, Math.floor((part.y - ey) / step) - minIY);
    const y1 = Math.min(sizeY - 1, Math.ceil((part.y + ey) / step) - minIY);
    const z0 = Math.max(0, Math.floor((part.z - ez) / step) - minIZ);
    const z1 = Math.min(sizeZ - 1, Math.ceil((part.z + ez) / step) - minIZ);
    const rowStride = sizeY * sizeZ;
    for (let ix = x0; ix <= x1; ix++) {
      const wx = (minIX + ix + 0.5) * step;
      for (let iy = y0; iy <= y1; iy++) {
        const wy = (minIY + iy + 0.5) * step;
        for (let iz = z0; iz <= z1; iz++) {
          position.set(wx - part.x, wy - part.y, (minIZ + iz + 0.5) * step - part.z);
          local.copy(position).applyQuaternion(inverse);
          if (Math.abs(local.x) > halfX || Math.abs(local.y) > halfY || Math.abs(local.z) > halfZ) continue;
          const index = ix * rowStride + iy * sizeZ + iz;
          if (field[index] === 0) {
            if (occupiedCount === occupied.length) {
              const larger = new Uint32Array(Math.min(fieldLength, Math.max(occupied.length * 2, occupied.length + 65536)));
              larger.set(occupied);
              occupied = larger;
            }
            occupied[occupiedCount++] = index;
          }
          field[index] = part.materialId;
        }
      }
    }
  }

  if (occupiedCount < minimumShipVoxels) {
    throw new Error(`Ship voxelization produced ${occupiedCount.toLocaleString()} cells; ${minimumShipVoxels.toLocaleString()} are required.`);
  }

  // Build only exposed voxel faces. The ship still contains every occupied voxel cell,
  // while internal faces never enter the GPU buffers.
  const faceCounts = new Uint32Array(keys.length + 1);
  const rowStride = sizeY * sizeZ;
  for (let i = 0; i < occupiedCount; i++) {
    const index = occupied[i], materialId = field[index], z = index % sizeZ;
    const xy = (index - z) / sizeZ, y = xy % sizeY, x = (xy - y) / sizeY;
    let faces = 0;
    if (x === 0 || field[index - rowStride] === 0) faces++;
    if (x === sizeX - 1 || field[index + rowStride] === 0) faces++;
    if (y === 0 || field[index - sizeZ] === 0) faces++;
    if (y === sizeY - 1 || field[index + sizeZ] === 0) faces++;
    if (z === 0 || field[index - 1] === 0) faces++;
    if (z === sizeZ - 1 || field[index + 1] === 0) faces++;
    faceCounts[materialId] += faces;
  }

  const buffers = new Array(keys.length + 1);
  for (let id = 1; id <= keys.length; id++) {
    const count = faceCounts[id];
    if (!count) continue;
    buffers[id] = {
      positions: new Float32Array(count * 12),
      normals: new Float32Array(count * 12),
      indices: new Uint32Array(count * 6),
      cursor: 0,
    };
  }
  const h = step * 0.5;
  const faces = [
    { dx: -1, dy: 0, dz: 0, normal: [-1, 0, 0], corners: [[-h,-h,-h],[-h,-h,h],[-h,h,h],[-h,h,-h]] },
    { dx: 1, dy: 0, dz: 0, normal: [1, 0, 0], corners: [[h,-h,-h],[h,h,-h],[h,h,h],[h,-h,h]] },
    { dx: 0, dy: -1, dz: 0, normal: [0, -1, 0], corners: [[-h,-h,-h],[h,-h,-h],[h,-h,h],[-h,-h,h]] },
    { dx: 0, dy: 1, dz: 0, normal: [0, 1, 0], corners: [[-h,h,-h],[-h,h,h],[h,h,h],[h,h,-h]] },
    { dx: 0, dy: 0, dz: -1, normal: [0, 0, -1], corners: [[-h,-h,-h],[-h,h,-h],[h,h,-h],[h,-h,-h]] },
    { dx: 0, dy: 0, dz: 1, normal: [0, 0, 1], corners: [[-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h]] },
  ];

  for (let i = 0; i < occupiedCount; i++) {
    const index = occupied[i], materialId = field[index], z = index % sizeZ;
    const xy = (index - z) / sizeZ, y = xy % sizeY, x = (xy - y) / sizeY;
    const centerX = (minIX + x + 0.5) * step;
    const centerY = (minIY + y + 0.5) * step;
    const centerZ = (minIZ + z + 0.5) * step;
    const buffer = buffers[materialId];
    for (const face of faces) {
      const nx = x + face.dx, ny = y + face.dy, nz = z + face.dz;
      const exposed = nx < 0 || nx >= sizeX || ny < 0 || ny >= sizeY || nz < 0 || nz >= sizeZ || field[nx * rowStride + ny * sizeZ + nz] === 0;
      if (!exposed) continue;
      const vertex = buffer.cursor * 4;
      for (let c = 0; c < 4; c++) {
        const offset = (vertex + c) * 3;
        buffer.positions[offset] = centerX + face.corners[c][0];
        buffer.positions[offset + 1] = centerY + face.corners[c][1];
        buffer.positions[offset + 2] = centerZ + face.corners[c][2];
        buffer.normals[offset] = face.normal[0];
        buffer.normals[offset + 1] = face.normal[1];
        buffer.normals[offset + 2] = face.normal[2];
      }
      const indexOffset = buffer.cursor * 6;
      buffer.indices[indexOffset] = vertex; buffer.indices[indexOffset + 1] = vertex + 1; buffer.indices[indexOffset + 2] = vertex + 2;
      buffer.indices[indexOffset + 3] = vertex; buffer.indices[indexOffset + 4] = vertex + 2; buffer.indices[indexOffset + 5] = vertex + 3;
      buffer.cursor++;
    }
  }

  for (let id = 1; id <= keys.length; id++) {
    const buffer = buffers[id];
    if (!buffer) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffer.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buffer.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(buffer.indices, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, voxelMaterials[keys[id - 1]]);
    mesh.name = `voxel-surface-${keys[id - 1]}`;
    mesh.userData.component = keys[id - 1];
    mesh.userData.explodeWithParent = true;
    parent.add(mesh);
  }

  // Keep a compact, addressable representation of every occupied voxel for the model runtime.
  const voxelIndices = occupied.slice(0, occupiedCount);
  const voxelMaterialIds = new Uint8Array(occupiedCount);
  for (let i = 0; i < occupiedCount; i++) voxelMaterialIds[i] = field[voxelIndices[i]];
  parent.userData.voxelData = {
    cellSize: step,
    gridOrigin: [minIX, minIY, minIZ],
    gridSize: [sizeX, sizeY, sizeZ],
    indices: voxelIndices,
    materialIds: voxelMaterialIds,
  };

  // The compact voxel field remains available; release the temporary dense lookup grid.
  return occupiedCount;
}

function addExhaust(parent, x, y, z, seed) {
  const exhaustGroup = new THREE.Group();
  exhaustGroup.position.set(x, y, z);
  const length = seed === 1 ? 11.5 : 9.4;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.82, length, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x167bff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  beam.rotation.x = Math.PI / 2;
  beam.position.z = -length / 2;
  exhaustGroup.add(beam);
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.28, length * 0.82, 7, 1, true),
    new THREE.MeshBasicMaterial({ color: seed === 1 ? 0x87deff : 0x429aff, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  core.rotation.x = Math.PI / 2;
  core.position.z = -length * 0.42;
  exhaustGroup.add(core);
  parent.add(exhaustGroup);
  driveGlow.push(exhaustGroup);
}

function createStarfield() {
  const count = window.innerWidth < 700 ? 3700 : 7200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [new THREE.Color('#d9e8ff'), new THREE.Color('#ffbc8a'), new THREE.Color('#93c7ff')];
  for (let i = 0; i < count; i++) {
    const radius = 38 + Math.random() * 115;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
    const color = palette[Math.random() < 0.72 ? 0 : Math.random() < 0.65 ? 1 : 2];
    colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.12, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.88, depthWrite: false }));
  points.name = 'starfield';
  scene.add(points);

  // A second, near-field population of actual voxel fragments adds parallax.
  const debrisCount = window.innerWidth < 700 ? 900 : 2100;
  const debrisGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const debrisMaterial = new THREE.MeshBasicMaterial({ color: 0xc9d6e9, transparent: true, opacity: 0.5 });
  const debris = new THREE.InstancedMesh(debrisGeometry, debrisMaterial, debrisCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < debrisCount; i++) {
    const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 30;
    dummy.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 34, -20 - Math.random() * 80);
    const size = 0.25 + Math.random() * 1.3;
    dummy.scale.setScalar(size);
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    dummy.updateMatrix();
    debris.setMatrixAt(i, dummy.matrix);
  }
  debris.name = 'near-field-voxel-dust';
  scene.add(debris);
}

function createFlightMarkers() {
  const group = new THREE.Group();
  const points = [];
  for (let i = 0; i < 180; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 18 + Math.random() * 34;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, (Math.random() - 0.5) * 24, -30 - Math.random() * 55));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.PointsMaterial({ color: 0x7eaaff, size: 0.3, transparent: true, opacity: 0.47, blending: THREE.AdditiveBlending, depthWrite: false });
  const motes = new THREE.Points(geometry, material);
  group.add(motes);
  group.name = 'flight-motes';
  scene.add(group);
}

function resize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = window.innerWidth < 700 ? 41 : (window.innerWidth > 1500 ? 31 : 34);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.35 : 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function animate(now = 0) {
  frameHandle = requestAnimationFrame(animate);
  const elapsed = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (!scene || !renderer) return;
  controls.update();
  if (running && ship) {
    ship.rotation.y += elapsed * 0.035;
    ship.position.y = Math.sin(now * 0.0003) * 0.12;
    ship.rotation.z = Math.sin(now * 0.00014) * 0.012;
    driveGlow.forEach((item, index) => {
      if (item.isPointLight) item.intensity = 25 + Math.sin(now * 0.006 + index) * 7;
      else item.scale.setScalar(0.92 + Math.sin(now * 0.004 + index) * 0.07);
    });
  }
  renderer.render(scene, camera);
}

function setRunning(value) {
  running = value;
  mission.classList.toggle('paused', !running);
  document.querySelector('#motionLabel').textContent = running ? '航行中' : '已暂停';
  document.querySelector('#motionButtonLabel').textContent = running ? '暂停' : '继续';
  document.querySelector('#playIcon').textContent = running ? 'Ⅱ' : '▶';
  document.querySelector('#motionToggle').setAttribute('aria-label', running ? '暂停飞行' : '继续飞行');
  if (!running) showToast('航行姿态已锁定');
}

function nextView() {
  viewIndex = (viewIndex + 1) % viewPresets.length;
  const preset = viewPresets[viewIndex];
  camera.position.copy(preset.position);
  controls.target.copy(preset.target);
  controls.update();
  controls.saveState();
  showToast(`视角切换 · ${preset.label}`);
}

function toggleImmersive(force) {
  immersive = typeof force === 'boolean' ? force : !immersive;
  mission.classList.toggle('immersive', immersive);
  document.querySelector('#immersiveLabel').textContent = immersive ? '退出' : '沉浸';
  document.querySelector('#immersiveToggle').setAttribute('aria-label', immersive ? '退出沉浸模式' : '进入沉浸模式');
  if (immersive) showToast('沉浸模式 · 按 I 或 Esc 返回界面');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) mission.requestFullscreen?.().catch(() => showToast('浏览器未允许全屏'));
  else document.exitFullscreen?.();
}

function toggleSound() {
  const button = document.querySelector('#soundToggle');
  if (soundEngine) {
    soundEngine.oscillator.stop();
    soundEngine.context.close();
    soundEngine = null;
    button.setAttribute('aria-pressed', 'false');
    button.title = '环境音已关闭';
    showToast('环境音已关闭');
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) { showToast('当前浏览器不支持环境音'); return; }
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  oscillator.type = 'sine';
  oscillator.frequency.value = 49;
  filter.type = 'lowpass';
  filter.frequency.value = 135;
  gain.gain.value = 0.018;
  oscillator.connect(filter).connect(gain).connect(context.destination);
  oscillator.start();
  soundEngine = { context, oscillator };
  button.setAttribute('aria-pressed', 'true');
  button.title = '环境音已开启';
  showToast('深空环境音已开启');
}

function bindUI() {
  document.querySelector('#motionToggle').addEventListener('click', () => setRunning(!running));
  document.querySelector('#viewToggle').addEventListener('click', nextView);
  document.querySelector('#resetView').addEventListener('click', () => {
    camera.position.copy(initialCamera);
    controls.target.set(0, 0, 0);
    controls.update();
    controls.saveState();
    viewIndex = 0;
    showToast('观测视角已重置');
  });
  document.querySelector('#immersiveToggle').addEventListener('click', () => toggleImmersive());
  document.querySelector('#fullscreenToggle').addEventListener('click', toggleFullscreen);
  document.querySelector('#soundToggle').addEventListener('click', toggleSound);
  document.querySelector('#retryButton').addEventListener('click', () => window.location.reload());
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('fullscreenchange', () => {
    const full = Boolean(document.fullscreenElement);
    document.querySelector('#fullscreenToggle').setAttribute('aria-pressed', String(full));
    document.querySelector('#fullscreenToggle').title = full ? '退出全屏' : '全屏';
  });
  document.addEventListener('keydown', (event) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); setRunning(!running); }
    if (event.key.toLowerCase() === 'r') document.querySelector('#resetView').click();
    if (event.key.toLowerCase() === 'i') toggleImmersive();
    if (event.key.toLowerCase() === 'v') nextView();
    if (event.key.toLowerCase() === 'f') toggleFullscreen();
    if (event.key === 'Escape' && immersive) toggleImmersive(false);
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frameHandle);
    fail('显卡上下文已中断。请关闭其他 3D 页面后重新连接。');
  });
}

async function boot() {
  bindUI();
  setLoad(12, 'CALIBRATING OPTICS');
  if (!initRenderer()) return;
  setLoad(28, 'ASSEMBLING VESSEL');
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    initScene();
    document.querySelector('#voxelCount').textContent = ship.userData.voxelCount.toLocaleString('en-US');
    setLoad(88, `${ship.userData.voxelCount.toLocaleString()} VOXELS IN FORMATION`);
    resize();
    animate();
    setTimeout(() => {
      setLoad(100, 'SYSTEMS NOMINAL');
      mission.classList.add('is-ready');
      loading.classList.add('is-hidden');
      showToast('自然选择号 · 航行系统正常');
    }, 220);
  } catch (error) {
    console.error('Scene initialization failed:', error);
    fail('场景构建失败。请检查网络连接后重试。');
  }
}

boot();
