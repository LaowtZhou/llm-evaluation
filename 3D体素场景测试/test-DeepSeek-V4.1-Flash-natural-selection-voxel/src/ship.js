/**
 * ship.js —— 「自然选择号」全体素雕塑
 *
 * 参照物：《三体 · 引力之外》自然选择号设定图
 * 结构分解（坐标：+Z 为舰首，X 为横向，Y 为垂向）：
 *   舰首针锥 → 前舰体 → 六边形指挥环盘 → 重力环（主环）→ 中舰体
 *   → 背脊结构 / 舰桥塔 → 尾部动力舱 → 四主喷口 + 侧副喷口
 *   表面再叠加：装甲板缝、橙色饰条、舷窗灯带、机械细节（greeble）、散热鳍、天线
 *
 * 所有造型都是确定性程序生成，没有随机种子依赖，每次打开完全一致。
 */

import { VoxelGrid, Palette, ihash, hash3 } from './voxel.js';

/* ============================== 尺寸常量 ============================== */

export const GRID = { sx: 248, sy: 248, sz: 448 };
const CX = 124; // 舰体轴线 X
const CY = 116; // 舰体轴线 Y
const Z_STERN = 8; // 尾部起始
const Z_BOW = 442; // 舰首尖端
const Z_RING = 132; // 主重力环中心
const RING_R = 86; // 主环半径
const RING_TUBE = 11; // 主环管径

export const MATERIALS = {
  HULL_WHITE: 0xe9e7e2,
  HULL_LIGHT: 0xf6f4ef,
  HULL_MID: 0xb8b3aa,
  HULL_GREY: 0x8e8a84,
  HULL_DARK: 0x5d5a56,
  MECH: 0x3d3f46,
  MECH_DARK: 0x24262b,
  ORANGE: 0xe4632c,
  ORANGE_DEEP: 0xa63d17,
  STEEL: 0x9aa0a8,
  PLATE_EDGE: 0xd8d4cc,
  RADIATOR: 0x4a4e55,
  GOLD: 0xc7a24c,
};

function createPalette() {
  const p = new Palette();
  const m = {};
  const add = (key, hex, opts) => {
    m[key] = p.add(key, hex, opts);
  };
  add('HULL_WHITE', MATERIALS.HULL_WHITE, { jitter: 0.14 });
  add('HULL_LIGHT', MATERIALS.HULL_LIGHT, { jitter: 0.1 });
  add('HULL_MID', MATERIALS.HULL_MID, { jitter: 0.16 });
  add('HULL_GREY', MATERIALS.HULL_GREY, { jitter: 0.16 });
  add('HULL_DARK', MATERIALS.HULL_DARK, { jitter: 0.18 });
  add('MECH', MATERIALS.MECH, { jitter: 0.2 });
  add('MECH_DARK', MATERIALS.MECH_DARK, { jitter: 0.22 });
  add('ORANGE', MATERIALS.ORANGE, { jitter: 0.14 });
  add('ORANGE_DEEP', MATERIALS.ORANGE_DEEP, { jitter: 0.16 });
  add('STEEL', MATERIALS.STEEL, { jitter: 0.18 });
  add('PLATE_EDGE', MATERIALS.PLATE_EDGE, { jitter: 0.1 });
  add('RADIATOR', MATERIALS.RADIATOR, { jitter: 0.14 });
  add('GOLD', MATERIALS.GOLD, { jitter: 0.12 });
  // 自发光系列
  add('WIN_CYAN', 0xa6ecff, { emissive: true, jitter: 0 });
  add('WIN_BLUE', 0x4fb4ff, { emissive: true, jitter: 0 });
  add('WIN_WARM', 0xffd9a0, { emissive: true, jitter: 0 });
  add('GLOW_BLUE', 0x2f7bff, { emissive: true, jitter: 0 });
  add('GLOW_WHITE', 0xdcf0ff, { emissive: true, jitter: 0 });
  add('BEACON_RED', 0xff3b2f, { emissive: true, jitter: 0 });
  add('BEACON_GREEN', 0x46ff86, { emissive: true, jitter: 0 });
  return { palette: p, m };
}

/* ============================== 舰体剖面 ============================== */

// [z, 半径, 纵向压扁系数]
const PROFILE = [
  [Z_STERN, 29, 0.84],
  [24, 36, 0.92],
  [46, 40, 0.94],
  [78, 41, 0.94],
  [112, 40, 0.93],
  [Z_RING, 39, 0.92],
  [168, 38, 0.91],
  [206, 36, 0.9],
  [246, 33, 0.88],
  [288, 29, 0.86],
  [326, 25, 0.83],
  [356, 20, 0.77],
  [382, 15, 0.68],
  [404, 10, 0.6],
  [422, 6, 0.55],
  [436, 2.6, 0.52],
  [Z_BOW, 1, 0.5],
];

function hullProfile(z) {
  if (z <= PROFILE[0][0]) return { r: PROFILE[0][1], ys: PROFILE[0][2] };
  if (z >= PROFILE[PROFILE.length - 1][0]) {
    const last = PROFILE[PROFILE.length - 1];
    return { r: last[1], ys: last[2] };
  }
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const a = PROFILE[i];
    const b = PROFILE[i + 1];
    if (z >= a[0] && z <= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0]);
      return { r: a[1] + (b[1] - a[1]) * t, ys: a[2] + (b[2] - a[2]) * t };
    }
  }
  return { r: 20, ys: 0.8 };
}

/** 八角形截面判定（含平底与平背处理），返回归一化坐标或 null */
function sectionTest(dx, dy, r, ys) {
  if (r <= 0) return null;
  const u = dx / r;
  const v = dy / (r * ys);
  const au = Math.abs(u);
  const av = Math.abs(v);
  if (au > 1 || av > 1) return null;
  if (au + av > 1.36) return null;
  // 平底：腹部削平，形成参考图那样的平坦腹板
  if (v < -0.58) return null;
  return { u, v };
}

/* ============================== 通用工具 ============================== */

/** 阶段调试日志：默认静默，buildNaturalSelection({log}) 可打开 */
let SHIP_LOG = () => {};
function dbg(msg) {
  SHIP_LOG(msg);
}

/** 在盒体内对「暴露在空气中的实体体素」重新上色，fn 返回 0 则保持原样 */
function paintExposed(g, x0, y0, z0, x1, y1, z1, fn) {
  for (let x = Math.max(x0, 0); x <= Math.min(x1, g.sx - 1); x++) {
    for (let y = Math.max(y0, 0); y <= Math.min(y1, g.sy - 1); y++) {
      for (let z = Math.max(z0, 0); z <= Math.min(z1, g.sz - 1); z++) {
        if (g.get(x, y, z) === 0) continue;
        const exposed =
          g.get(x + 1, y, z) === 0 ||
          g.get(x - 1, y, z) === 0 ||
          g.get(x, y + 1, z) === 0 ||
          g.get(x, y - 1, z) === 0 ||
          g.get(x, y, z + 1) === 0 ||
          g.get(x, y, z - 1) === 0;
        if (!exposed) continue;
        const m = fn(x, y, z, g.get(x, y, z));
        if (m) g.paint(x, y, z, m);
      }
    }
  }
}

/** 在暴露面外侧贴一个方块（细节生长） */
function grow(g, x, y, z, m) {
  g.paintAir(x, y, z, m);
}

function disk(g, cx, cy, cz, radius, thickness, mat, axis = 'z') {
  const r2 = radius * radius;
  const ri = Math.floor(radius);
  for (let a = -ri; a <= ri; a++) {
    for (let b = -ri; b <= ri; b++) {
      if (a * a + b * b > r2) continue;
      for (let t = 0; t < thickness; t++) {
        if (axis === 'z') g.set(cx + a, cy + b, cz + t, mat);
      }
    }
  }
}

/* ============================== 主舰体放样 ============================== */

function loftHull(g, m) {
  for (let z = Z_STERN; z <= Z_BOW; z++) {
    const { r, ys } = hullProfile(z);
    const ri = Math.ceil(r) + 1;
    for (let dx = -ri; dx <= ri; dx++) {
      for (let dy = -ri; dy <= ri; dy++) {
        const sec = sectionTest(dx, dy, r, ys);
        if (!sec) continue;
        const x = CX + dx;
        const y = CY + dy;
        let mat = m.HULL_WHITE;
        const { u, v } = sec;
        const av = Math.abs(v);
        const au = Math.abs(u);

        // 顶部装甲板更亮，腹部偏灰
        if (v > 0.5) mat = m.HULL_LIGHT;
        else if (v < -0.35) mat = m.HULL_GREY;
        if (au > 0.78 || av > 0.78) mat = m.HULL_MID; // 侧面收边

        // 横向装甲缝
        const band = ((z % 19) + 19) % 19;
        if (band === 0 || band === 1) mat = m.HULL_MID;
        if (band === 9) mat = m.HULL_GREY;

        // 纵向缝
        if (((Math.abs(dx) * 3 + Math.abs(dy)) % 23) === 0) mat = m.HULL_MID;

        g.set(x, y, z, mat);
      }
    }
  }

  // 橙色主饰条：沿背部纵贯，参考图里最抢眼的视觉锚点
  for (let z = 92; z <= 400; z++) {
    const { r, ys } = hullProfile(z);
    const ridge = Math.max(1, Math.round(r * ys * 0.62));
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = ridge - 1; dy <= ridge + 2; dy++) {
        const sec = sectionTest(dx, dy, r, ys);
        if (!sec) continue;
        const inOrange =
          (z >= 96 && z <= 118) || (z >= 150 && z <= 158) || (z >= 232 && z <= 258) ||
          (z >= 300 && z <= 318) || (z >= 372 && z <= 384);
        if (inOrange || Math.abs(dx) === 2) {
          g.paint(CX + dx, CY + dy, z, inOrange ? m.ORANGE : m.ORANGE_DEEP);
        }
      }
    }
  }
}

/* ============================== 背脊与舰桥 ============================== */

function dorsalStructures(g, m) {
  // 1) 主背脊甲板
  for (let z = 96; z <= 340; z++) {
    const { r, ys } = hullProfile(z);
    const top = r * ys;
    const width = 15 - Math.max(0, (z - 300) / 8);
    const height = z > 300 ? 5 : z > 150 ? 10 : 8;
    for (let dx = -width; dx <= width; dx++) {
      const w = width <= 0 ? 0 : 1 - Math.abs(dx) / (width + 1.6);
      if (w <= 0) continue;
      const rise = Math.round(height * w);
      for (let k = 0; k <= rise; k++) {
        const y = CY + Math.round(top) + k;
        g.set(CX + dx, y, z, k === rise ? m.HULL_LIGHT : m.HULL_WHITE);
        if (k === rise && ((z % 26) < 3)) g.paint(CX + dx, y, z, m.ORANGE);
      }
    }
  }

  // 2) 六边形指挥盘（参考图中部那块带橙边的六角板）
  const hz = 268;
  const hexR = 27;
  for (let dz = -13; dz <= 13; dz++) {
    const z = hz + dz;
    const { r, ys } = hullProfile(z);
    const top = Math.round(CY + r * ys) + 1;
    const shrink = 1 - Math.abs(dz) / 14.5;
    const radius = hexR * shrink;
    if (radius <= 1) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const span = radius - Math.abs(dx) * 0.52;
      for (let dy = -span; dy <= span; dy++) {
        const y = top + 2 + Math.round((1 - Math.abs(dx) / (radius + 1)) * 2);
        const edge = Math.abs(dx) > radius - 2 || Math.abs(dy) > span - 2;
        g.set(CX + dx, y, z, edge ? m.ORANGE : m.PLATE_EDGE);
      }
    }
  }

  // 3) 舰桥塔
  for (let z = 176; z <= 216; z++) {
    const { r, ys } = hullProfile(z);
    const base = CY + Math.round(r * ys) + 9;
    const t = (z - 176) / 40;
    const w = Math.round(12 - 4 * t);
    const h = Math.round(16 - 6 * t);
    for (let dx = -w; dx <= w; dx++) {
      for (let k = 0; k <= h; k++) {
        const y = base + k;
        const shrink = k > h - 4 ? 1 : 0;
        if (Math.abs(dx) > w - shrink) continue;
        g.set(CX + dx, y, z, k > h - 3 ? m.HULL_LIGHT : m.HULL_WHITE);
      }
    }
  }

  // 4) 桅杆与天线
  const masts = [
    [CX - 8, 190, 30],
    [CX + 8, 202, 24],
    [CX, 340, 20],
  ];
  for (const [mx, mz, mh] of masts) {
    const { r, ys } = hullProfile(mz);
    const startY = CY + Math.round(r * ys) + 10;
    for (let k = 0; k < mh; k++) {
      g.set(mx, startY + k, mz, k % 6 === 0 ? m.STEEL : m.MECH_DARK);
      if (k === mh - 1) g.set(mx, startY + k, mz, m.BEACON_RED);
      if (k > 3 && k % 5 === 2) {
        g.set(mx - 1, startY + k, mz, m.MECH);
        g.set(mx + 1, startY + k, mz, m.MECH);
      }
    }
  }
}

/* ============================== 重力环 ============================== */

function gravityRing(g, m) {
  const ri = RING_R + RING_TUBE + 3;
  const t2 = RING_TUBE * RING_TUBE;

  for (let dx = -ri; dx <= ri; dx++) {
    for (let dy = -ri; dy <= ri; dy++) {
      const rad = Math.sqrt(dx * dx + dy * dy);
      const dr = rad - RING_R;
      if (Math.abs(dr) > RING_TUBE) continue;
      const halfZ = Math.sqrt(Math.max(0, t2 - dr * dr));
      const zFrom = Math.round(Z_RING - halfZ);
      const zTo = Math.round(Z_RING + halfZ);
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += Math.PI * 2;
      const seg = Math.floor((ang / (Math.PI * 2)) * 48);
      const shell = Math.abs(dr) > RING_TUBE - 2.4;

      let mat = seg % 2 === 0 ? m.HULL_WHITE : m.HULL_MID;
      if (seg % 8 === 0) mat = m.STEEL;
      if (seg % 24 === 3) mat = m.ORANGE;
      if (shell) mat = seg % 2 === 0 ? m.PLATE_EDGE : m.HULL_LIGHT;

      for (let z = zFrom; z <= zTo; z++) {
        const x = CX + dx;
        const y = CY + dy;
        // 环内侧预留舷窗窗位
        const innerFace = dr < -RING_TUBE + 2.6 && Math.abs(z - Z_RING) < 2.2;
        if (innerFace && seg % 2 === 0) {
          g.set(x, y, z, m.WIN_CYAN);
        } else {
          g.set(x, y, z, mat);
        }
      }

      // 环外侧「齿状」散热块
      if (dr > 0 && Math.abs(ang % (Math.PI / 15)) < 0.035) {
        for (let k = 0; k < 5; k++) {
          const rr = 1 + k / RING_R;
          g.set(Math.round(CX + dx * rr), Math.round(CY + dy * rr), Z_RING, k % 2 ? m.ORANGE : m.STEEL);
        }
      }
    }
  }

  // 环体内圈补一圈暖色舱灯带
  for (let a = 0; a < 720; a++) {
    const ang = (a / 720) * Math.PI * 2;
    const x = Math.round(CX + Math.cos(ang) * (RING_R - RING_TUBE + 1.2));
    const y = Math.round(CY + Math.sin(ang) * (RING_R - RING_TUBE + 1.2));
    if ((a % 9) < 3) g.set(x, y, Z_RING, m.WIN_WARM);
  }

  // 外圈细环（第二道轮廓，让剪影更精致）
  const outerR = RING_R + RING_TUBE + 8;
  for (let a = 0; a < 1440; a++) {
    const ang = (a / 1440) * Math.PI * 2;
    const x = Math.round(CX + Math.cos(ang) * outerR);
    const y = Math.round(CY + Math.sin(ang) * outerR);
    const mat = a % 60 < 2 ? m.ORANGE : m.STEEL;
    for (let dz = -1; dz <= 1; dz++) g.set(x, y, Z_RING + dz, mat);
  }

  // 六根辐射支撑臂
  const spokeAngles = [30, 90, 150, 210, 270, 330];
  const { r: hullR, ys } = hullProfile(Z_RING);
  for (const deg of spokeAngles) {
    const ang = (deg * Math.PI) / 180;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const rFrom = hullR * 0.55;
    for (let r = rFrom; r <= RING_R - RING_TUBE + 2; r += 0.6) {
      const px = CX + ca * r;
      const py = CY + sa * r;
      const half = r < hullR * 1.35 ? 3.4 : 4.4;
      const halfZ = r < 40 ? 7 : 5;
      const hi = Math.ceil(half);
      for (let a = -hi; a <= hi; a++) {
        for (let b = -hi; b <= hi; b++) {
          if (a * a + b * b > half * half + 1) continue;
          for (let dz = -halfZ; dz <= halfZ; dz++) {
            const x = Math.round(px + a);
            const y = Math.round(py + b);
            const z = Z_RING + dz;
            let mat = m.MECH_DARK;
            if (Math.abs(dz) >= halfZ - 1) mat = m.MECH;
            if ((z % 23) < 2) mat = m.ORANGE;
            const existing = g.get(x, y, z);
            if (existing !== 0 && existing !== m.WIN_CYAN) continue;
            g.set(x, y, z, mat);
          }
        }
      }
    }
  }

  // 前部小环（传感器 / 散热环）
  const fz = 288;
  const fr = 46;
  const ft = 5.5;
  const fi = fr + ft + 2;
  for (let dx = -fi; dx <= fi; dx++) {
    for (let dy = -fi; dy <= fi; dy++) {
      const rad = Math.sqrt(dx * dx + dy * dy);
      const dr = rad - fr;
      if (Math.abs(dr) > ft) continue;
      const halfZ = Math.sqrt(Math.max(0, ft * ft - dr * dr));
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += Math.PI * 2;
      const seg = Math.floor((ang / (Math.PI * 2)) * 32);
      for (let z = Math.round(fz - halfZ); z <= Math.round(fz + halfZ); z++) {
        const mat = seg % 4 === 0 ? m.ORANGE_DEEP : seg % 2 === 0 ? m.STEEL : m.MECH;
        g.set(CX + dx, CY + dy, z, mat);
      }
    }
  }
  for (const deg of [0, 90, 180, 270]) {
    const ang = (deg * Math.PI) / 180;
    for (let r = 22; r <= fr - ft + 1; r += 0.6) {
      const px = Math.round(CX + Math.cos(ang) * r);
      const py = Math.round(CY + Math.sin(ang) * r);
      for (let a = -2; a <= 2; a++) {
        for (let b = -2; b <= 2; b++) {
          for (let dz = -2; dz <= 2; dz++) {
            const x = px + a;
            const y = py + b;
            if (Math.abs(a) === 2 && Math.abs(b) === 2) continue;
            if (g.get(x, y, fz + dz) === 0) g.set(x, y, fz + dz, dz === 0 ? m.MECH_DARK : m.MECH);
          }
        }
      }
    }
  }
}

/* ============================== 尾部动力舱 ============================== */

const NOZZLES = [];
const AUX_NOZZLES = [];

function engineSection(g, m) {
  // 1) 尾端整面加厚：方形动力舱
  for (let z = Z_STERN; z <= 68; z++) {
    const { r, ys } = hullProfile(z);
    const rr = r + (z < 30 ? 1.5 : 0);
    for (let dx = -rr; dx <= rr; dx++) {
      for (let dy = -rr; dy <= rr; dy++) {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (ax > rr || ay > rr * ys) continue;
        if (ax + ay / ys > rr * 1.4) continue;
        let mat = m.HULL_WHITE;
        if (z < 26) mat = m.HULL_GREY;
        if ((z % 13) < 2) mat = m.HULL_MID;
        if (ay > rr * ys * 0.72) mat = m.HULL_LIGHT;
        if (dx > rr * 0.55 || dx < -rr * 0.55) mat = m.HULL_MID;
        g.set(CX + dx, CY + dy, z, mat);
      }
    }
  }

  // 2) 主喷口：四个大钟形喷管，从尾端向内挖出
  const offs = [
    [-19, -19],
    [19, -19],
    [-19, 19],
    [19, 19],
  ];
  for (const [ox, oy] of offs) {
    const nx = CX + ox;
    const ny = CY + oy;
    NOZZLES.push({ x: nx, y: ny, z: Z_STERN - 2 });
    for (let z = Z_STERN - 3; z <= 62; z++) {
      const t = (z - (Z_STERN - 3)) / 65;
      const radius = 13.5 - 7.5 * t;
      const ri = Math.ceil(radius);
      for (let dx = -ri; dx <= ri; dx++) {
        for (let dy = -ri; dy <= ri; dy++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          g.carveBox(nx + dx, ny + dy, z, nx + dx, ny + dy, z);
        }
      }
    }
  }

  // 3) 喷管内壁与喉部发光
  paintExposed(g, CX - 40, CY - 40, Z_STERN - 4, CX + 40, CY + 40, 66, (x, y, z) => {
    for (const [ox, oy] of offs) {
      const dx = x - (CX + ox);
      const dy = y - (CY + oy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 15) continue;
      const t = (z - (Z_STERN - 3)) / 65;
      const radius = 13.5 - 7.5 * t;
      if (d < radius - 4) continue;
      if (z >= 52) return m.GLOW_BLUE;
      if (z >= 46) return m.WIN_BLUE;
      if (d > radius - 1.6) return z < 20 ? m.STEEL : m.MECH_DARK;
      return m.MECH;
    }
    return 0;
  });

  // 4) 尾部环状橙色结构（参考图中最醒目的橙环）
  for (let z = Z_STERN - 1; z <= Z_STERN + 9; z++) {
    for (let dx = -44; dx <= 44; dx++) {
      for (let dy = -44; dy <= 44; dy++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 30 || d > 41) continue;
        let blocked = false;
        for (const [ox, oy] of offs) {
          const ndx = dx - ox;
          const ndy = dy - oy;
          if (ndx * ndx + ndy * ndy < 16 * 16) blocked = true;
        }
        if (blocked) continue;
        const mat = (z - Z_STERN) % 6 < 3 ? m.ORANGE : m.ORANGE_DEEP;
        g.set(CX + dx, CY + dy, z, mat);
      }
    }
  }

  // 5) 侧向辅助喷口 ×4
  const auxOffs = [
    [CX - 31, CY - 31],
    [CX + 31, CY - 31],
    [CX - 31, CY + 31],
    [CX + 31, CY + 31],
  ];
  for (const [px, py] of auxOffs) {
    const dirX = px > CX ? 1 : -1;
    const dirY = py > CY ? 1 : -1;
    const stemX = px + dirX * 6;
    const stemY = py + dirY * 6;
    // 支架
    for (let x = Math.min(px, stemX); x <= Math.max(px, stemX); x++) {
      for (let y = Math.min(py, stemY); y <= Math.max(py, stemY); y++) {
        for (let z = 14; z <= 46; z++) g.set(x, y, z, z % 15 < 2 ? m.ORANGE : m.MECH);
      }
    }
    // 喷管本体
    for (let z = 6; z <= 40; z++) {
      const t = (z - 6) / 34;
      const radius = 8.5 - 4.2 * t;
      const ri = Math.ceil(radius);
      for (let dx = -ri; dx <= ri; dx++) {
        for (let dy = -ri; dy <= ri; dy++) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > radius) continue;
          if (d > radius - 2.2) g.set(stemX + dx, stemY + dy, z, t > 0.8 ? m.GLOW_BLUE : m.MECH_DARK);
          else g.carveBox(stemX + dx, stemY + dy, z, stemX + dx, stemY + dy, z);
        }
      }
    }
    AUX_NOZZLES.push({ x: stemX, y: stemY, z: 4 });
  }
}

/* ============================== 侧挂舱与散热鳍 ============================== */

function sideModules(g, m) {
  // 大型侧挂外舱
  const pods = [
    [CX - 62, CY - 4, 62, 132],
    [CX + 62, CY - 4, 62, 132],
  ];
  for (const [px, py, z0, z1] of pods) {
    for (let z = z0; z <= z1; z++) {
      const t = (z - z0) / (z1 - z0);
      const radius = 11.5 * Math.sin(Math.PI * (0.12 + 0.76 * t)) + 3;
      const ri = Math.ceil(radius);
      for (let dx = -ri; dx <= ri; dx++) {
        for (let dy = -ri; dy <= ri; dy++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const ang = Math.atan2(dy, dx);
          let mat = m.HULL_WHITE;
          if (Math.cos(ang) > 0.4) mat = m.HULL_MID;
          if (z % 17 < 3) mat = m.ORANGE;
          if (z % 17 === 8) mat = m.MECH_DARK;
          g.set(px + dx, py + dy, z, mat);
        }
      }
    }
    // 与外舱的连接桁架
    const side = px > CX ? 1 : -1;
    for (let s = 0; s < 22; s++) {
      const x = px - side * s;
      for (let dy = -3; dy <= 3; dy++) {
        for (let z = 78; z <= 116; z += 19) {
          if (g.get(x, py + dy, z) === 0) g.set(x, py + dy, z, dy === 0 ? m.MECH_DARK : m.MECH);
        }
      }
    }
    // 外舱尾部小喷口
    for (let dx = -6; dx <= 6; dx++) {
      for (let dy = -6; dy <= 6; dy++) {
        if (dx * dx + dy * dy > 36) continue;
        for (let z = z0 - 6; z <= z0; z++) g.carveBox(px + dx, py + dy, z, px + dx, py + dy, z);
      }
    }
    AUX_NOZZLES.push({ x: px, y: py, z: z0 - 5, small: true });
  }

  // 散热鳍（尾部两侧的大型薄板）
  for (const side of [-1, 1]) {
    const x0 = CX + side * 46;
    const x1 = CX + side * 84;
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const t = Math.abs(x - x0) / Math.abs(x1 - x0);
      const halfZ = 26 - 12 * t;
      for (let z = Math.round(96 - halfZ); z <= Math.round(96 + halfZ); z++) {
        for (let y = CY - 2; y <= CY + 2; y++) {
          const mat = (x + z) % 17 < 3 ? m.ORANGE : (y === CY ? m.RADIATOR : m.HULL_GREY);
          if (g.get(x, y, z) === 0) g.set(x, y, z, mat);
        }
      }
    }
  }

  // 背鳍（参考图舰体上方的板状突出）
  for (const [z0, z1, h] of [[352, 400, 16], [214, 250, 12]]) {
    for (let z = z0; z <= z1; z++) {
      const { r, ys } = hullProfile(z);
      const top = Math.round(CY + r * ys);
      const t = (z - z0) / (z1 - z0);
      const hh = Math.round(h * Math.sin(Math.PI * t) * 0.9 + 1);
      for (let k = 0; k <= hh; k++) {
        for (let dx = -1; dx <= 1; dx++) {
          const mat = k === hh ? m.ORANGE : k > hh - 2 ? m.HULL_LIGHT : m.HULL_MID;
          g.set(CX + dx, top + k, z, mat);
        }
      }
    }
  }
}

/* ============================== 腹部结构 ============================== */

function ventralStructures(g, m) {
  // 腹部装甲板
  paintExposed(g, CX - 44, CY - 44, 70, CX + 44, CY - 10, 300, (x, y) => {
    if ((x * 3 + y) % 31 < 2) return m.MECH_DARK;
    if ((x + y) % 47 < 2) return m.ORANGE_DEEP;
    return 0;
  });

  // 大型机库 / 坞舱门
  for (const zc of [196, 216]) {
    for (let dz = -6; dz <= 6; dz++) {
      const z = zc + dz;
      const { r, ys } = hullProfile(z);
      const bottom = Math.round(CY - r * ys);
      for (let dx = -16; dx <= 16; dx++) {
        for (let k = 0; k <= 4; k++) {
          const y = bottom - k;
          const edge = Math.abs(dx) > 14 || Math.abs(dz) > 4;
          const mat = edge ? m.ORANGE : k === 0 ? m.MECH_DARK : m.MECH;
          g.set(CX + dx, y, z, mat);
        }
      }
      // 坞舱内透出的青光
      for (let dx = -12; dx <= 12; dx += 3) {
        g.set(CX + dx, bottom - 5, z, m.WIN_CYAN);
      }
    }
  }

  // 起落支撑柱
  for (const [ox, oz] of [[-22, 150], [22, 150], [-22, 250], [22, 250]]) {
    const { r, ys } = hullProfile(oz);
    const bottom = Math.round(CY - r * ys);
    for (let k = 0; k <= 14; k++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          g.set(CX + ox + dx, bottom - k, oz + dz, k % 7 === 0 ? m.ORANGE : m.MECH);
        }
      }
    }
  }
}

/* ============================== 表面细节层 ============================== */

function surfaceDetail(g, m) {
  // ihash 返回 32 位无符号整数，只能用来做「取模筛选」；
  // 要 0~1 的浮点（决定尺寸、材质概率）必须用 hash3。
  // 之前混用得循环次数变成几十亿，直接卡死，切记。
  const pick = ihash;
  const rand = hash3;

  dbg('    · 舷窗灯带');
  // 1) 舷窗灯带：沿舰体侧面成排分布
  g.forEachExposed((x, y, z, mask, mat) => {
    if (mat === m.WIN_CYAN || mat === m.WIN_BLUE || mat === m.WIN_WARM) return;
    if (!(mask & 1) && !(mask & 2)) return; // 只处理左右侧面
    const dx = x - CX;
    const dy = y - CY;
    if (Math.abs(dx) < 18) return;
    const row = Math.round(dy / 7);
    if ((z + row * 5) % 11 > 3) return;
    if (pick(x, y, z, 91) % 5 !== 0) return;
    g.paint(x, y, z, (row % 3 === 0) ? m.WIN_WARM : m.WIN_CYAN);
  });

  dbg('    · 装甲棱线');
  // 2) 背部装甲板边框（LEGO 式的高光棱线）
  //    注意：必须「先收集再落地」。如果在遍历过程中直接长方块，新方块自己也会被
  //    判定为「朝上暴露」，于是沿 Y 一路级联长成尖塔——这是体素雕刻里最经典的坑。
  const edges = [];
  g.forEachExposed((x, y, z, mask, mat) => {
    if (!(mask & 4)) return; // 只有朝上的面
    if (mat >= m.WIN_CYAN) return;
    const dx = x - CX;
    if (!(Math.abs(dx) < 46 && z > 20 && z < 430)) return;
    if (x % 15 === 0 || z % 15 === 0) edges.push([x, y, z]);
  });
  for (const [x, y, z] of edges) {
    if (g.get(x, y + 1, z) !== 0) continue;
    const useOrange = (z % 45 < 3) || (x % 45 < 3);
    g.paintAir(x, y + 1, z, useOrange ? m.ORANGE : m.PLATE_EDGE);
  }

  dbg('    · 机械细节生长');
  // 3) 机械细节生长（greeble）：在暴露面上长小方块
  const spots = [];
  g.forEachExposed((x, y, z, mask, mat) => {
    if (mat >= m.WIN_CYAN) return;
    const dx = x - CX;
    const dy = y - CY;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (pick(x, y, z, 7) % 61 !== 0) return;
    spots.push([x, y, z, mask]);
  });
  dbg('      greeble 候选 ' + spots.length);
  for (const [x, y, z, mask] of spots) {
    const r1 = rand(x, y, z);
    const r2 = rand(x + 7919, y + 104729, z + 1299709);
    const r3 = rand(x + 65537, y + 3571, z + 99991);
    const size = 1 + Math.min(2, Math.floor(r1 * 3));
    const hgt = 1 + Math.min(2, Math.floor(r2 * 3));
    const mat = r3 < 0.28 ? m.MECH_DARK
      : r3 < 0.5 ? m.MECH
        : r3 < 0.72 ? m.HULL_MID
          : r3 < 0.9 ? m.STEEL
            : m.ORANGE;
    for (let a = 0; a < size; a++) {
      for (let b = 0; b < size; b++) {
        for (let c = 0; c < hgt; c++) {
          let tx = x;
          let ty = y;
          let tz = z;
          if (mask & 4) {
            ty += c + 1;
            tx += a - 1;
            tz += b - 1;
          } else if (mask & 8) {
            ty -= c + 1;
            tx += a - 1;
            tz += b - 1;
          } else if (mask & 1) {
            tx += c + 1;
            ty += a - 1;
            tz += b - 1;
          } else if (mask & 2) {
            tx -= c + 1;
            ty += a - 1;
            tz += b - 1;
          } else if (mask & 16) {
            tz += c + 1;
            tx += a - 1;
            ty += b - 1;
          } else {
            tz -= c + 1;
            tx += a - 1;
            ty += b - 1;
          }
          grow(g, tx, ty, tz, mat);
        }
      }
    }
  }

  // 4) 横向橙色警示条
  paintExposed(g, CX - 50, CY - 50, 30, CX + 50, CY + 50, 430, (x, y, z, mat) => {
    if (mat >= m.WIN_CYAN) return 0;
    const band = ((z % 57) + 57) % 57;
    if (band > 2) return 0;
    const dy = y - CY;
    if (dy < -6) return 0;
    return m.ORANGE_DEEP;
  });

  // 5) 舰首传感器阵列
  paintExposed(g, CX - 24, CY - 24, 380, CX + 24, CY + 24, 441, (x, y) => {
    if ((x + y) % 7 < 2) return m.MECH_DARK;
    if ((x * 2 + y) % 19 < 2) return m.STEEL;
    return 0;
  });
  // 舰首尖端信标
  const tip = hullProfile(Z_BOW - 1);
  g.set(CX, CY, Z_BOW, m.BEACON_RED);
  if (tip.r < 3) g.set(CX, CY, Z_BOW + 1, m.GLOW_WHITE);
}

/* ============================== 装配 ============================== */

export function buildNaturalSelection(options = {}) {
  const log = options.log || (() => {});
  const t0 = performance.now();
  const { palette, m } = createPalette();
  const g = new VoxelGrid(GRID.sx, GRID.sy, GRID.sz);

  const stage = (name, fn) => {
    const t = performance.now();
    fn();
    const ms = performance.now() - t;
    log(`  · ${name} ${ms.toFixed(0)} ms / 体素 ${g.solid.toLocaleString('en-US')}`);
  };

  stage('舰体放样', () => loftHull(g, m));
  stage('尾部动力舱', () => engineSection(g, m));
  stage('侧挂舱 / 散热鳍', () => sideModules(g, m));
  stage('腹部结构', () => ventralStructures(g, m));
  stage('重力环', () => gravityRing(g, m));
  stage('背脊 / 舰桥', () => dorsalStructures(g, m));
  stage('表面细节层', () => surfaceDetail(g, m));

  const tSculpt = performance.now() - t0;
  log(`  · 雕塑完成 ${tSculpt.toFixed(0)} ms`);

  // 计算包围盒
  let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
  const { sx, sy, sz, data } = g;
  for (let x = 0; x < sx; x++) {
    for (let y = 0; y < sy; y++) {
      let i = (x * sy + y) * sz;
      for (let z = 0; z < sz; z++, i++) {
        if (data[i] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }

  log(`  · 造型范围 x[${minX},${maxX}] y[${minY},${maxY}] z[${minZ},${maxZ}]`);
  // 自检：舰体应当收在网格中部。纵向若跑到网格两端，说明又有方块写到另一头去了
  //（sy/sz 同为偶数时，带 +0.5 的浮点坐标会算出「看似合法」的下标，是历史坑点）
  if (minY < 6 || maxY > GRID.sy - 6) {
    log('  ⚠ 造型纵向超出安全范围，请检查坐标量化');
  }

  return {
    grid: g,
    palette,
    materials: m,
    nozzles: NOZZLES,
    auxNozzles: AUX_NOZZLES,
    bounds: { minX, minY, maxX, maxY, minZ, maxZ },
    sculptMs: tSculpt,
    cells: sx * sy * sz,
  };
}
