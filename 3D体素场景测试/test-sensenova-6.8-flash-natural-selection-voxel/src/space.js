/**
 * space.js —— 宇宙环境、星空、行星、引擎等离子体、碎屑场（顶级版 v2）
 *
 * 升级要点：
 *   - 星空 60k 颗（v1 是 42k），多层色温、更细腻的尺寸分布
 *   - 尘埃三层视差（近 / 中 / 远），速度感更立体
 *   - 等离子体：五层结构（外壳/中层/白热核心/喉部光晕/尾部冲击波环）
 *   - 远景行星：更大的直径 + 更完整的环系 + 大气辉光
 *   - 碎屑：6 种变体，覆盖远近
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

/* ------------------------------------------------------------------ */
/* 星空（3 层）                                                        */
/* ------------------------------------------------------------------ */

const STAR_TINTS = [
  [1.0, 1.0, 1.0],       // 白
  [0.78, 0.87, 1.0],     // 蓝白
  [1.0, 0.9, 0.76],      // 暖白
  [1.0, 0.78, 0.66],     // 橙红
  [0.86, 0.94, 1.0],     // 冷白
  [1.0, 0.96, 0.88],     // 微暖
  [0.65, 0.82, 1.0],     // 蓝
  [1.0, 0.72, 0.55],     // 橙
];

export function createStarfield({ count = 60000, minR = 2400, maxR = 14000 } = {}) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
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

    const t = STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0];
    const lum = 0.28 + Math.pow(Math.random(), 3.2) * 1.85;
    c.setRGB(t[0] * lum, t[1] * lum, t[2] * lum);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    sizes[i] = 0.9 + Math.pow(Math.random(), 5) * 9.5;
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
        // 十字星芒（对最亮的星）
        float streak = pow(max(0.0, 1.0 - length(vec2(d.x * 8.0, d.y * 0.4))), 3.0) * 0.14;
        float streak2 = pow(max(0.0, 1.0 - length(vec2(d.x * 0.4, d.y * 8.0))), 3.0) * 0.14;
        float a = (core + halo + streak + streak2) * vTwinkle;
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

/** 三层视差尘埃：远景、中景、近景，速度不同 */
export function createDust({ count = 3600, radius = 1100 } = {}) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const layers = new Float32Array(count); // 0=远，1=中，2=近
  for (let i = 0; i < count; i++) {
    const layer = i / count;
    const r = radius * (0.4 + layer * 1.6);
    positions[i * 3] = (Math.random() - 0.5) * r * 2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * r * 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * r * 2;
    speeds[i] = 0.3 + layer * 2.4 + Math.random() * 0.8;
    layers[i] = layer;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geo.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: window.innerHeight * 0.5 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSpeed;
      attribute float aLayer;
      uniform float uScale;
      uniform float uTime;
      varying float vA;
      varying vec3 vCol;
      void main() {
        // 沿着 -Z 方向流动，模拟飞船向前飞行
        vec3 pos = position;
        pos.z = mod(position.z + uTime * aSpeed * 40.0, ${radius.toFixed(1)} * 2.4) - ${radius.toFixed(1)} * 1.2;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = clamp(uScale * (0.3 + aLayer * 0.6) / max(0.001, d), 1.0, 6.0);
        vA = smoothstep(1600.0, 100.0, d) * (0.5 + aLayer * 0.5);
        // 三层颜色：远偏冷蓝，近偏暖
        vCol = mix(vec3(0.55, 0.72, 1.0), vec3(0.9, 0.95, 1.0), aLayer);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      varying vec3 vCol;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = pow(max(0.0, 1.0 - length(d) * 2.0), 2.0) * vA;
        if (a <= 0.003) discard;
        gl_FragColor = vec4(vCol * a, a);
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
/* 引擎等离子体（顶级版：五层结构）                                    */
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
   * @param {{x:number,y:number,z:number}} nozzle 喷口位置（体素坐标）
   * @param {{length:number, baseRadius:number, tipRadius:number, seed:number, light:boolean}} opts
   */
  constructor(nozzle, opts = {}) {
    const length = opts.length ?? 320;
    const baseRadius = opts.baseRadius ?? 13;
    const tipRadius = opts.tipRadius ?? 4.2;
    this.nozzle = nozzle;
    this.length = length;
    this.baseRadius = baseRadius;
    this.seed = opts.seed ?? 0;
    this.group = new THREE.Group();
    this.group.position.set(nozzle.x, nozzle.y, nozzle.z);

    const mkCone = (rBase, rTip, segments, heightSeg) => {
      const geo = new THREE.CylinderGeometry(rTip, rBase, length, segments, heightSeg, true);
      geo.translate(0, length / 2, 0);
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

    // 1) 外层：主体焰流（外壳）
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

    // 2) 内层：白热核心
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

    // 3) 尾部冲击波环（尾部 3 道扩散环）
    const shockMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: uniformsBase.uTime,
        uIntensity: uniformsBase.uIntensity,
        uLength: uniformsBase.uLength,
      },
      vertexShader,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        uniform float uLength;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float t = clamp(vUv.y, 0.0, 1.0);
          // 只在尾部区域 (t > 0.5) 出现
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float vol = pow(facing, 1.5);
          // 三道环，向外扩散
          float rings = 0.0;
          for (int i = 0; i < 3; i++) {
            float phase = float(i) * 0.33;
            float ringT = fract(uTime * 0.5 + phase);
            float ringPos = 0.55 + ringT * 0.4;
            float d = abs(t - ringPos);
            rings += exp(-d * 22.0) * (1.0 - ringT);
          }
          float a = vol * rings * uIntensity * 0.6;
          vec3 col = mix(vec3(0.3, 0.6, 1.0), vec3(0.8, 0.95, 1.0), facing);
          gl_FragColor = vec4(col * 2.0, clamp(a, 0.0, 1.0));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const outer = new THREE.Mesh(mkCone(baseRadius, tipRadius, 44, 64), outerMat);
    const inner = new THREE.Mesh(mkCone(baseRadius * 0.44, tipRadius * 0.5, 30, 48), coreMat);
    const shockCone = new THREE.Mesh(mkCone(baseRadius * 1.08, tipRadius * 1.1, 40, 48), shockMat);
    outer.rotation.x = -Math.PI / 2;
    inner.rotation.x = -Math.PI / 2;
    shockCone.rotation.x = -Math.PI / 2;
    inner.position.z = 0.4;

    // 4) 喷口处的白热盘
    const throat = new THREE.Mesh(
      new THREE.CircleGeometry(baseRadius * 0.95, 36),
      coreMat,
    );
    throat.position.z = 1.2;
    throat.rotation.y = Math.PI;

    this.group.add(outer, inner, shockCone, throat);
    this.outerMat = outerMat;
    this.coreMat = coreMat;
    this.shockMat = shockMat;
    this.materials = [outerMat, coreMat, shockMat];

    // 5) 喷口辉光（大 sprite，加性混合）
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

    // 6) 尾部远处的辉光（拉长效果）
    this.tailGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0x4f9dff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
    }));
    this.tailGlow.scale.setScalar(baseRadius * 3.2);
    this.tailGlow.position.set(0, 0, -length * 0.6);
    this.group.add(this.tailGlow);

    // 7) 照明：等离子体把尾舱照亮
    if (opts.light !== false) {
      this.light = new THREE.PointLight(0x4aa8ff, 3000, 900, 2);
      this.light.position.z = -22;
      this.group.add(this.light);
    }
  }

  update(time, intensity) {
    this.outerMat.uniforms.uTime.value = time;
    this.coreMat.uniforms.uTime.value = time;
    this.shockMat.uniforms.uTime.value = time;
    this.outerMat.uniforms.uIntensity.value = intensity;
    this.coreMat.uniforms.uIntensity.value = intensity;
    this.shockMat.uniforms.uIntensity.value = intensity;
    this.glow.material.opacity = Math.min(1, 0.42 + intensity * 0.5);
    this.glow.scale.setScalar(this.baseRadius * (3.4 + intensity * 1.5));
    this.tailGlow.material.opacity = 0.35 + intensity * 0.4;
    this.tailGlow.scale.setScalar(this.baseRadius * (2.6 + intensity * 1.2));
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

export function createPlanet({ radius = 2600, position = new THREE.Vector3(-14000, -3400, -11500) } = {}) {
  const group = new THREE.Group();
  group.position.copy(position);

  const uniforms = {
    uSun: { value: SUN_DIR.clone() },
    uTime: { value: 0 },
    uColA: { value: new THREE.Color(0.36, 0.18, 0.10) },
    uColB: { value: new THREE.Color(0.68, 0.44, 0.24) },
    uColC: { value: new THREE.Color(0.14, 0.22, 0.32) },
    uAtmo: { value: new THREE.Color(0.58, 0.36, 0.22) },
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
        // 大红斑
        float spot = smoothstep(0.7, 0.95, 1.0 - length(vP - vec3(0.6, -0.2, 0.6)) * 1.4);
        vec3 col = mix(uColA, uColB, bands * 0.5 + 0.5);
        col = mix(col, uColC, smoothstep(0.42, 0.95, swirl) * 0.7);
        col = mix(col, vec3(0.7, 0.24, 0.14), spot * 0.6);
        col *= 0.05 + day * 1.06;
        float rim = pow(1.0 - clamp(abs(dot(n, normalize(vV))), 0.0, 1.0), 3.1);
        col += rim * uAtmo * (0.35 + 0.9 * smoothstep(-0.35, 0.7, lt));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 80), planetMat);
  group.add(sphere);

  // 大气辉光（背面渲染）
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: uniforms.uSun,
      uColor: { value: new THREE.Color(0.6, 0.38, 0.24) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float facing = 1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0);
        float sun = smoothstep(-0.3, 0.6, dot(normalize(vN), normalize(uSun)));
        vec3 col = uColor * facing * (0.6 + sun * 0.8);
        gl_FragColor = vec4(col, facing * 0.55 * (0.5 + sun * 0.5));
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, 64, 40), atmoMat);
  group.add(atmo);

  // 行星环（多层）
  const ringUniforms = { uSun: uniforms.uSun };
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
        // 多个缝隙
        float gap1 = smoothstep(0.34, 0.37, r) * (1.0 - smoothstep(0.38, 0.41, r));
        float gap2 = smoothstep(0.62, 0.645, r) * (1.0 - smoothstep(0.655, 0.68, r));
        float gap3 = smoothstep(0.48, 0.495, r) * (1.0 - smoothstep(0.505, 0.52, r));
        float a = (0.35 + b * 0.65) * (1.0 - gap1 * 0.92) * (1.0 - gap2 * 0.85) * (1.0 - gap3 * 0.7);
        a *= smoothstep(0.0, 0.09, r) * (1.0 - smoothstep(0.86, 1.0, r));
        vec3 col = mix(vec3(0.5, 0.36, 0.24), vec3(0.72, 0.6, 0.46), b);
        gl_FragColor = vec4(col * 0.55, a * 0.45);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 2.5, 200, 8), ringMat);
  ring.rotation.x = -Math.PI / 2 + 0.36;
  ring.rotation.z = 0.2;
  group.add(ring);

  // 第二层环（更淡，错位）
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(radius * 1.15, radius * 1.3, 180, 6), ringMat.clone());
  ring2.material.uniforms = ringUniforms;
  ring2.rotation.x = -Math.PI / 2 + 0.34;
  ring2.rotation.z = 0.22;
  ring2.material.opacity = 0.5;
  group.add(ring2);

  group.name = 'planet';
  return { group, planetMat, atmoMat, ringMat, uniforms };
}

/* ------------------------------------------------------------------ */
/* 体素碎屑场（6 种变体）                                              */
/* ------------------------------------------------------------------ */

export function createDebrisField(buildGeometry, { perVariant = 130, extent = 3400 } = {}) {
  const seeds = [1, 2, 3, 4, 5, 6];
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
