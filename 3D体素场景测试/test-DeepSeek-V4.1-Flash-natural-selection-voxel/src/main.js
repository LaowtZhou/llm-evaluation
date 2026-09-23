/**
 * main.js —— 《自然选择号 · 体素全景》主程序
 */

import * as THREE from '../vendor/three.module.js';
import { buildNaturalSelection, GRID } from './ship.js';
import { buildVoxelGeometry, VoxelGrid, Palette } from './voxel.js';
import {
  createStarfield, createDust, PlasmaPlume, createPlanet,
  createDebrisField, SUN_DIR,
} from './space.js';
import { PostFX } from './postfx.js';

/* ============================== 状态 ============================== */

const state = {
  ready: false,
  paused: false,
  autoTour: true,
  hudHidden: false,
  shotIndex: 0,
  shotTime: 0,
  elapsed: 0,
  renderScale: 1,
  basePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  autoQuality: true,
  ignition: 1,
  fps: 0,
  fpsAcc: 0,
  fpsFrames: 0,
  slowFrames: 0,
  fastFrames: 0,
};

const $ = (sel) => document.querySelector(sel);

const el = {
  canvasHost: $('#scene-root'),
  loading: $('#loading'),
  loadingBar: $('#loading-bar'),
  loadingPct: $('#loading-pct'),
  loadingStep: $('#loading-step'),
  error: $('#error-card'),
  errorText: $('#error-text'),
  fps: $('#m-fps'),
  shotName: $('#shot-name'),
  shotSub: $('#shot-sub'),
  statCells: $('#stat-cells'),
  statVoxels: $('#stat-voxels'),
  statHidden: $('#stat-hidden'),
  statFaces: $('#stat-faces'),
  statTris: $('#stat-tris'),
  statBuild: $('#stat-build'),
  toast: $('#toast'),
  hud: $('#hud'),
  hint: $('#hint'),
  tourButton: $('#btn-tour'),
  resetButton: $('#btn-reset'),
  hideButton: $('#btn-hide'),
  shots: Array.from(document.querySelectorAll('[data-shot]')),
};

/* ============================== 工具 ============================== */

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function setLoading(step, pct) {
  if (el.loadingStep) el.loadingStep.textContent = step;
  if (el.loadingPct) el.loadingPct.textContent = Math.round(pct) + '%';
  if (el.loadingBar) el.loadingBar.style.width = pct + '%';
}

const nf = new Intl.NumberFormat('zh-CN');

function fmt(n) {
  return nf.format(Math.round(n));
}

function toast(msg, ms = 2200) {
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.add('is-on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('is-on'), ms);
}

/* ============================== 镜头编排 ============================== */

const RING_WORLD = { x: 0, y: 0, z: -92 };

const SHOTS = [
  {
    id: 'flyby',
    name: '巡航',
    sub: 'CRUISE FLYBY',
    dur: 40,
    roll: (t) => Math.sin(t * Math.PI) * 0.05,
    pos(t) {
      const z = 560 - t * 1180;
      const r = 250 + Math.sin(t * Math.PI) * 210;
      const a = -0.5 + t * 1.05;
      return new THREE.Vector3(Math.sin(a) * r, 150 - t * 190 + Math.sin(t * 5.2) * 22, z);
    },
    look(t) {
      return new THREE.Vector3(0, -6 + Math.sin(t * 3.1) * 14, Math.max(-190, Math.min(200, 240 - t * 520)));
    },
  },
  {
    id: 'bow',
    name: '舰首',
    sub: 'BOW SECTION',
    dur: 30,
    roll: (t) => -0.03 + t * 0.06,
    pos(t) {
      const a = 0.75 - t * 1.5;
      const R = 330;
      return new THREE.Vector3(Math.sin(a) * R, 150 - t * 90, 210 + Math.cos(a) * R * 0.85);
    },
    look() {
      return new THREE.Vector3(0, 8, 150);
    },
  },
  {
    id: 'ring',
    name: '重力环',
    sub: 'GRAVITY RING',
    dur: 36,
    roll: (t) => Math.sin(t * 6.0) * 0.02,
    pos(t) {
      const a = -1.15 + t * 2.5;
      const R = 250 + Math.sin(t * 4.2) * 45;
      return new THREE.Vector3(
        RING_WORLD.x + Math.sin(a) * R,
        RING_WORLD.y + Math.sin(t * 3.4) * 95 + 30,
        RING_WORLD.z + Math.cos(a) * R,
      );
    },
    look(t) {
      return new THREE.Vector3(RING_WORLD.x, RING_WORLD.y, RING_WORLD.z + Math.sin(t * 2.2) * 30);
    },
  },
  {
    id: 'engine',
    name: '引擎',
    sub: 'PROPULSION',
    dur: 30,
    roll: (t) => Math.cos(t * 5.0) * 0.03,
    pos(t) {
      const a = -0.55 + t * 1.1;
      return new THREE.Vector3(
        Math.sin(a) * 230,
        -60 + Math.sin(t * 3.6) * 70,
        -400 - Math.cos(t * 2.4) * 130,
      );
    },
    look() {
      return new THREE.Vector3(0, 0, -175);
    },
  },
  {
    id: 'wide',
    name: '全景',
    sub: 'WIDE SHOT',
    dur: 44,
    roll: (t) => -0.02 + Math.sin(t * 2.2) * 0.03,
    pos(t) {
      const a = -0.85 + t * 0.75;
      const R = 1180 + Math.sin(t * 3.0) * 180;
      return new THREE.Vector3(Math.sin(a) * R, 230 + Math.sin(t * 2.4) * 210, Math.cos(a) * R - 60);
    },
    look(t) {
      return new THREE.Vector3(0, Math.sin(t * 2.6) * 25, -30);
    },
  },
];

/* ============================== 用户视角控制 ============================== */

const view = {
  yaw: 0, pitch: 0, zoom: 1,
  targetYaw: 0, targetPitch: 0, targetZoom: 1,
  dragging: false, lastX: 0, lastY: 0,
  vYaw: 0, vPitch: 0,
};

function resetView(showToast = true) {
  view.targetYaw = 0;
  view.targetPitch = 0;
  view.targetZoom = 1;
  view.vYaw = 0;
  view.vPitch = 0;
  if (showToast) toast('视角已复位');
}

function bindControls(canvas) {
  const onDown = (e) => {
    if (e.button !== 0) return;
    view.dragging = true;
    view.lastX = e.clientX;
    view.lastY = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.classList.add('is-grabbing');
  };
  const onMove = (e) => {
    if (!view.dragging) return;
    const dx = e.clientX - view.lastX;
    const dy = e.clientY - view.lastY;
    view.lastX = e.clientX;
    view.lastY = e.clientY;
    view.targetYaw -= dx * 0.0052;
    view.targetPitch = Math.max(-1.15, Math.min(1.15, view.targetPitch - dy * 0.0042));
    view.vYaw = -dx * 0.0052;
    view.vPitch = dy * 0.0042;
  };
  const onUp = () => {
    view.dragging = false;
    canvas.classList.remove('is-grabbing');
  };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.0011);
    view.targetZoom = Math.max(0.28, Math.min(3.4, view.targetZoom * factor));
  }, { passive: false });

  // 触屏双指缩放
  let pinch = null;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinch = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinch) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      view.targetZoom = Math.max(0.28, Math.min(3.4, view.targetZoom * (pinch / Math.max(1, d))));
      pinch = d;
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => { pinch = null; }, { passive: true });
}

/* ============================== 体素碎屑 ============================== */

function buildRockGeometry(seed) {
  const g = new VoxelGrid(11, 11, 11);
  const pal = new Palette();
  const light = pal.add('rock-light', 0x918a7e, { jitter: 0.34 });
  const dark = pal.add('rock-dark', 0x554f47, { jitter: 0.34 });
  const gold = pal.add('rock-gold', 0x8a7346, { jitter: 0.28 });

  let s = (seed * 2654435761) >>> 0;
  const rand = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let x = 0; x < 11; x++) {
    for (let y = 0; y < 11; y++) {
      for (let z = 0; z < 11; z++) {
        const dx = x - 5, dy = y - 5, dz = z - 5;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const wob = 1.2 * Math.sin(x * 1.1 + seed) * Math.cos(z * 0.9 + seed * 2) + (rand() - 0.5) * 1.5;
        if (d + wob < 3.5) {
          const r = rand();
          g.set(x, y, z, r < 0.18 ? gold : r < 0.6 ? light : dark);
        }
      }
    }
  }
  const { solid } = buildVoxelGeometry(g, pal, { ao: true });
  return {
    solid,
    offset: new THREE.Vector3(-5.5, -5.5, -5.5),
  };
}

/* ============================== 主流程 ============================== */

async function boot() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    return fail('当前浏览器无法创建 WebGL 上下文。请开启硬件加速或换用 Chrome / Edge 最新版。');
  }
  if (renderer.capabilities.isWebGL2 === false) {
    return fail('当前浏览器只支持 WebGL 1，本场景需要 WebGL 2。请升级浏览器。');
  }

  renderer.setPixelRatio(state.basePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'scene-canvas';
  el.canvasHost.appendChild(renderer.domElement);

  setLoading('初始化渲染器', 4);
  await nextFrame();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, window.innerWidth / window.innerHeight, 1, 60000);
  camera.position.set(700, 320, 900);

  /* ---------- 1. 体素雕塑 ---------- */
  setLoading('正在放样舰体结构', 10);
  await nextFrame();
  const ship = buildNaturalSelection();

  setLoading('网格化 · 面剔除 · AO 烘焙', 30);
  await nextFrame();
  const tMesh = performance.now();
  const meshed = buildVoxelGeometry(ship.grid, ship.palette, { ao: true });
  const meshMs = performance.now() - tMesh;
  const hidden = ship.grid.countHidden();

  setLoading('装配舰体网格', 46);
  await nextFrame();

  const b = ship.bounds;
  const centerX = (b.minX + b.maxX + 1) / 2;
  const centerY = (b.minY + b.maxY + 1) / 2;
  const centerZ = (b.minZ + b.maxZ + 1) / 2;
  const shipRoot = new THREE.Group();
  shipRoot.position.set(-centerX, -centerY, -centerZ);
  scene.add(shipRoot);

  const hullMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.56,
    metalness: 0.24,
    envMapIntensity: 0.85,
  });
  const emissiveMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    fog: false,
  });

  const hullMesh = new THREE.Mesh(toGeometry(meshed.solid), hullMaterial);
  hullMesh.name = 'hull';
  shipRoot.add(hullMesh);

  const emissiveMesh = new THREE.Mesh(toGeometry(meshed.emissive), emissiveMaterial);
  emissiveMesh.name = 'hull-lights';
  shipRoot.add(emissiveMesh);

  /* ---------- 2. 宇宙背景 ---------- */
  setLoading('铺设星云背景', 56);
  await nextFrame();

  const texLoader = new THREE.TextureLoader();
  let panorama = null;
  // 单文件交付时，背景图已由 build.mjs 以 base64 内联进 HTML。
  // 优先用它，保证「HTML 拷到哪都能看」；只有开发态（拆分源码跑）才回落到本地文件。
  const inlined = typeof window !== 'undefined' && window.__SPACE_PANORAMA__;
  const sources = inlined
    ? [inlined]
    : ['space-panorama.jpg', './assets/space-panorama.jpg'];
  for (const src of sources) {
    try {
      panorama = await texLoader.loadAsync(src);
      break;
    } catch (err) {
      panorama = null;
    }
  }

  if (panorama) {
    panorama.mapping = THREE.EquirectangularReflectionMapping;
    panorama.colorSpace = THREE.SRGBColorSpace;
    panorama.minFilter = THREE.LinearFilter;
    panorama.magFilter = THREE.LinearFilter;
    panorama.generateMipmaps = false;
    scene.background = panorama;
    scene.backgroundIntensity = 0.92;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envRT = pmrem.fromEquirectangular(panorama);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  setLoading('点亮星光', 66);
  await nextFrame();

  const stars = createStarfield({ count: 44000 });
  scene.add(stars.points);
  const dust = createDust({ count: 1500 });
  scene.add(dust.points);

  const planet = createPlanet();
  scene.add(planet.group);

  // 太阳方向上的耀眼远星
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSunTexture(),
    color: 0xfff0d8,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  }));
  sunSprite.position.copy(SUN_DIR).multiplyScalar(26000);
  sunSprite.scale.setScalar(4200);
  scene.add(sunSprite);

  setLoading('清扫轨道碎屑', 76);
  await nextFrame();

  const debris = createDebrisField((seed) => {
    const rock = buildRockGeometry(seed);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(rock.solid.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(rock.solid.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(rock.solid.colors, 3, true));
    geo.setIndex(new THREE.BufferAttribute(rock.solid.indices, 1));
    geo.translate(rock.offset.x, rock.offset.y, rock.offset.z);
    return geo;
  }, { perVariant: 110, extent: 3000 });
  for (const d of debris) scene.add(d.inst);

  /* ---------- 3. 灯光 ---------- */
  const keyLight = new THREE.DirectionalLight(0xffd2a6, 3.3);
  keyLight.position.copy(SUN_DIR).multiplyScalar(2000);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x6ea8ff, 1.5);
  rimLight.position.set(-0.72, -0.18, -0.66).multiplyScalar(2000);
  scene.add(rimLight);

  const bounceLight = new THREE.DirectionalLight(0x4a6cff, 0.55);
  bounceLight.position.set(0.1, -1, 0.35).multiplyScalar(1500);
  scene.add(bounceLight);

  scene.add(new THREE.HemisphereLight(0x33406b, 0x05060a, 0.55));

  /* ---------- 4. 引擎点火 ---------- */
  setLoading('引擎点火', 86);
  await nextFrame();

  const plumes = [];
  for (let i = 0; i < ship.nozzles.length; i++) {
    const n = ship.nozzles[i];
    const p = new PlasmaPlume(n, {
      length: 300 + (i % 2) * 40,
      baseRadius: 12.6,
      tipRadius: 3.4,
      seed: i * 3.7,
    });
    shipRoot.add(p.group);
    plumes.push(p);
  }
  const auxPlumes = [];
  for (let i = 0; i < ship.auxNozzles.length; i++) {
    const n = ship.auxNozzles[i];
    const p = new PlasmaPlume(n, {
      length: n.small ? 90 : 120,
      baseRadius: n.small ? 4 : 7,
      tipRadius: 1.1,
      seed: 20 + i * 2.3,
      light: false,
    });
    shipRoot.add(p.group);
    auxPlumes.push(p);
  }

  /* ---------- 5. 后处理 ---------- */
  setLoading('编译后期管线', 94);
  await nextFrame();

  const post = new PostFX(renderer, scene, camera);
  resize();

  /* ---------- 统计面板 ---------- */
  if (el.statCells) el.statCells.textContent = fmt(ship.cells);
  if (el.statVoxels) el.statVoxels.textContent = fmt(ship.grid.solid);
  if (el.statHidden) el.statHidden.textContent = fmt(hidden);
  if (el.statFaces) el.statFaces.textContent = fmt(meshed.stats.faces);
  if (el.statTris) el.statTris.textContent = fmt(meshed.stats.triangles);
  if (el.statBuild) el.statBuild.textContent = fmt(ship.sculptMs + meshMs) + ' ms';

  setLoading('完成', 100);
  await nextFrame();

  state.ready = true;
  el.loading.classList.add('is-done');
  setTimeout(() => el.loading.classList.add('is-gone'), 900);
  toast('拖拽旋转 · 滚轮缩放 · 数字键切换机位');

  /* ============================== 渲染循环 ============================== */

  const clock = new THREE.Clock();
  const camLook = new THREE.Vector3(0, 0, 0);
  const lookAim = new THREE.Vector3(0, 0, 0);
  const posAim = new THREE.Vector3().copy(camera.position);
  const basePos = new THREE.Vector3().copy(camera.position);
  const spherical = new THREE.Spherical();
  const tmp = new THREE.Vector3();

  // 初始机位：从远处推入
  const first = SHOTS[0];
  basePos.copy(first.pos(0)).multiplyScalar(1.6);
  lookAim.copy(first.look(0));
  camLook.copy(lookAim);

  /* ---------- 交互绑定 ----------
   * 必须放在所有循环状态（clock / camLook / basePos / spherical / tmp …）声明之后。
   * bindHud() 会立刻调用一次 switchShot()，而它读写的都是这些状态；
   * 一旦绑定提前，任何还没执行到的 let/const 都会直接踩 TDZ 报错，
   * 表现就是"加载到 94% 然后弹错误卡片"。上一版就是这么挂的。
   */
  bindControls(renderer.domElement);
  bindHud();

  function switchShot(index, announce = true) {
    if (index === state.shotIndex && state.ready) return;
    state.shotIndex = index;
    state.shotTime = 0;
    const s = SHOTS[index];
    if (el.shotName) el.shotName.textContent = s.name;
    if (el.shotSub) el.shotSub.textContent = s.sub;
    el.shots.forEach((btn, i) => btn.classList.toggle('is-active', i === index));
    if (announce && state.ready) toast('切换机位：' + s.name);
  }

  function bindHud() {
    el.shots.forEach((btn, i) => {
      btn.addEventListener('click', () => switchShot(i));
    });
    el.tourButton?.addEventListener('click', () => {
      state.autoTour = !state.autoTour;
      el.tourButton.classList.toggle('is-active', state.autoTour);
      el.tourButton.textContent = state.autoTour ? '自动巡航 开' : '自动巡航 关';
      toast(state.autoTour ? '已开启自动巡航' : '已暂停自动巡航，可自由观察');
    });
    el.resetButton?.addEventListener('click', () => resetView());
    el.hideButton?.addEventListener('click', () => toggleHud());

    window.addEventListener('keydown', (e) => {
      if (e.key >= '1' && e.key <= String(SHOTS.length)) {
        switchShot(Number(e.key) - 1);
      } else if (e.code === 'Space') {
        e.preventDefault();
        el.tourButton?.click();
      } else if (e.key === 'r' || e.key === 'R') {
        resetView();
      } else if (e.key === 'h' || e.key === 'H') {
        toggleHud();
      }
    });
    switchShot(0, false);
  }

  function toggleHud() {
    state.hudHidden = !state.hudHidden;
    el.hud.classList.toggle('is-hidden', state.hudHidden);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = state.basePixelRatio * state.renderScale;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w * dpr, h * dpr);
    stars.material.uniforms.uScale.value = renderer.domElement.height * 1.15;
    dust.material.uniforms.uScale.value = renderer.domElement.height * 0.34;
  }
  window.addEventListener('resize', resize);

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fail('图形上下文已丢失。请刷新页面重试。');
  });

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    const time = clock.elapsedTime;
    state.elapsed += dt;

    // ----- 画质自适应 -----
    state.fpsAcc += dt;
    state.fpsFrames += 1;
    if (state.fpsAcc >= 0.5) {
      const fps = state.fpsFrames / state.fpsAcc;
      state.fps = state.fps ? state.fps * 0.55 + fps * 0.45 : fps;
      state.fpsAcc = 0;
      state.fpsFrames = 0;
      if (el.fps) el.fps.textContent = Math.round(state.fps);
      if (state.autoQuality && state.ready) {
        if (state.fps < 38) {
          state.slowFrames++;
          state.fastFrames = 0;
          if (state.slowFrames >= 6 && state.renderScale > 0.62) {
            state.renderScale = Math.max(0.62, state.renderScale - 0.09);
            state.slowFrames = 0;
            resize();
          }
        } else if (state.fps > 57) {
          state.fastFrames++;
          state.slowFrames = 0;
          if (state.fastFrames >= 14 && state.renderScale < 1) {
            state.renderScale = Math.min(1, state.renderScale + 0.06);
            state.fastFrames = 0;
            resize();
          }
        } else {
          state.slowFrames = 0;
          state.fastFrames = 0;
        }
      }
    }

    // ----- 镜头时间推进 -----
    const shot = SHOTS[state.shotIndex];
    if (!state.paused) state.shotTime += dt;
    if (state.autoTour && state.shotTime > shot.dur) {
      switchShot((state.shotIndex + 1) % SHOTS.length, false);
    }
    const t = Math.min(1, state.shotTime / shot.dur);

    posAim.copy(shot.pos(t));
    lookAim.copy(shot.look(t));

    const k = 1 - Math.exp(-2.4 * dt);
    basePos.lerp(posAim, k);
    camLook.lerp(lookAim, k);

    // ----- 视角偏移阻尼 -----
    const kv = 1 - Math.exp(-9 * dt);
    if (!view.dragging) {
      view.targetYaw += view.vYaw * 2 * dt;
      view.targetPitch = Math.max(-1.15, Math.min(1.15, view.targetPitch + view.vPitch * 2 * dt));
      view.vYaw *= Math.exp(-5 * dt);
      view.vPitch *= Math.exp(-5 * dt);
    } else {
      view.vYaw = 0;
      view.vPitch = 0;
    }
    view.yaw += (view.targetYaw - view.yaw) * kv;
    view.pitch += (view.targetPitch - view.pitch) * kv;
    view.zoom += (view.targetZoom - view.zoom) * (1 - Math.exp(-6 * dt));

    tmp.copy(basePos).sub(camLook);
    spherical.setFromVector3(tmp);
    spherical.theta += view.yaw;
    spherical.phi = Math.max(0.12, Math.min(Math.PI - 0.12, spherical.phi + view.pitch));
    spherical.radius *= view.zoom;

    camera.position.copy(camLook).add(tmp.setFromSpherical(spherical));
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
    camera.rotateZ(shot.roll(t) + view.yaw * 0.05);

    // 极轻微的手持晃动，让画面不呆板
    const shake = state.ready ? 0.5 : 0;
    camera.position.x += Math.sin(time * 1.7) * shake;
    camera.position.y += Math.cos(time * 2.3) * shake;

    // ----- 引擎等离子体 -----
    const ignWave = 0.5 + 0.5 * Math.sin(state.elapsed * 0.55);
    let target = 0.82 + ignWave * 0.22;
    if (shot.id === 'engine') target = 1.5 + ignWave * 0.5;
    if (shot.id === 'wide') target = 1.05 + ignWave * 0.3;
    if (shot.id === 'flyby') target = 0.85 + t * 0.7;
    state.ignition += (target - state.ignition) * (1 - Math.exp(-1.6 * dt));

    for (let i = 0; i < plumes.length; i++) {
      const flick = 0.94 + 0.1 * Math.sin(time * 9.1 + i * 2.4);
      plumes[i].update(time, state.ignition * flick);
    }
    for (const p of auxPlumes) p.update(time, 0.75 + 0.25 * Math.sin(time * 6 + p.seed));

    // ----- 星空 / 碎屑 -----
    stars.material.uniforms.uTime.value = time;
    stars.points.rotation.y = time * 0.0022;
    dust.points.rotation.y = time * 0.0045;
    planet.group.rotation.y = time * 0.004;
    for (const d of debris) {
      for (let i = 0; i < d.data.length; i++) {
        const item = d.data[i];
        item.dummy.rotation.x += item.spin.x * dt;
        item.dummy.rotation.y += item.spin.y * dt;
        item.dummy.rotation.z += item.spin.z * dt;
        item.dummy.updateMatrix();
        d.inst.setMatrixAt(i, item.dummy.matrix);
      }
      d.inst.instanceMatrix.needsUpdate = true;
    }

    // ----- 后期参数联动 -----
    post.params.strength = 0.66 + state.ignition * 0.22;
    post.params.exposure = 1.02 + state.ignition * 0.08;

    post.render(time);
  }

  switchShot(0, false);
  frame();
}

function makeSunTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.06, 'rgba(255,244,220,0.95)');
  g.addColorStop(0.18, 'rgba(255,206,150,0.42)');
  g.addColorStop(0.42, 'rgba(255,150,90,0.14)');
  g.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // 十字星芒
  ctx.globalCompositeOperation = 'lighter';
  const streak = ctx.createLinearGradient(0, size / 2 - 2, 0, size / 2 + 2);
  streak.addColorStop(0, 'rgba(255,255,255,0)');
  streak.addColorStop(0.5, 'rgba(255,250,235,0.55)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, size / 2 - 30, size, 60);
  const streak2 = ctx.createLinearGradient(size / 2 - 2, 0, size / 2 + 2, 0);
  streak2.addColorStop(0, 'rgba(255,255,255,0)');
  streak2.addColorStop(0.5, 'rgba(255,250,235,0.4)');
  streak2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = streak2;
  ctx.fillRect(size / 2 - 30, 0, 60, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function toGeometry(data) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3, true));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function fail(message) {
  if (el.loading) el.loading.classList.add('is-gone');
  if (el.error) {
    el.error.hidden = false;
    if (el.errorText) el.errorText.textContent = message;
  }
  el.error?.querySelector('#retry-button')?.addEventListener('click', () => location.reload());
}

boot().catch((err) => {
  console.error(err);
  fail('场景启动失败：' + (err && err.message ? err.message : String(err)));
});
