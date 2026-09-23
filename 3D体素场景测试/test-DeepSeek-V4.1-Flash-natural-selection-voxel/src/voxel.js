/**
 * voxel.js —— 体素网格与网格化器（Voxel Grid & Mesher）
 *
 * 设计要点：
 *  1. 网格用 Uint8Array 存材质编号，0 表示空气，1..255 表示材质。
 *  2. 网格化时做「邻面剔除」：只有暴露在空气中的面才会生成三角形。
 *  3. 每个顶点烘焙 AO（环境光遮蔽），乘进顶点色，形成体素艺术标志性的缝隙阴影。
 *  4. 每个体素有确定性的色彩抖动，让相邻方块之间能分辨出边界。
 *  5. 自发光材质单独输出一份几何体，好让后期辉光（Bloom）能捕捉到。
 */

/** 六个面：n 为法线方向，u、v 为切向，且必须满足 u × v = n（保证逆时针绕序） */
const FACE_DEFS = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, // +X
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, // -X
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] }, // +Y
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }, // -Y
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, // +Z
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] }, // -Z
];

/** 一个面的四个角，按 (su, sv) 排列，恰好是逆时针 */
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** AO 四档亮度（0 = 被三面夹住最暗，3 = 完全开阔） */
const AO_LEVELS = [0.42, 0.66, 0.85, 1.0];

export class Palette {
  constructor() {
    /** @type {null | {r:number,g:number,b:number,emissive:boolean,jitter:number,name:string}} */
    this.entries = [null];
    this.count = 0;
  }

  /**
   * 注册一种材质，返回材质编号。
   * @param {string} name 材质名（仅调试用）
   * @param {number} hex  0xRRGGBB
   * @param {{emissive?:boolean, jitter?:number}} [opts]
   */
  add(name, hex, opts = {}) {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    // 材质色按 sRGB 语义给出，这里转成线性空间供渲染使用
    this.entries.push({
      name,
      r: srgbToLinear(r),
      g: srgbToLinear(g),
      b: srgbToLinear(b),
      emissive: !!opts.emissive,
      jitter: opts.jitter === undefined ? 0.16 : opts.jitter,
    });
    this.count += 1;
    return this.count;
  }

  get(id) {
    return this.entries[id];
  }
}

function srgbToLinear(c) {
  return c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * 体素坐标量化：网格是离散结构，任何坐标都必须先落到「最近的格心」。
 *
 * 这一步是硬性约束，不是可选优化。踩过的坑：上一版允许调用方直接传浮点坐标，
 * 而引擎里到处是 `for (let dx = -rr; dx <= rr; dx++)` 这种以浮点数为起点的循环。
 * 由于 sy=248、sz=448 都是偶数，`x+0.5` 与 `y+0.5` 相乘后小数部分恰好凑成整数，
 * 于是 `(x*sy+y)*sz+z` 算出一个「看起来合法」的下标 —— 但对应的格子
 * 已经偏移了 Y+124 / Z+224。结果就是舰体上凭空长出上千根贯穿整个网格的细柱。
 * 统一在这里量化，调用方怎么写都不会再跑偏。
 */
function q(v) {
  return Math.floor(v + 0.5);
}

export class VoxelGrid {
  constructor(sx, sy, sz) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.data = new Uint8Array(sx * sy * sz);
    this.solid = 0;
  }

  index(x, y, z) {
    return (q(x) * this.sy + q(y)) * this.sz + q(z);
  }

  inside(x, y, z) {
    const xi = q(x);
    const yi = q(y);
    const zi = q(z);
    return xi >= 0 && yi >= 0 && zi >= 0 && xi < this.sx && yi < this.sy && zi < this.sz;
  }

  get(x, y, z) {
    const xi = q(x);
    const yi = q(y);
    const zi = q(z);
    if (xi < 0 || yi < 0 || zi < 0 || xi >= this.sx || yi >= this.sy || zi >= this.sz) return 0;
    return this.data[(xi * this.sy + yi) * this.sz + zi];
  }

  set(x, y, z, m) {
    const xi = q(x);
    const yi = q(y);
    const zi = q(z);
    if (xi < 0 || yi < 0 || zi < 0 || xi >= this.sx || yi >= this.sy || zi >= this.sz) return;
    const i = (xi * this.sy + yi) * this.sz + zi;
    const prev = this.data[i];
    if (prev === 0 && m !== 0) this.solid += 1;
    else if (prev !== 0 && m === 0) this.solid -= 1;
    this.data[i] = m;
  }

  /** 只覆盖已有实体（不凭空长出来），用于给船体上色而不改变外形 */
  paint(x, y, z, m) {
    if (!this.inside(x, y, z)) return;
    const i = (q(x) * this.sy + q(y)) * this.sz + q(z);
    if (this.data[i] === 0) return;
    this.data[i] = m;
  }

  /** 只覆盖空气（用于贴附细节） */
  paintAir(x, y, z, m) {
    if (!this.inside(x, y, z)) return;
    const i = (q(x) * this.sy + q(y)) * this.sz + q(z);
    if (this.data[i] !== 0) return;
    this.data[i] = m;
    this.solid += 1;
  }

  fillBox(x0, y0, z0, x1, y1, z1, m) {
    let ax = q(x0);
    let bx = q(x1);
    let ay = q(y0);
    let by = q(y1);
    let az = q(z0);
    let bz = q(z1);
    if (ax > bx) { const t = ax; ax = bx; bx = t; }
    if (ay > by) { const t = ay; ay = by; by = t; }
    if (az > bz) { const t = az; az = bz; bz = t; }
    ax = Math.max(ax, 0);
    bx = Math.min(bx, this.sx - 1);
    ay = Math.max(ay, 0);
    by = Math.min(by, this.sy - 1);
    az = Math.max(az, 0);
    bz = Math.min(bz, this.sz - 1);
    for (let x = ax; x <= bx; x++) {
      for (let y = ay; y <= by; y++) {
        const base = (x * this.sy + y) * this.sz;
        for (let z = az; z <= bz; z++) {
          const i = base + z;
          // 覆写必须同步维护 solid 计数：挖空要减、从空气变实体要加。
          // 上一版在 m===0 时只写不减，导致实体计数虚高（挖喷口的 88770 次全部算错）。
          const prev = this.data[i];
          if (prev === 0 && m !== 0) this.solid += 1;
          else if (prev !== 0 && m === 0) this.solid -= 1;
          this.data[i] = m;
        }
      }
    }
  }

  /** 把一块区域清成空气（挖洞：喷口、内腔、通道） */
  carveBox(x0, y0, z0, x1, y1, z1) {
    this.fillBox(x0, y0, z0, x1, y1, z1, 0);
  }

  /** 用「是否有暴露面」判断实体体素，回调收到 (x,y,z,方向掩码) */
  forEachExposed(cb) {
    const { sx, sy, sz, data } = this;
    for (let x = 0; x < sx; x++) {
      for (let y = 0; y < sy; y++) {
        let i = (x * sy + y) * sz;
        for (let z = 0; z < sz; z++, i++) {
          if (data[i] === 0) continue;
          let mask = 0;
          if (x + 1 >= sx || data[i + sy * sz] === 0) mask |= 1;
          if (x - 1 < 0 || data[i - sy * sz] === 0) mask |= 2;
          if (y + 1 >= sy || data[i + sz] === 0) mask |= 4;
          if (y - 1 < 0 || data[i - sz] === 0) mask |= 8;
          if (z + 1 >= sz || data[i + 1] === 0) mask |= 16;
          if (z - 1 < 0 || data[i - 1] === 0) mask |= 32;
          if (mask !== 0) cb(x, y, z, mask, data[i]);
        }
      }
    }
  }

  /** 统计事件：统计完全密闭的实心体素（内部），用于展示数据 */
  countHidden() {
    let hidden = 0;
    const { sx, sy, sz, data } = this;
    for (let x = 1; x < sx - 1; x++) {
      for (let y = 1; y < sy - 1; y++) {
        let i = (x * sy + y) * sz + 1;
        for (let z = 1; z < sz - 1; z++, i++) {
          if (data[i] === 0) continue;
          if (
            data[i + sy * sz] !== 0 && data[i - sy * sz] !== 0 &&
            data[i + sz] !== 0 && data[i - sz] !== 0 &&
            data[i + 1] !== 0 && data[i - 1] !== 0
          ) hidden += 1;
        }
      }
    }
    return hidden;
  }
}

/** 确定性哈希，返回 0..1 */
export function hash3(x, y, z) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

/** 整数哈希，用于挑选 greeble 位置 */
export function ihash(x, y, z, salt) {
  let h = (x | 0) * 73856093 ^ (y | 0) * 19349663 ^ (z | 0) * 83492791 ^ (salt | 0) * 2654435761;
  h = (h ^ (h >>> 15)) * 2246822519;
  h = h ^ (h >>> 13);
  return h >>> 0;
}

/**
 * 把体素网格网格化成可渲染的 BufferGeometry。
 * @param {VoxelGrid} grid
 * @param {Palette} palette
 * @param {{ao?:boolean}} [opts]
 */
export function buildVoxelGeometry(grid, palette, opts = {}) {
  const useAO = opts.ao !== false;
  const { sx, sy, sz, data } = grid;
  const strideX = sy * sz;

  // ---------- 第一遍：统计面数 ----------
  let solidFaces = 0;
  let emissiveFaces = 0;

  for (let x = 0; x < sx; x++) {
    for (let y = 0; y < sy; y++) {
      let i = (x * sy + y) * sz;
      for (let z = 0; z < sz; z++, i++) {
        const m = data[i];
        if (m === 0) continue;
        let exposed = 0;
        if (x + 1 >= sx || data[i + strideX] === 0) exposed++;
        if (x - 1 < 0 || data[i - strideX] === 0) exposed++;
        if (y + 1 >= sy || data[i + sz] === 0) exposed++;
        if (y - 1 < 0 || data[i - sz] === 0) exposed++;
        if (z + 1 >= sz || data[i + 1] === 0) exposed++;
        if (z - 1 < 0 || data[i - 1] === 0) exposed++;
        if (exposed === 0) continue;
        if (palette.get(m).emissive) emissiveFaces += exposed;
        else solidFaces += exposed;
      }
    }
  }

  const solid = allocateGeometry(solidFaces, false);
  const emissive = allocateGeometry(emissiveFaces, true);

  // ---------- 第二遍：写顶点 ----------
  const emit = (target) => {
    const { positions, normals, colors, indices } = target;
    let vi = target.vi;
    let ii = target.ii;

    for (let x = 0; x < sx; x++) {
      for (let y = 0; y < sy; y++) {
        let ci = (x * sy + y) * sz;
        for (let z = 0; z < sz; z++, ci++) {
          const m = data[ci];
          if (m === 0) continue;
          const mat = palette.get(m);
          if (mat.emissive !== target.emissive) continue;

          const jitter = mat.jitter;
          const j = jitter > 0 ? 1 + (hash3(x, y, z) - 0.5) * jitter : 1;

          let emittedHere = false;
          for (let f = 0; f < 6; f++) {
            const def = FACE_DEFS[f];
            const nx = x + def.n[0];
            const ny = y + def.n[1];
            const nz = z + def.n[2];
            const occupied = grid.get(nx, ny, nz) !== 0;
            if (occupied) continue;

            emittedHere = true;
            const baseV = vi;

            for (let c = 0; c < 4; c++) {
              const [su, sv] = CORNERS[c];
              // 顶点坐标：体素原点 + 法线方向的偏移 + 两个切向的 0/1 偏移
              let vx = x;
              let vy = y;
              let vz = z;
              if (def.n[0] > 0) vx += 1;
              if (def.n[1] > 0) vy += 1;
              if (def.n[2] > 0) vz += 1;
              if (su > 0) {
                vx += def.u[0];
                vy += def.u[1];
                vz += def.u[2];
              }
              if (sv > 0) {
                vx += def.v[0];
                vy += def.v[1];
                vz += def.v[2];
              }

              let aoFactor = 1;
              if (useAO) {
                const s1 = grid.get(nx + su * def.u[0], ny + su * def.u[1], nz + su * def.u[2]) !== 0 ? 1 : 0;
                const s2 = grid.get(nx + sv * def.v[0], ny + sv * def.v[1], nz + sv * def.v[2]) !== 0 ? 1 : 0;
                const cn = grid.get(
                  nx + su * def.u[0] + sv * def.v[0],
                  ny + su * def.u[1] + sv * def.v[1],
                  nz + su * def.u[2] + sv * def.v[2],
                ) !== 0 ? 1 : 0;
                const level = s1 && s2 ? 0 : 3 - (s1 + s2 + cn);
                aoFactor = AO_LEVELS[level];
              }

              const p = vi * 3;
              positions[p] = vx;
              positions[p + 1] = vy;
              positions[p + 2] = vz;
              normals[p] = def.n[0];
              normals[p + 1] = def.n[1];
              normals[p + 2] = def.n[2];

              if (target.emissive) {
                colors[p] = mat.r * EMISSIVE_GAIN;
                colors[p + 1] = mat.g * EMISSIVE_GAIN;
                colors[p + 2] = mat.b * EMISSIVE_GAIN;
              } else {
                const shade = j * aoFactor;
                colors[p] = clamp255(mat.r * shade * 255);
                colors[p + 1] = clamp255(mat.g * shade * 255);
                colors[p + 2] = clamp255(mat.b * shade * 255);
              }
              vi += 1;
            }

            // 根据 AO 对角关系翻转四边形三角剖分方向，消除斜向暗斑
            let flip = false;
            if (useAO) {
              const a0 = colors[(baseV + 0) * 3] + colors[(baseV + 2) * 3];
              const a1 = colors[(baseV + 1) * 3] + colors[(baseV + 3) * 3];
              flip = a0 > a1;
            }
            if (flip) {
              indices[ii++] = baseV;
              indices[ii++] = baseV + 1;
              indices[ii++] = baseV + 3;
              indices[ii++] = baseV + 1;
              indices[ii++] = baseV + 2;
              indices[ii++] = baseV + 3;
            } else {
              indices[ii++] = baseV;
              indices[ii++] = baseV + 1;
              indices[ii++] = baseV + 2;
              indices[ii++] = baseV;
              indices[ii++] = baseV + 2;
              indices[ii++] = baseV + 3;
            }
          }
          if (emittedHere) {
            target.vi = vi;
            target.ii = ii;
          }
        }
      }
    }
  };

  // 先做不发光体，再做自发光体（两趟扫描，逻辑简单不容易错）
  if (solidFaces > 0) emit(solid);
  if (emissiveFaces > 0) emit(emissive);

  return {
    solid: finalize(solid),
    emissive: finalize(emissive),
    stats: {
      solidFaces,
      emissiveFaces,
      faces: solidFaces + emissiveFaces,
      triangles: (solidFaces + emissiveFaces) * 2,
    },
  };
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/** 自发光体素的亮度增益：顶点色用 Float32 存，可以突破 1.0 进入 HDR 区间，
 *  后期泛光才能真正「烧」起来。 */
const EMISSIVE_GAIN = 2.8;

function allocateGeometry(faceCount, emissive) {
  const verts = faceCount * 4;
  return {
    emissive,
    faceCount,
    vi: 0,
    ii: 0,
    positions: new Float32Array(verts * 3),
    normals: new Float32Array(verts * 3),
    // 不发光体素用 Uint8（省显存），自发光体素用 Float32（可进入 HDR 区间）
    colors: emissive ? new Float32Array(verts * 3) : new Uint8Array(verts * 3),
    indices: faceCount * 6 > 65535 ? new Uint32Array(faceCount * 6) : new Uint16Array(faceCount * 6),
  };
}

function finalize(target) {
  return {
    faceCount: target.faceCount,
    colorNormalized: !target.emissive,
    positions: target.positions,
    normals: target.normals,
    colors: target.colors,
    indices: target.indices,
  };
}
