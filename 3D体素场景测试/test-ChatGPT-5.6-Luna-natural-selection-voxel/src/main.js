import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import referenceTextureUrl from "../assets/reference-ship.png";
import "./style.css";
import "./file-safe.css";

const $ = (selector) => document.querySelector(selector);
const root = $("#scene-root");
const loading = $("#loading-card");
const loadingCopy = $("#loading-copy");
const status = $("#system-status");
const voxelCount = $("#voxel-count");
const fpsReadout = $("#fps-readout");
const timeReadout = $("#time-readout");
const toast = $("#toast");
const autoButton = $("#auto-button");
const resetButton = $("#reset-button");
const qualitySelect = $("#quality-select");
const errorCard = $("#error-card");
const retryButton = $("#retry-button");
const viewLabel = $("#view-label");
const densityLabel = $("#density-label");

const QUALITY = {
  cinematic: { pixelRatio: .9, bloom: .22, stars: 24000, dust: 1100, microVisible: true },
  balanced: { pixelRatio: .78, bloom: .14, stars: 13000, dust: 650, microVisible: true },
  low: { pixelRatio: .64, bloom: .08, stars: 6000, dust: 280, microVisible: false }
};
const MICRO_VOXELS = 1_000_000;
let quality = "cinematic";
let elapsed = 0;
let paused = false;
let autoOrbit = true;
let dragging = false;
let pointerX = 0;
let pointerY = 0;
let toastTimer = 0;
let frameCount = 0;
let fpsStamp = performance.now();
let activeView = "pursuit";

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050914, .0048);
const camera = new THREE.PerspectiveCamera(31, innerWidth / innerHeight, .1, 280);
const lookTarget = new THREE.Vector3(0, .05, -.15);
const clock = new THREE.Clock();

let renderer;
let composer;
let bloom;
let shipRoot;
let microField;
let microMaterial;
let starField;
let debrisField;
let plumeField;
let plumeMaterial;
let engineLights = [];
let activeVoxelTotal = 0;

const VIEW_PRESETS = {
  pursuit: { label: "PURSUIT / HERO", yaw: 2.72, pitch: .12, distance: 25.5, target: new THREE.Vector3(0, .05, -.55) },
  ring: { label: "RING / ORBIT", yaw: 1.24, pitch: .3, distance: 22.5, target: new THREE.Vector3(0, .35, .15) },
  engine: { label: "ENGINE / WAKE", yaw: Math.PI, pitch: -.04, distance: 18.5, target: new THREE.Vector3(0, -.3, -4.6) }
};
let orbitYaw = VIEW_PRESETS.pursuit.yaw;
let orbitPitch = VIEW_PRESETS.pursuit.pitch;
let orbitDistance = VIEW_PRESETS.pursuit.distance;

const PALETTE = {
  hull: new THREE.Color("#dfe9e6"),
  hullBright: new THREE.Color("#f7f2df"),
  hullShade: new THREE.Color("#798a91"),
  graphite: new THREE.Color("#15252d"),
  graphite2: new THREE.Color("#253940"),
  orange: new THREE.Color("#e46d2f"),
  orangeHot: new THREE.Color("#ff9a4e"),
  cyan: new THREE.Color("#51e8ff"),
  blue: new THREE.Color("#497bff")
};

const macroMaterials = {
  hull: new THREE.MeshStandardMaterial({ color: PALETTE.hull, roughness: .5, metalness: .3, flatShading: true }),
  hullBright: new THREE.MeshStandardMaterial({ color: PALETTE.hullBright, roughness: .34, metalness: .28, flatShading: true }),
  hullShade: new THREE.MeshStandardMaterial({ color: PALETTE.hullShade, roughness: .42, metalness: .58, flatShading: true }),
  graphite: new THREE.MeshStandardMaterial({ color: PALETTE.graphite, roughness: .3, metalness: .72, flatShading: true }),
  graphite2: new THREE.MeshStandardMaterial({ color: PALETTE.graphite2, roughness: .38, metalness: .62, flatShading: true }),
  orange: new THREE.MeshStandardMaterial({ color: PALETTE.orange, roughness: .3, metalness: .45, emissive: 0x3b1104, emissiveIntensity: .65, flatShading: true }),
  orangeHot: new THREE.MeshStandardMaterial({ color: PALETTE.orangeHot, roughness: .24, metalness: .34, emissive: 0x7f2608, emissiveIntensity: 1.15, flatShading: true }),
  cyan: new THREE.MeshStandardMaterial({ color: PALETTE.cyan, roughness: .18, metalness: .22, emissive: 0x0b8da4, emissiveIntensity: 1.25, flatShading: true }),
  blue: new THREE.MeshStandardMaterial({ color: PALETTE.blue, roughness: .2, metalness: .25, emissive: 0x122a9d, emissiveIntensity: 1.1, flatShading: true })
};

function updateLoading(percent, copy) {
  if (loadingCopy) loadingCopy.textContent = `${copy} / ${percent}%`;
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2100);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .78;
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[quality].pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  root.appendChild(renderer.domElement);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * .64, innerHeight * .64), QUALITY[quality].bloom, .65, .86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

function setupLights() {
  scene.add(new THREE.AmbientLight(0x49667d, .28));
  const key = new THREE.DirectionalLight(0xc4efff, 1.05);
  key.position.set(10, 15, 12);
  scene.add(key);
  const warm = new THREE.DirectionalLight(0xff6730, .62);
  warm.position.set(-13, 4, -15);
  scene.add(warm);
  const top = new THREE.PointLight(0xffa05e, 1.45, 25, 2);
  top.position.set(0, 6, .5);
  scene.add(top);
}

function addMacro(bucketMap, id, x, y, z, scale = 1) {
  bucketMap.get(id).push({ x, y, z, scale });
}

function addBoxVolume(bucketMap, id, center, size, step, predicate = () => true) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  for (let x = cx - sx / 2; x <= cx + sx / 2; x += step) {
    for (let y = cy - sy / 2; y <= cy + sy / 2; y += step) {
      for (let z = cz - sz / 2; z <= cz + sz / 2; z += step) {
        if (predicate(x, y, z)) addMacro(bucketMap, id, x, y, z, .94);
      }
    }
  }
}

function buildMacroShip() {
  const bucketMap = new Map(Object.keys(macroMaterials).map((id) => [id, []]));
  const random = seededRandom(70017);
  const step = .16;

  // Longitudinal main hull: tapered, faceted and densely paneled.
  for (let z = -5.15; z <= 5.25; z += step) {
    const noseT = THREE.MathUtils.clamp((z - 2.25) / 3.0, 0, 1);
    const rearT = THREE.MathUtils.clamp((-z - 3.5) / 1.8, 0, 1);
    const rx = (.9 - noseT * .56) * (1 - rearT * .15);
    const ry = (.72 - noseT * .42) * (1 - rearT * .1);
    for (let x = -rx; x <= rx; x += step) {
      for (let y = -ry; y <= ry; y += step) {
        const normalized = Math.abs(x / rx) + Math.abs(y / ry);
        if (normalized > 1.18 || random() < .035) continue;
        const id = y > .32 && random() > .45 ? "hullBright" : y < -.25 ? "hullShade" : random() > .68 ? "hullBright" : "hull";
        addMacro(bucketMap, id, x, y, z, .97);
      }
    }
    if (Math.round(z * 10) % 7 === 0) {
      addMacro(bucketMap, "graphite", -.82 + noseT * .3, .45, z, .94);
      addMacro(bucketMap, "graphite", .82 - noseT * .3, .45, z, .94);
    }
  }

  // Command prow and dorsal sensor tower.
  for (let z = 4.1; z <= 6.1; z += step) {
    const t = (z - 4.1) / 2;
    const rx = .46 * (1 - t * .78);
    const ry = .38 * (1 - t * .72);
    for (let x = -rx; x <= rx; x += step) for (let y = -.12; y <= ry; y += step) {
      if (Math.abs(x / Math.max(rx, .01)) + Math.abs(y / Math.max(ry, .01)) < 1.2) addMacro(bucketMap, y > .16 ? "hullBright" : "graphite2", x, y + .1, z, .94);
    }
  }
  addBoxVolume(bucketMap, "graphite", [0, 1.18, 2.25], [.58, .68, 1.35], step, (x, y) => Math.abs(x) < .34 && y > .84);
  for (let x = -.36; x <= .36; x += step) addMacro(bucketMap, "cyan", x, 1.52, 2.18, .92);

  // Ring habitat: solid radial annulus with a dark inner cavity and orange registration band.
  const ringRadius = 3.42;
  for (let i = 0; i < 280; i++) {
    const angle = i / 280 * Math.PI * 2;
    for (let radial = -3; radial <= 3; radial++) {
      for (let width = -2; width <= 2; width++) {
        const tube = radial * .15;
        const z = width * .15;
        const radius = ringRadius + tube;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const band = (i > 22 && i < 34) || (i > 152 && i < 164);
        const id = band ? (radial >= 1 ? "orangeHot" : "orange") : radial >= 2 ? "hullBright" : radial <= -2 ? "graphite2" : "hullShade";
        addMacro(bucketMap, id, x, y, z, .95);
      }
    }
  }
  // Four radial bridges physically attach the ring to the spine.
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    for (let r = .7; r < ringRadius - .2; r += step) {
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      for (let z = -.34; z <= .34; z += step) addMacro(bucketMap, "graphite", x, y, z, .92);
    }
  }

  // Rear power block and four engine nacelles.
  addBoxVolume(bucketMap, "graphite", [0, -.05, -4.9], [2.5, 1.55, 2.4], step, (x, y, z) => Math.abs(x) < 1.15 && Math.abs(y) < .66 && Math.abs(z + 4.9) < 1.08);
  const engines = [[-1.58, -.62], [1.58, -.62], [-1.58, .56], [1.58, .56]];
  engines.forEach(([x0, y0], engineIndex) => {
    for (let z = -8.0; z <= -3.35; z += step) {
      const cap = THREE.MathUtils.clamp((z + 8.0) / .6, 0, 1) + THREE.MathUtils.clamp((-z - 7.35) / .65, 0, 1);
      const rx = .46 + cap * .14;
      const ry = .38 + cap * .12;
      for (let x = x0 - rx; x <= x0 + rx; x += step) for (let y = y0 - ry; y <= y0 + ry; y += step) {
        if (Math.abs((x - x0) / rx) + Math.abs((y - y0) / ry) > 1.16) continue;
        const id = z < -7.35 ? (engineIndex % 2 ? "blue" : "cyan") : random() > .65 ? "hullShade" : "graphite2";
        addMacro(bucketMap, id, x, y, z, .96);
      }
      if (Math.round(z * 10) % 8 === 0) addMacro(bucketMap, "orange", x0, y0 + .48, z, .9);
    }
    // Exhaust nozzle rings.
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2;
      addMacro(bucketMap, "cyan", x0 + Math.cos(a) * .38, y0 + Math.sin(a) * .33, -8.08, .98);
    }
  });

  // Lateral radiator wings and diagonal armor spars.
  for (const side of [-1, 1]) {
    for (let x = side * 1.0; Math.abs(x) < 4.2; x += side * step) {
      const span = Math.abs(x);
      const z = -2.25 - (span - 1) * .5;
      for (let y = -.12; y <= .16; y += step) {
        addMacro(bucketMap, span > 2.5 ? "hullShade" : "graphite2", x, y, z, .9);
        if (Math.round(span * 10) % 7 === 0) addMacro(bucketMap, "orange", x, .3, z, .88);
      }
    }
    for (let z = -4.8; z <= -1.2; z += step) {
      addMacro(bucketMap, "hullBright", side * 2.16, .83, z, .88);
      if (Math.round(z * 10) % 11 === 0) addMacro(bucketMap, "orangeHot", side * 2.16, 1.03, z, .88);
    }
  }

  // High-density structured greebles; all are surface-tied, never free noise.
  for (let i = 0; i < 42000; i++) {
    const z = -7.3 + random() * 13.8;
    const subsystem = random();
    let x;
    let y;
    if (subsystem < .55) {
      const edge = random() > .5 ? 1 : -1;
      x = edge * (.55 + random() * 1.15);
      y = (random() - .5) * 1.1;
    } else if (subsystem < .82) {
      const side = random() > .5 ? 1 : -1;
      x = side * (1.5 + random() * 1.7);
      y = -.05 + random() * .75;
    } else {
      x = (random() - .5) * 2.5;
      y = .68 + random() * .42;
    }
    const id = random() > .86 ? "orange" : random() > .55 ? "graphite" : random() > .32 ? "hullBright" : "hullShade";
    addMacro(bucketMap, id, x, y, z, .55 + random() * .28);
  }

  const voxel = new THREE.BoxGeometry(.16, .16, .16);
  for (const [id, items] of bucketMap) {
    const material = macroMaterials[id];
    const mesh = new THREE.InstancedMesh(voxel, material, items.length);
    const helper = new THREE.Object3D();
    items.forEach((item, index) => {
      helper.position.set(item.x, item.y, item.z);
      helper.scale.setScalar(item.scale);
      helper.rotation.set(0, 0, 0);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = false;
    shipRoot.add(mesh);
    activeVoxelTotal += items.length;
  }
}

function makeMicroVoxelMaterial() {
  const vertexShader = `
    attribute vec3 iPosition;
    attribute float iScale;
    attribute vec3 iColor;
    attribute float iPhase;
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vPulse;
    void main(){
      vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
      vec3 up = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
      float pulse = 1.0 + sin(uTime * .65 + iPhase * 6.28318) * .035;
      vec3 world = iPosition + (right * position.x + up * position.y) * iScale * pulse;
      vUv = uv;
      vColor = iColor;
      vPulse = pulse;
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    }
  `;
  const fragmentShader = `
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vPulse;
    void main(){
      vec2 p = abs(vUv - .5) * 2.0;
      float edge = max(p.x, p.y);
      if(edge > .92) discard;
      float bevel = smoothstep(.96, .7, edge);
      float topLight = .72 + (1.0 - p.y) * .2 + (1.0 - p.x) * .08;
      vec3 color = vColor * topLight * bevel;
      gl_FragColor = vec4(color, 1.0);
    }
  `;
  return new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { uTime: { value: 0 } }, transparent: false, depthWrite: true, depthTest: true, blending: THREE.NormalBlending, toneMapped: true });
}

function createMicroVoxelField() {
  const positions = new Float32Array(MICRO_VOXELS * 3);
  const scales = new Float32Array(MICRO_VOXELS);
  const colors = new Float32Array(MICRO_VOXELS * 3);
  const phases = new Float32Array(MICRO_VOXELS);
  const random = seededRandom(900913);
  const temp = new THREE.Color();
  const engines = [[-1.58, -.62], [1.58, -.62], [-1.58, .56], [1.58, .56]];
  const write = (index, x, y, z, scale, color, phase) => {
    const p = index * 3;
    positions[p] = x;
    positions[p + 1] = y;
    positions[p + 2] = z;
    scales[index] = scale;
    temp.copy(color);
    colors[p] = temp.r;
    colors[p + 1] = temp.g;
    colors[p + 2] = temp.b;
    phases[index] = phase;
  };

  for (let i = 0; i < MICRO_VOXELS; i++) {
    const r = random();
    let x;
    let y;
    let z;
    let color;
    if (r < .44) {
      // Armored spine surface. Keeps the million-count layer locked to the ship hull.
      z = -7.1 + random() * 13.7;
      const nose = THREE.MathUtils.clamp((z - 2.1) / 3.2, 0, 1);
      const rx = .92 - nose * .55;
      const ry = .72 - nose * .4;
      const a = random() * Math.PI * 2;
      x = Math.cos(a) * rx * (.88 + random() * .2);
      y = Math.sin(a) * ry * (.88 + random() * .2);
      color = random() > .83 ? PALETTE.hullBright : random() > .59 ? PALETTE.hullShade : random() > .32 ? PALETTE.graphite2 : PALETTE.hull;
    } else if (r < .68) {
      // Radial ring skin, with bright outer edge and dark inner cavity.
      const a = random() * Math.PI * 2;
      const radial = (random() - .5) * .92;
      const radius = 3.42 + radial;
      x = Math.cos(a) * radius + (random() - .5) * .08;
      y = Math.sin(a) * radius + (random() - .5) * .08;
      z = (random() - .5) * .72;
      const band = (a > .5 && a < .78) || (a > 3.48 && a < 3.78);
      color = band ? PALETTE.orange : radial > .2 ? PALETTE.hullBright : radial < -.22 ? PALETTE.graphite : PALETTE.hullShade;
    } else if (r < .9) {
      // Engine casings and the material immediately around their blue cores.
      const [ex, ey] = engines[Math.floor(random() * engines.length)];
      z = -8.1 + random() * 4.9;
      const a = random() * Math.PI * 2;
      const rr = .3 + random() * .32;
      x = ex + Math.cos(a) * rr;
      y = ey + Math.sin(a) * rr;
      color = z < -7.25 ? (random() > .3 ? PALETTE.cyan : PALETTE.blue) : random() > .78 ? PALETTE.orange : PALETTE.graphite;
    } else {
      // Wings, pylon ribs and service modules.
      const side = random() > .5 ? 1 : -1;
      const span = 1.0 + random() * 3.35;
      x = side * span;
      y = random() * .9 - .18;
      z = -4.9 + random() * 3.7 - (span - 1) * .38;
      color = random() > .8 ? PALETTE.orange : random() > .43 ? PALETTE.hullBright : PALETTE.graphite;
    }
    const scale = .038 + random() * .055;
    write(i, x, y, z, scale, color, random());
  }

  const plane = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = plane.index;
  geometry.attributes.position = plane.attributes.position;
  geometry.attributes.uv = plane.attributes.uv;
  geometry.setAttribute("iPosition", new THREE.InstancedBufferAttribute(positions, 3));
  geometry.setAttribute("iScale", new THREE.InstancedBufferAttribute(scales, 1));
  geometry.setAttribute("iColor", new THREE.InstancedBufferAttribute(colors, 3));
  geometry.setAttribute("iPhase", new THREE.InstancedBufferAttribute(phases, 1));
  geometry.instanceCount = MICRO_VOXELS;
  microMaterial = makeMicroVoxelMaterial();
  microField = new THREE.Mesh(geometry, microMaterial);
  microField.frustumCulled = false;
  shipRoot.add(microField);
  activeVoxelTotal += MICRO_VOXELS;
}

function createPlumeField() {
  const engines = [[-1.58, -.62], [1.58, -.62], [-1.58, .56], [1.58, .56]];
  const count = 9600;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const random = seededRandom(112233);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const [ex, ey] = engines[i % engines.length];
    const p = i * 3;
    const a = random() * Math.PI * 2;
    const rr = random() * .3;
    positions[p] = ex + Math.cos(a) * rr;
    positions[p + 1] = ey + Math.sin(a) * rr;
    positions[p + 2] = -8.25 - random() * 4.8;
    phases[i] = random();
    color.copy(i % 5 === 0 ? PALETTE.blue : PALETTE.cyan);
    colors[p] = color.r;
    colors[p + 1] = color.g;
    colors[p + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  plumeMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aPhase; attribute vec3 aColor; varying vec3 vColor; varying float vAlpha; uniform float uTime; void main(){vec3 p=position; p.z -= mod(uTime*2.7+aPhase*4.8,4.5); vec4 mv=modelViewMatrix*vec4(p,1.0); vColor=aColor; vAlpha=clamp(1.0-(-mv.z/36.0),.35,1.0); gl_PointSize=max(2.0,7.4*(1.0+10.0/(-mv.z))); gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vColor; varying float vAlpha; void main(){vec2 p=abs(gl_PointCoord-.5)*2.0; float d=max(p.x,p.y); if(d>.92) discard; float edge=smoothstep(1.0,.4,d); gl_FragColor=vec4(vColor*.72,edge*vAlpha*.42);}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  plumeField = new THREE.Points(geometry, plumeMaterial);
  plumeField.frustumCulled = false;
  shipRoot.add(plumeField);
}

function createStars() {
  const count = QUALITY[quality].stars;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const random = seededRandom(774411);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const radius = 38 + random() * 110;
    const p = i * 3;
    positions[p] = Math.sin(phi) * Math.cos(theta) * radius;
    positions[p + 1] = Math.cos(phi) * radius * .7;
    positions[p + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    color.set(random() > .84 ? 0xffb071 : random() > .42 ? 0xbbeeff : 0x7893c2);
    const strength = .28 + random() * .72;
    colors[p] = color.r * strength;
    colors[p + 1] = color.g * strength;
    colors[p + 2] = color.b * strength;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: .06, vertexColors: true, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending });
  starField = new THREE.Points(geometry, material);
  scene.add(starField);
}

function createDebris() {
  const count = QUALITY[quality].dust;
  const geometry = new THREE.TetrahedronGeometry(.07, 0);
  const material = new THREE.MeshBasicMaterial({ color: 0x8adce8, transparent: true, opacity: .17 });
  debrisField = new THREE.InstancedMesh(geometry, material, count);
  const random = seededRandom(444222);
  const helper = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 9 + random() * 48;
    helper.position.set(Math.cos(angle) * radius, (random() - .5) * 18, Math.sin(angle) * radius - 7);
    helper.scale.setScalar(.2 + random() * 1.4);
    helper.rotation.set(random() * 2, random() * 2, random() * 2);
    helper.updateMatrix();
    debrisField.setMatrixAt(i, helper.matrix);
  }
  debrisField.instanceMatrix.needsUpdate = true;
  debrisField.frustumCulled = false;
  scene.add(debrisField);
}

function addEngineLights() {
  for (const [x, y] of [[-1.58, -.62], [1.58, -.62], [-1.58, .56], [1.58, .56]]) {
    const light = new THREE.PointLight(0x35dcff, 1.35, 8.5, 2);
    light.position.set(x, y, -8.2);
    shipRoot.add(light);
    engineLights.push(light);
  }
}

function buildScene() {
  shipRoot = new THREE.Group();
  shipRoot.position.y = -.12;
  scene.add(shipRoot);
  buildMacroShip();
  createMicroVoxelField();
  createPlumeField();
  addEngineLights();
  createStars();
  createDebris();
}

function updateCamera() {
  const preset = VIEW_PRESETS[activeView];
  const drift = autoOrbit ? elapsed * (activeView === "engine" ? .032 : .05) : 0;
  const yaw = orbitYaw + drift;
  const pitch = THREE.MathUtils.clamp(orbitPitch + Math.sin(elapsed * .21) * .012, -.32, .72);
  const horizontal = Math.cos(pitch) * orbitDistance;
  camera.position.set(lookTarget.x + Math.sin(yaw) * horizontal, lookTarget.y + Math.sin(pitch) * orbitDistance, lookTarget.z + Math.cos(yaw) * horizontal);
  camera.lookAt(lookTarget);
  if (viewLabel) viewLabel.textContent = preset.label;
}

function selectView(view, announce = true) {
  const preset = VIEW_PRESETS[view] || VIEW_PRESETS.pursuit;
  activeView = view;
  orbitYaw = preset.yaw;
  orbitPitch = preset.pitch;
  orbitDistance = preset.distance;
  lookTarget.copy(preset.target);
  autoOrbit = true;
  autoButton?.classList.add("is-active");
  if (autoButton) autoButton.textContent = "AUTO ORBIT";
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  if (announce) showToast(`${preset.label} / CAMERA LOCKED`);
}

function resetView(announce = true) {
  selectView("pursuit", false);
  if (announce) showToast("HERO VECTOR RESET");
}

function setQuality(next) {
  quality = next;
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[quality].pixelRatio));
  bloom.strength = QUALITY[quality].bloom;
  if (microField) microField.visible = QUALITY[quality].microVisible;
  if (densityLabel) densityLabel.textContent = QUALITY[quality].microVisible
    ? `${activeVoxelTotal.toLocaleString("en-US")} VOXELS`
    : `${activeVoxelTotal.toLocaleString("en-US")} VOXELS / MICRO HIDDEN`;
  showToast(`RENDER PROFILE / ${next.toUpperCase()}`);
}

function bindControls() {
  root.style.touchAction = "none";
  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    autoOrbit = false;
    autoButton?.classList.remove("is-active");
    if (autoButton) autoButton.textContent = "MANUAL VECTOR";
    pointerX = event.clientX;
    pointerY = event.clientY;
    root.setPointerCapture(event.pointerId);
    root.classList.add("is-dragging");
  });
  root.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    orbitYaw -= (event.clientX - pointerX) * .004;
    orbitPitch = THREE.MathUtils.clamp(orbitPitch + (event.clientY - pointerY) * .0032, -.3, .72);
    pointerX = event.clientX;
    pointerY = event.clientY;
  });
  const release = (event) => {
    dragging = false;
    if (event.pointerId !== undefined && root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
    root.classList.remove("is-dragging");
  };
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);
  root.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbitDistance = THREE.MathUtils.clamp(orbitDistance + event.deltaY * .012, 9, 28);
  }, { passive: false });
  autoButton?.addEventListener("click", () => {
    autoOrbit = !autoOrbit;
    autoButton.classList.toggle("is-active", autoOrbit);
    autoButton.textContent = autoOrbit ? "AUTO ORBIT" : "MANUAL VECTOR";
    showToast(autoOrbit ? "AUTOPILOT ORBIT ENGAGED" : "MANUAL VECTOR ENGAGED");
  });
  resetButton?.addEventListener("click", () => resetView());
  qualitySelect?.addEventListener("change", () => setQuality(qualitySelect.value));
  retryButton?.addEventListener("click", () => window.location.reload());
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => selectView(button.dataset.view)));
  window.addEventListener("keydown", (event) => { if (event.key.toLowerCase() === "r") resetView(); });
  window.addEventListener("resize", resize);
}

function resize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth * .64, innerHeight * .64);
}

function tick() {
  const delta = Math.min(clock.getDelta(), .05);
  if (!paused) elapsed += delta;
  updateCamera();
  if (shipRoot) {
    shipRoot.position.y = -.12 + Math.sin(elapsed * .34) * .045;
    shipRoot.rotation.z = Math.sin(elapsed * .18) * .006;
  }
  if (microMaterial) microMaterial.uniforms.uTime.value = elapsed;
  if (plumeMaterial) plumeMaterial.uniforms.uTime.value = elapsed;
  if (starField) starField.rotation.y = elapsed * .0025;
  if (debrisField) debrisField.rotation.y = -elapsed * .005;
  engineLights.forEach((light, index) => { light.intensity = 1.15 + Math.sin(elapsed * 7.5 + index) * .16; });
  composer.render(delta);
  frameCount++;
  const now = performance.now();
  if (now - fpsStamp > 700) {
    if (fpsReadout) fpsReadout.textContent = `${Math.round(frameCount * 1000 / (now - fpsStamp))} FPS`;
    frameCount = 0;
    fpsStamp = now;
  }
  if (timeReadout) timeReadout.textContent = new Date(elapsed * 1000).toISOString().slice(14, 19);
}

async function init() {
  try {
    if (!root) throw new Error("Scene root missing");
    updateLoading(8, "BOOTING VOXEL GPU");
    setupRenderer();
    setupLights();
    updateLoading(22, "READING REFERENCE SKY");
    new THREE.TextureLoader().load(referenceTextureUrl, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      if (status) status.textContent = "LINK STABLE · IMAGE LOCKED";
    }, undefined, () => { if (status) status.textContent = "LINK STABLE · PROCEDURAL SKY"; });
    updateLoading(38, "FORGING MACRO HULL");
    buildScene();
    updateLoading(74, `ALLOCATING ${activeVoxelTotal.toLocaleString("en-US")} VOXELS`);
    if (activeVoxelTotal < MICRO_VOXELS) {
      throw new Error(`Voxel budget underflow: generated ${activeVoxelTotal}, required ${MICRO_VOXELS}`);
    }
    window.__NATURAL_SELECTION_VOXEL_METRICS__ = {
      microInstances: MICRO_VOXELS,
      macroInstances: activeVoxelTotal - MICRO_VOXELS,
      totalInstances: activeVoxelTotal
    };
    console.info("[natural-selection] voxel budget", window.__NATURAL_SELECTION_VOXEL_METRICS__);
    if (voxelCount) voxelCount.textContent = activeVoxelTotal.toLocaleString("en-US");
    if (densityLabel) densityLabel.textContent = `${activeVoxelTotal.toLocaleString("en-US")} VOXELS`;
    updateLoading(96, "CALIBRATING PURSUIT CAMERA");
    bindControls();
    resetView(false);
    if (status) status.textContent = `LINK STABLE · ${activeVoxelTotal.toLocaleString("en-US")} VOXEL FIELD`;
    loading?.classList.add("is-hidden");
    showToast("NATURAL SELECTION / MILLION-VOXEL FIELD READY");
    renderer.setAnimationLoop(tick);
  } catch (error) {
    console.error(error);
    if (loading) loading.hidden = true;
    if (errorCard) errorCard.hidden = false;
    if (status) status.textContent = "LINK FAILED";
  }
}

init();
