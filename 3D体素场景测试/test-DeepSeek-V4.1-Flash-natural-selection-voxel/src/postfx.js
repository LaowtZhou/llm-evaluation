/**
 * postfx.js —— 自建后处理管线
 *
 * 不用 three 的 EffectComposer，理由：
 *   1. 只在 WebGL2 上跑的极简实现，链路更短、更可控；
 *   2. 场景先渲到半浮点 HDR 缓冲（带 MSAA），泛光在线性空间做，最后一次性
 *      ACES 色调映射 + sRGB 编码输出，色彩链路是干净的；
 *   3. 顺带做暗角、颗粒、边缘色散，整体质感更接近电影感。
 */

import * as THREE from '../vendor/three.module.js';

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
    sum += texture2D(tDiffuse, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tDiffuse, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tDiffuse, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
    sum += texture2D(tDiffuse, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float k = smoothstep(uThreshold, uThreshold + uKnee, l);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom0;
  uniform sampler2D tBloom1;
  uniform sampler2D tBloom2;
  uniform float uStrength;
  uniform float uExposure;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uChroma;
  uniform float uFlash;
  uniform vec2 uResolution;
  uniform float uTime;
  varying vec2 vUv;

  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  vec3 linearToSRGB(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  void main() {
    vec2 uv = vUv;
    vec2 dir = uv - 0.5;
    float amt = uChroma * dot(dir, dir) * 3.2;

    vec3 col;
    col.r = texture2D(tScene, uv - dir * amt).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv + dir * amt).b;

    vec3 bloom =
      texture2D(tBloom0, uv).rgb * 0.52 +
      texture2D(tBloom1, uv).rgb * 0.34 +
      texture2D(tBloom2, uv).rgb * 0.24;
    col += bloom * uStrength;
    col += uFlash;

    col *= uExposure;
    col = aces(col);

    float v = smoothstep(1.22, 0.28, length(dir) * 1.42);
    col *= mix(1.0, v, uVignette);

    float g = hash(uv * uResolution + fract(uTime) * 91.7) - 0.5;
    col += g * uGrain;

    gl_FragColor = vec4(linearToSRGB(col), 1.0);
  }
`;

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.params = {
      exposure: 1.06,
      strength: 0.72,
      threshold: 0.62,
      knee: 0.42,
      vignette: 0.72,
      grain: 0.022,
      chroma: 0.0016,
      flash: 0,
    };

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const rtOpts = {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    };

    this.sceneRT = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 4,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });

    this.bloomA = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.bloomB = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.bloomC = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.bloomD = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.bloomE = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.bloomF = new THREE.WebGLRenderTarget(2, 2, rtOpts);

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: this.params.threshold },
        uKnee: { value: this.params.knee },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDir: { value: new THREE.Vector2() },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        tBloom0: { value: this.bloomA.texture },
        tBloom1: { value: this.bloomC.texture },
        tBloom2: { value: this.bloomE.texture },
        uStrength: { value: this.params.strength },
        uExposure: { value: this.params.exposure },
        uVignette: { value: this.params.vignette },
        uGrain: { value: this.params.grain },
        uChroma: { value: this.params.chroma },
        uFlash: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.width = 2;
    this.height = 2;
  }

  setSize(width, height) {
    const w = Math.max(2, Math.floor(width));
    const h = Math.max(2, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.sceneRT.setSize(w, h);
    const h1 = [Math.max(1, w >> 1), Math.max(1, h >> 1)];
    const h2 = [Math.max(1, w >> 2), Math.max(1, h >> 2)];
    const h3 = [Math.max(1, w >> 3), Math.max(1, h >> 3)];
    this.bloomA.setSize(h1[0], h1[1]);
    this.bloomB.setSize(h1[0], h1[1]);
    this.bloomC.setSize(h2[0], h2[1]);
    this.bloomD.setSize(h2[0], h2[1]);
    this.bloomE.setSize(h3[0], h3[1]);
    this.bloomF.setSize(h3[0], h3[1]);
    this.compositeMat.uniforms.uResolution.value.set(w, h);
  }

  blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render(time) {
    const r = this.renderer;
    const p = this.params;

    // 1) 场景 → HDR 缓冲
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, this.camera);

    // 2) 亮部提取 → 半分辨率缓冲 A
    this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.brightMat.uniforms.uThreshold.value = p.threshold;
    this.brightMat.uniforms.uKnee.value = p.knee;
    this.blit(this.brightMat, this.bloomA);

    // 3) 三级高斯模糊链
    //    每一级：先横向模糊，再纵向模糊，结果固定落在该级的主缓冲里
    //      第 1 级（1/2 分辨率）结果 → A
    //      第 2 级（1/4 分辨率）结果 → D
    //      第 3 级（1/8 分辨率）结果 → F
    //    pass(src, dst, dx, dy)：模糊半径按【目标缓冲】的尺寸换算，保证视觉半径一致。
    const pass = (src, dst, dx, dy, radius = 1) => {
      this.blurMat.uniforms.tDiffuse.value = src.texture;
      this.blurMat.uniforms.uDir.value.set((dx * radius) / dst.width, (dy * radius) / dst.height);
      this.blit(this.blurMat, dst);
    };

    // 第 1 级：A → B（横）→ A（纵）
    pass(this.bloomA, this.bloomB, 1, 0);
    pass(this.bloomB, this.bloomA, 0, 1);

    // 第 2 级：A 降采样进 C，C → D（横）→ C（纵）→ D（横）→ C（纵），结果留 D
    pass(this.bloomA, this.bloomC, 1, 0);
    pass(this.bloomC, this.bloomD, 0, 1, 1.4);
    pass(this.bloomD, this.bloomC, 1, 0, 1.4);
    pass(this.bloomC, this.bloomD, 0, 1, 1.4);
    pass(this.bloomD, this.bloomC, 1, 0, 1.4);
    pass(this.bloomC, this.bloomD, 0, 1, 1.4);

    // 第 3 级：D 降采样进 E，E → F（横）→ E（纵）→ F（横）→ E（纵），结果留 F
    pass(this.bloomD, this.bloomE, 1, 0);
    pass(this.bloomE, this.bloomF, 0, 1, 2.0);
    pass(this.bloomF, this.bloomE, 1, 0, 2.0);
    pass(this.bloomE, this.bloomF, 0, 1, 2.0);
    pass(this.bloomF, this.bloomE, 1, 0, 2.0);
    pass(this.bloomE, this.bloomF, 0, 1, 2.0);

    // 4) 合成输出
    this.compositeMat.uniforms.uStrength.value = p.strength;
    this.compositeMat.uniforms.uExposure.value = p.exposure;
    this.compositeMat.uniforms.uVignette.value = p.vignette;
    this.compositeMat.uniforms.uGrain.value = p.grain;
    this.compositeMat.uniforms.uChroma.value = p.chroma;
    this.compositeMat.uniforms.uFlash.value = p.flash;
    this.compositeMat.uniforms.uTime.value = time;
    this.compositeMat.uniforms.tBloom0.value = this.bloomA.texture;
    this.compositeMat.uniforms.tBloom1.value = this.bloomD.texture;
    this.compositeMat.uniforms.tBloom2.value = this.bloomF.texture;
    this.blit(this.compositeMat, null);
  }
}
