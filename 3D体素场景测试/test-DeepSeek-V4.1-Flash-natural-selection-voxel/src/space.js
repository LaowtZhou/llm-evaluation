/**
 * space.js —— 宇宙环境、星空、行星、引擎等离子体、碎屑场
 */

import * as THREE from '../vendor/three.module.js';

export const SUN_DIR = new THREE.Vector3(0.55, 0.46, 0.69).normalize();

/* ------------------------------------------------------------------ */
/* 程序化贴图                                                          */
/* ------------------------------------------------------------------ */

function makeGlowTexture(size = 256, power = 3.0) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const a = Math.pow(Math.max(0, 1 - r), power);
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let glowTexCache = null;
export function glowTexture() {
  if (!glowTexCache) glowTexCache = makeGlowTexture(256, 3.2);
  return glowTexCache;
}

function makeStarSprite(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.sqrt(dx * dx + dy * dy);
      const core = Math.pow(Math.max(0, 1 - r * 2.2), 4);
      const halo = Math.pow(Math.max(0, 1 - r), 5) * 0.5;
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, core + halo) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ */
/* 星空                                                                */
/* ------------------------------------------------------------------ */

export function createStarfield({ count = 42000, minR = 2600, maxR = 12000 } = {}) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const tints = [
    [1.0, 1.0, 1.0],
    [0.78, 0.87, 1.0],
    [1.0, 0.9, 0.76],
    [1.0, 0.78, 0.66],
    [0.86, 0.94, 1.0],
    [1.0, 0.96, 0.88],
  ];
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // 球壳均匀分布
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = minR + Math.pow(Math.random(), 0.55) * (maxR - minR);
    positions[i * 3] = Math.cos(theta) * s * r;
    positions[i * 3 + 1] = u * r;
    positions[i * 3 + 2] = Math.sin(theta) * s * r;

    const t = tints[(Math.random() * tints.length) | 0];
    const lum = 0.35 + Math.pow(Math.random(), 3.2) * 1.5;
    c.setRGB(t[0] * lum, t[1] * lum, t[2] * lum);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = 0.9 + Math.pow(Math.random(), 5) * 8.5;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: window.innerHeight * 0.5 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, aSize * uScale / max(0.001, -mv.z) * 0.9);
        vColor = aColor;
        vTwinkle = 0.72 + 0.28 * sin(uTime * 1.7 + aPhase);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        float core = pow(max(0.0, 1.0 - r * 2.4), 4.0);
        float halo = pow(max(0.0, 1.0 - r * 2.0), 2.0) * 0.35;
        float a = (core + halo) * vTwinkle;
        if (a <= 0.002) discard;
        gl_FragColor = vec4(vColor * (0.6 + core * 1.6), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'starfield';
  return { points, material: mat };
}

/** 近处漂浮的微尘，用速度感强化沉浸 */
export function createDust({ count = 1400, radius = 900 } = {}) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * radius * 2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * radius * 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * radius * 2;
    speeds[i] = 0.4 + Math.random() * 1.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: window.innerHeight * 0.5 } },
    vertexShader: /* glsl */ `
      attribute float aSpeed;
      uniform float uScale;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = clamp(uScale * 0.5 / max(0.001, d), 1.0, 5.0);
        vA = smoothstep(1400.0, 120.0, d) * 0.7;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = pow(max(0.0, 1.0 - length(d) * 2.0), 2.0) * vA;
        if (a <= 0.003) discard;
        gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'dust';
  return { points, material: mat };
}

/* ------------------------------------------------------------------ */
/* 引擎等离子体                                                        */
/* ------------------------------------------------------------------ */

const PLASMA_NOISE = /* glsl */ `
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
                   mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                   mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }
`;

export class PlasmaPlume {
  /**
   * @param {{x:number,y:number,z:number}} nozzle 喷口位置（体素坐标，之后整体随舰体变换）
   * @param {{length:number, baseRadius:number, tipRadius:number, hue:number, seed:number}} opts
   */
  constructor(nozzle, opts = {}) {
    const length = opts.length ?? 260;
    const baseRadius = opts.baseRadius ?? 12;
    const tipRadius = opts.tipRadius ?? 4.2;
    this.nozzle = nozzle;
    this.length = length;
    this.baseRadius = baseRadius; // update() 每帧用它缩放辉光，漏赋值会让 sprite 缩放到 NaN
    this.seed = opts.seed ?? 0;
    this.group = new THREE.Group();
    this.group.position.set(nozzle.x, nozzle.y, nozzle.z);

    const mkCone = (rBase, rTip, segments, heightSeg) => {
      const geo = new THREE.CylinderGeometry(rTip, rBase, length, segments, heightSeg, true);
      geo.translate(0, length / 2, 0); // 底面落在原点
      return geo;
    };

    const uniformsBase = {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uCore: { value: new THREE.Color(0.85, 0.96, 1.0) },
      uMid: { value: new THREE.Color(0.25, 0.62, 1.0) },
      uEdge: { value: new THREE.Color(0.06, 0.22, 0.85) },
      uSeed: { value: this.seed },
      uLength: { value: length },
    };

    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `;

    // 外层：主体焰流
    const outerMat = new THREE.ShaderMaterial({
      uniforms: uniformsBase,
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uCore;
        uniform vec3 uMid;
        uniform vec3 uEdge;
        uniform float uSeed;
        uniform float uLength;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vPos;
        ${PLASMA_NOISE}
        void main() {
          float t = clamp(vUv.y, 0.0, 1.0);
          float ang = vUv.x * 6.28318;
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float vol = pow(facing, 1.25);
          vec3 np = vec3(cos(ang) * 1.4, t * 5.2 - uTime * 1.5, sin(ang) * 1.4 + uSeed);
          float turb = fbm3(np);
          turb = 0.5 + turb * 1.05;
          vec3 np2 = vec3(cos(ang + uTime * 0.6) * 3.0, t * 12.0 - uTime * 3.4, sin(ang) * 3.0 + uSeed * 1.7);
          float fine = 0.6 + 0.8 * fbm3(np2);
          float core = pow(facing, 3.0) * exp(-t * 2.4);
          float along = exp(-t * 1.9) * smoothstep(0.0, 0.035, t);
          float shock = sin(t * 34.0 - uTime * 7.5) * 0.5 + 0.5;
          vec3 col = mix(uEdge, uMid, clamp(vol * 0.8 + turb * 0.4, 0.0, 1.0));
          col = mix(col, uCore, clamp(core * 1.35 + turb * 0.28, 0.0, 1.0));
          col *= 0.75 + shock * 0.45;
          float a = (vol * 0.62 + core * 0.85) * turb * fine * along * uIntensity;
          gl_FragColor = vec4(col * 2.35, clamp(a, 0.0, 1.0));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    // 内层：白热核心
    const coreMat = new THREE.ShaderMaterial({
      uniforms: uniformsBase,
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uSeed;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        ${PLASMA_NOISE}
        void main() {
          float t = clamp(vUv.y, 0.0, 1.0);
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float vol = pow(facing, 2.6);
          float along = exp(-t * 3.4) * smoothstep(0.0, 0.02, t);
          float flick = 0.85 + 0.3 * fbm3(vec3(t * 9.0, uTime * 4.0, uSeed));
          vec3 col = mix(vec3(0.55, 0.85, 1.0), vec3(1.0, 1.0, 1.0), pow(1.0 - t, 1.6));
          float a = vol * along * flick * uIntensity * 0.95;
          gl_FragColor = vec4(col * 3.4, clamp(a, 0.0, 1.0));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const outer = new THREE.Mesh(mkCone(baseRadius, tipRadius, 44, 56), outerMat);
    const inner = new THREE.Mesh(mkCone(baseRadius * 0.44, tipRadius * 0.5, 30, 40), coreMat);
    outer.rotation.x = -Math.PI / 2;
    inner.rotation.x = -Math.PI / 2;
    inner.position.z = 0.4;
    // 喷口处的白热盘
    const throat = new THREE.Mesh(
      new THREE.CircleGeometry(baseRadius * 0.95, 32),
      coreMat,
    );
    throat.position.z = 1.2;
    throat.rotation.y = Math.PI;

    this.group.add(outer, inner, throat);
    this.outerMat = outerMat;
    this.coreMat = coreMat;
    this.materials = [outerMat, coreMat];

    // 喷口辉光
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0x7fd4ff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      opacity: 0.9,
    }));
    this.glow.scale.setScalar(baseRadius * 4.2);
    this.glow.position.z = -baseRadius * 0.6;
    this.group.add(this.glow);

    // 照明：等离子体把尾舱照亮。
    // 小喷口默认不挂实时点光源——前向渲染里每个点光源都会拖慢所有标准材质的片元着色，
    // 十条尾焰全挂灯会让帧率直接塌掉，而小喷口的照明贡献本来就可以忽略。
    if (opts.light !== false) {
      this.light = new THREE.PointLight(0x4aa8ff, 3000, 900, 2);
      this.light.position.z = -22;
      this.group.add(this.light);
    }
  }

  update(time, intensity) {
    this.outerMat.uniforms.uTime.value = time;
    this.coreMat.uniforms.uTime.value = time;
    this.outerMat.uniforms.uIntensity.value = intensity;
    this.coreMat.uniforms.uIntensity.value = intensity;
    this.glow.material.opacity = Math.min(1, 0.42 + intensity * 0.5);
    this.glow.scale.setScalar(this.baseRadius * (3.4 + intensity * 1.5));
    if (this.light) this.light.intensity = 2600 + intensity * 5200;
  }
}

/* ------------------------------------------------------------------ */
/* 远景行星                                                            */
/* ------------------------------------------------------------------ */

const PLANET_NOISE = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float n31(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
                   mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                   mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fb3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * n31(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

export function createPlanet({ radius = 2400, position = new THREE.Vector3(-13500, -3200, -11000) } = {}) {
  const group = new THREE.Group();
  group.position.copy(position);

  const uniforms = {
    uSun: { value: SUN_DIR.clone() },
    uTime: { value: 0 },
    uColA: { value: new THREE.Color(0.32, 0.16, 0.09) },
    uColB: { value: new THREE.Color(0.62, 0.4, 0.22) },
    uColC: { value: new THREE.Color(0.14, 0.2, 0.3) },
    uAtmo: { value: new THREE.Color(0.55, 0.34, 0.2) },
  };

  const planetMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vP;
      varying vec3 vV;
      void main() {
        vN = normalize(normalMatrix * normal);
        vP = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform vec3 uColA;
      uniform vec3 uColB;
      uniform vec3 uColC;
      uniform vec3 uAtmo;
      varying vec3 vN;
      varying vec3 vP;
      varying vec3 vV;
      ${PLANET_NOISE}
      void main() {
        vec3 n = normalize(vN);
        vec3 sun = normalize(uSun);
        float lt = dot(n, sun);
        float day = smoothstep(-0.22, 0.42, lt);
        float bands = sin(vP.y * 26.0 + fb3(vP * 3.4) * 6.0);
        float swirl = fb3(vP * 2.1 + vec3(0.0, 0.0, 1.7));
        vec3 col = mix(uColA, uColB, bands * 0.5 + 0.5);
        col = mix(col, uColC, smoothstep(0.42, 0.95, swirl) * 0.7);
        col *= 0.05 + day * 1.06;
        float rim = pow(1.0 - clamp(abs(dot(n, normalize(vV))), 0.0, 1.0), 3.1);
        col += rim * uAtmo * (0.35 + 0.9 * smoothstep(-0.35, 0.7, lt));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), planetMat);
  group.add(sphere);

  // 行星环
  const ringUniforms = {
    uSun: { value: SUN_DIR.clone() },
  };
  const ringMat = new THREE.ShaderMaterial({
    uniforms: ringUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vN;
      void main() {
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec2 vUv;
      ${PLANET_NOISE}
      void main() {
        float r = vUv.y;
        float b = fb3(vec3(r * 90.0, 0.0, 0.0));
        float gap1 = smoothstep(0.34, 0.37, r) * (1.0 - smoothstep(0.38, 0.41, r));
        float gap2 = smoothstep(0.62, 0.645, r) * (1.0 - smoothstep(0.655, 0.68, r));
        float a = (0.35 + b * 0.65) * (1.0 - gap1 * 0.92) * (1.0 - gap2 * 0.85);
        a *= smoothstep(0.0, 0.09, r) * (1.0 - smoothstep(0.86, 1.0, r));
        vec3 col = mix(vec3(0.5, 0.36, 0.24), vec3(0.72, 0.6, 0.46), b);
        gl_FragColor = vec4(col * 0.55, a * 0.45);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 2.35, 160, 6), ringMat);
  ring.rotation.x = -Math.PI / 2 + 0.36;
  ring.rotation.z = 0.2;
  group.add(ring);

  group.name = 'planet';
  return { group, planetMat, ringMat, uniforms };
}

/* ------------------------------------------------------------------ */
/* 体素碎屑场                                                          */
/* ------------------------------------------------------------------ */

export function createDebrisField(buildGeometry, { perVariant = 90, extent = 2600 } = {}) {
  const seeds = [1, 2, 3, 4];
  const meshes = [];
  for (const seed of seeds) {
    const geo = buildGeometry(seed);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.05,
      flatShading: true,
    });
    const inst = new THREE.InstancedMesh(geo, mat, perVariant);
    inst.frustumCulled = true;
    const dummy = new THREE.Object3D();
    const data = [];
    for (let i = 0; i < perVariant; i++) {
      const p = new THREE.Vector3(
        (Math.random() - 0.5) * extent * 2,
        (Math.random() - 0.5) * extent,
        (Math.random() - 0.5) * extent * 2.6,
      );
      if (p.length() < 320) p.setLength(320 + Math.random() * 400);
      const scale = 0.6 + Math.pow(Math.random(), 2.4) * 5.5;
      dummy.position.copy(p);
      dummy.scale.setScalar(scale);
      dummy.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      data.push({ p, dummy: dummy.clone(), spin: new THREE.Vector3((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08) });
    }
    inst.instanceMatrix.needsUpdate = true;
    meshes.push({ inst, data });
  }
  return meshes;
}
