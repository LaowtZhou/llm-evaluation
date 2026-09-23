/**
 * ship.js —— 「自然选择号」体素雕塑（顶级版 v2）
 *
 * 参照：《三体·引力之外》自然选择号设定图
 * 升级要点（相对 v1）：
 *   - 网格升级到 280×280×500 = 39,200,000 单元，实体体素冲 300 万+
 *   - 双大环（前环 R=104 + 后环 R=132），参考图里最醒目的两道圆
 *   - 4 主喷口 + 4 副喷口 + 外环 4 翼辅助喷口，总 12 道等离子体
 *   - 8 阶 greeble 层 + 更精细的装甲板缝 + 橙色饰带
 *   - 舰首传感器阵列 + 舰桥塔 + 三桅杆
 *   - 更丰富的舷窗灯带、机械细节、机库舱门
 *
 * 造型约定：+Z 为舰首，X 为横向，Y 为垂向。
 * 全部为确定性程序生成，无随机种子依赖，每次打开完全一致。
 */

import { VoxelGrid, Palette, ihash, hash3 } from './voxel.js';

/* ============================== 网格尺寸 ============================== */

export const GRID = { sx: 320, sy: 320, sz: 520 };
const CX = 160;                 // 舰体轴线 X
const CY = 160;                 // 舰体轴线 Y（留出足够空间给大环）
const Z_STERN = 15;             // 尾端 z
const Z_BOW = 486;              // 舰首尖端
const Z_FRONT_RING = 155;       // 前环中心
const Z_AFT_RING = 305;         // 后环中心（主环）
const FRONT_RING_R = 110;
const FRONT_RING_TUBE = 11;
const AFT_RING_R = 138;
const AFT_RING_TUBE = 14;

/* ============================== 材质库 ============================== */

const MATERIALS = {
  HULL_WHITE: 0xf0eee8,
  HULL_LIGHT: 0xf8f6f1,
  HULL_MID: 0xc4bfb5,
  HULL_GREY: 0x958e85,
  HULL_DARK: 0x625d58,
  HULL_SHADOW: 0x48443f,
  MECH: 0x44464d,
  MECH_DARK: 0x282a2f,
  MECH_BLACK: 0x16171b,
  ORANGE: 0xe4632c,
  ORANGE_DEEP: 0xa63d17,
  ORANGE_BRIGHT: 0xff7a3a,
  STEEL: 0x9ea4ac,
  STEEL_DARK: 0x6c7278,
  PLATE_EDGE: 0xded9d1,
  RADIATOR: 0x505459,
  GOLD: 0xc9a552,
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
  add('HULL_SHADOW', MATERIALS.HULL_SHADOW, { jitter: 0.2 });
  add('MECH', MATERIALS.MECH, { jitter: 0.2 });
  add('MECH_DARK', MATERIALS.MECH_DARK, { jitter: 0.22 });
  add('MECH_BLACK', MATERIALS.MECH_BLACK, { jitter: 0.24 });
  add('ORANGE', MATERIALS.ORANGE, { jitter: 0.14 });
  add('ORANGE_DEEP', MATERIALS.ORANGE_DEEP, { jitter: 0.16 });
  add('ORANGE_BRIGHT', MATERIALS.ORANGE_BRIGHT, { jitter: 0.12 });
  add('STEEL', MATERIALS.STEEL, { jitter: 0.18 });
  add('STEEL_DARK', MATERIALS.STEEL_DARK, { jitter: 0.18 });
  add('PLATE_EDGE', MATERIALS.PLATE_EDGE, { jitter: 0.1 });
  add('RADIATOR', MATERIALS.RADIATOR, { jitter: 0.14 });
  add('GOLD', MATERIALS.GOLD, { jitter: 0.12 });
  // 自发光系列
  add('WIN_CYAN', 0xa6ecff, { emissive: true, jitter: 0 });
  add('WIN_BLUE', 0x4fb4ff, { emissive: true, jitter: 0 });
  add('WIN_WARM', 0xffd9a0, { emissive: true, jitter: 0 });
  add('WIN_RED', 0xff5a3a, { emissive: true, jitter: 0 });
  add('GLOW_BLUE', 0x2f7bff, { emissive: true, jitter: 0 });
  add('GLOW_WHITE', 0xdcf0ff, { emissive: true, jitter: 0 });
  add('GLOW_DEEP', 0x1a50b8, { emissive: true, jitter: 0 });
  add('BEACON_RED', 0xff3b2f, { emissive: true, jitter: 0 });
  add('BEACON_GREEN', 0x46ff86, { emissive: true, jitter: 0 });
  add('BEACON_YELLOW', 0xffcf4a, { emissive: true, jitter: 0 });
  return { palette: p, m };
}

/* ============================== 舰体剖面 ============================== */

// [z, 半径, 纵向压扁系数]
const PROFILE = [
  [Z_STERN, 30, 0.85],
  [22, 38, 0.92],
  [44, 42, 0.94],
  [72, 44, 0.94],
  [104, 43, 0.93],
  [Z_FRONT_RING, 44, 0.92],
  [184, 43, 0.92],
  [214, 42, 0.91],
  [246, 41, 0.90],
  [276, 40, 0.90],
  [Z_AFT_RING, 41, 0.91],
  [332, 39, 0.90],
  [360, 35, 0.88],
  [386, 30, 0.85],
  [410, 24, 0.80],
  [432, 18, 0.72],
  [452, 13, 0.65],
  [466, 9, 0.58],
  [476, 6, 0.55],
  [484, 3.2, 0.52],
  [Z_BOW, 1.4, 0.5],
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
  return { r: 22, ys: 0.8 };
}

/** 八角形截面（带平底），返回归一化坐标或 null */
function sectionTest(dx, dy, r, ys) {
  if (r <= 0) return null;
  const u = dx / r;
  const v = dy / (r * ys);
  const au = Math.abs(u);
  const av = Math.abs(v);
  if (au > 1 || av > 1) return null;
  if (au + av > 1.36) return null;
  if (v < -0.58) return null; // 平底：腹部削平
  return { u, v };
}

/* ============================== 工具 ============================== */

let SHIP_LOG = () => {};
function dbg(msg) { SHIP_LOG(msg); }

/** 在盒体内对暴露在空气中的实体体素重新上色，fn 返回 0 则保持原样 */
function paintExposed(g, x0, y0, z0, x1, y1, z1, fn) {
  for (let x = Math.max(x0, 0); x <= Math.min(x1, g.sx - 1); x++) {
    for (let y = Math.max(y0, 0); y <= Math.min(y1, g.sy - 1); y++) {
      for (let z = Math.max(z0, 0); z <= Math.min(z1, g.sz - 1); z++) {
        if (g.get(x, y, z) === 0) continue;
        const exposed =
          g.get(x + 1, y, z) === 0 || g.get(x - 1, y, z) === 0 ||
          g.get(x, y + 1, z) === 0 || g.get(x, y - 1, z) === 0 ||
          g.get(x, y, z + 1) === 0 || g.get(x, y, z - 1) === 0;
        if (!exposed) continue;
        const m = fn(x, y, z, g.get(x, y, z));
        if (m) g.paint(x, y, z, m);
      }
    }
  }
}

/** 在暴露面外侧贴一个方块（细节生长；务必先收集再落地） */
function grow(g, x, y, z, m) {
  g.paintAir(x, y, z, m);
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

        // 顶部装甲板更亮，腹部偏灰，收边带一层中间色
        if (v > 0.5) mat = m.HULL_LIGHT;
        else if (v < -0.35) mat = m.HULL_GREY;
        if (au > 0.78 || av > 0.78) mat = m.HULL_MID;

        // 横向装甲缝（每隔 17 格一道）
        const band = ((z % 17) + 17) % 17;
        if (band === 0 || band === 1) mat = m.HULL_MID;
        if (band === 8) mat = m.HULL_GREY;

        // 纵向缝
        if (((Math.abs(dx) * 3 + Math.abs(dy)) % 23) === 0) mat = m.HULL_MID;

        // 环带区域加厚边缘（前后两个环位置加一圈深色护甲）
        const dzFront = Math.abs(z - Z_FRONT_RING);
        const dzAft = Math.abs(z - Z_AFT_RING);
        if ((dzFront < 4 && (band === 0 || band === 3)) ||
            (dzAft < 4 && (band === 0 || band === 3))) mat = m.HULL_DARK;

        g.set(x, y, z, mat);
      }
    }
  }

  // 橙色主饰条：沿背部纵贯，参考图里最抢眼的视觉锚点
  for (let z = 88; z <= 430; z++) {
    const { r, ys } = hullProfile(z);
    const ridge = Math.max(1, Math.round(r * ys * 0.62));
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = ridge - 1; dy <= ridge + 2; dy++) {
        const sec = sectionTest(dx, dy, r, ys);
        if (!sec) continue;
        const inOrange =
          (z >= 96 && z <= 118) || (z >= 152 && z <= 162) ||
          (z >= 228 && z <= 254) || (z >= 302 && z <= 320) ||
          (z >= 372 && z <= 386);
        if (inOrange || Math.abs(dx) === 2) {
          g.paint(CX + dx, CY + dy, z, inOrange ? m.ORANGE : m.ORANGE_DEEP);
        }
      }
    }
  }

  // 腹部暗色防辐射涂层
  for (let z = 60; z <= 380; z += 1) {
    const { r, ys } = hullProfile(z);
    const bellyDepth = Math.round(r * ys * 0.5);
    for (let dx = -Math.round(r * 0.7); dx <= Math.round(r * 0.7); dx++) {
      for (let dy = -bellyDepth; dy <= -bellyDepth + 2; dy++) {
        const sec = sectionTest(dx, dy, r, ys);
        if (!sec) continue;
        if ((z + dx) % 5 < 2) g.paint(CX + dx, CY + dy, z, m.HULL_DARK);
      }
    }
  }
}

/* ============================== 背脊与舰桥 ============================== */

function dorsalStructures(g, m) {
  // 1) 主背脊甲板（贯穿整个舰体上部）
  for (let z = 88; z <= 400; z++) {
    const { r, ys } = hullProfile(z);
    const top = r * ys;
    const width = Math.max(3, 17 - Math.max(0, (z - 320) / 6));
    const height = z > 320 ? 4 : z > 180 ? 10 : 8;
    for (let dx = -width; dx <= width; dx++) {
      const w = width <= 0 ? 0 : 1 - Math.abs(dx) / (width + 1.6);
      if (w <= 0) continue;
      const rise = Math.round(height * w);
      for (let k = 0; k <= rise; k++) {
        const y = CY + Math.round(top) + k;
        let mat = k === rise ? m.HULL_LIGHT : m.HULL_WHITE;
        // 背脊上每隔一段有橙色警示条
        if (k === rise && ((z % 26) < 3)) mat = m.ORANGE;
        // 中央脊线：更亮的钢板
        if (Math.abs(dx) <= 1 && k > 0) mat = m.PLATE_EDGE;
        g.set(CX + dx, y, z, mat);
      }
    }
  }

  // 2) 六边形指挥盘（参考图中部那块带橙边的六角板）
  const hz = 258;
  const hexR = 30;
  for (let dz = -15; dz <= 15; dz++) {
    const z = hz + dz;
    const { r, ys } = hullProfile(z);
    const top = Math.round(CY + r * ys) + 1;
    const shrink = 1 - Math.abs(dz) / 16.5;
    const radius = hexR * shrink;
    if (radius <= 1) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const span = radius - Math.abs(dx) * 0.52;
      for (let dy = -span; dy <= span; dy++) {
        const y = top + 2 + Math.round((1 - Math.abs(dx) / (radius + 1)) * 2);
        const edge = Math.abs(dx) > radius - 2 || Math.abs(dy) > span - 2;
        const innerGlow = Math.abs(dx) < 3 && Math.abs(dy) < 3 && dz === 0;
        g.set(CX + dx, y, z, innerGlow ? m.GOLD : edge ? m.ORANGE : m.PLATE_EDGE);
      }
    }
  }

  // 3) 舰桥塔（六角指挥盘上方的塔楼）
  for (let z = 176; z <= 224; z++) {
    const { r, ys } = hullProfile(z);
    const base = CY + Math.round(r * ys) + 10;
    const t = (z - 176) / 48;
    const w = Math.round(13 - 4 * t);
    const h = Math.round(17 - 6 * t);
    for (let dx = -w; dx <= w; dx++) {
      for (let k = 0; k <= h; k++) {
        const y = base + k;
        if (Math.abs(dx) > w) continue;
        let mat = k > h - 3 ? m.HULL_LIGHT : m.HULL_WHITE;
        // 舰桥窗户带
        if (k === Math.round(h * 0.6) && Math.abs(dx) < w - 1 && (z % 3 === 0)) mat = m.WIN_CYAN;
        if (Math.abs(dx) === w) mat = m.HULL_MID;
        g.set(CX + dx, y, z, mat);
      }
    }
  }

  // 4) 桅杆与天线（三根，顶端各有航空障碍灯）
  const masts = [
    [CX - 10, 195, 32, 'red'],
    [CX + 10, 212, 26, 'green'],
    [CX, 348, 22, 'yellow'],
    [CX - 6, 130, 18, 'red'],
    [CX + 6, 130, 18, 'red'],
  ];
  for (const [mx, mz, mh, beacon] of masts) {
    const { r, ys } = hullProfile(mz);
    const startY = CY + Math.round(r * ys) + 11;
    for (let k = 0; k < mh; k++) {
      const mat = k % 6 === 0 ? m.STEEL : m.MECH_DARK;
      g.set(mx, startY + k, mz, mat);
      if (k === mh - 1) g.set(mx, startY + k, mz, beacon === 'red' ? m.BEACON_RED : beacon === 'green' ? m.BEACON_GREEN : m.BEACON_YELLOW);
      // 中段横向天线板
      if (k > 4 && k % 5 === 2) {
        g.set(mx - 1, startY + k, mz, m.MECH);
        g.set(mx + 1, startY + k, mz, m.MECH);
        g.set(mx, startY + k, mz - 1, m.MECH);
        g.set(mx, startY + k, mz + 1, m.MECH);
      }
    }
  }

  // 5) 舰桥侧翼小舱（参考图指挥盘两侧的小盒子）
  for (const side of [-1, 1]) {
    for (let dz = -18; dz <= 18; dz++) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = 0; dx <= 8; dx++) {
          const x = CX + side * (hexR + 2 + dx);
          const y = CY + Math.round(hullProfile(hz).r * hullProfile(hz).ys) + 2 + dy;
          const z = hz + dz;
          const edge = dx === 0 || dy === 3 || dy === -3;
          g.set(x, y, z, edge ? m.ORANGE_DEEP : m.HULL_MID);
        }
      }
    }
  }
}

/* ============================== 重力环（双大环） ============================== */

function buildRing(g, m, { centerZ, radius, tube, segs, warmLightRatio, hasSpokes, spokeCount, spokeAngle, outerTeeth }) {
  const ri = radius + tube + 3;
  const t2 = tube * tube;

  for (let dx = -ri; dx <= ri; dx++) {
    for (let dy = -ri; dy <= ri; dy++) {
      const rad = Math.sqrt(dx * dx + dy * dy);
      const dr = rad - radius;
      if (Math.abs(dr) > tube) continue;
      const halfZ = Math.sqrt(Math.max(0, t2 - dr * dr));
      const zFrom = Math.round(centerZ - halfZ);
      const zTo = Math.round(centerZ + halfZ);
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += Math.PI * 2;
      const seg = Math.floor((ang / (Math.PI * 2)) * segs);
      const shell = Math.abs(dr) > tube - 2.4;

      let mat = seg % 2 === 0 ? m.HULL_WHITE : m.HULL_MID;
      if (seg % 8 === 0) mat = m.STEEL;
      if (seg % 16 === 3) mat = m.ORANGE;
      if (seg % 24 === 5) mat = m.ORANGE_DEEP;
      if (shell) mat = seg % 2 === 0 ? m.PLATE_EDGE : m.HULL_LIGHT;

      // 环内侧预留舷窗窗位
      for (let z = zFrom; z <= zTo; z++) {
        const x = CX + dx;
        const y = CY + dy;
        const isInnerFace = dr < -tube + 2.6 && Math.abs(z - centerZ) < 2.2;
        if (isInnerFace && seg % 2 === 0) {
          g.set(x, y, z, warmLightRatio > 0.5 ? m.WIN_WARM : m.WIN_CYAN);
        } else {
          g.set(x, y, z, mat);
        }
      }

      // 环外侧「齿状」散热块（长度按 4 格硬上限，避免撑出网格）
      if (outerTeeth && dr > 0 && Math.abs(ang % (Math.PI / 15)) < 0.035) {
        for (let k = 0; k < 5; k++) {
          const extra = (k + 1) / 5;
          const rr = 1 + (extra * 2.5) / Math.max(24, radius);
          g.set(Math.round(CX + dx * rr), Math.round(CY + dy * rr), centerZ, k % 2 ? m.ORANGE : m.STEEL);
        }
      }
    }
  }

  // 环体内圈暖色舱灯带（沿圆周分布）
  for (let a = 0; a < 960; a++) {
    const ang = (a / 960) * Math.PI * 2;
    const x = Math.round(CX + Math.cos(ang) * (radius - tube + 1.2));
    const y = Math.round(CY + Math.sin(ang) * (radius - tube + 1.2));
    if ((a % 7) < 2) g.set(x, y, centerZ, m.WIN_WARM);
  }

  // 外圈细环（第二道轮廓，让剪影更精致；偏移收紧，避免撑出网格边缘）
  const outerR = radius + tube + 4;
  for (let a = 0; a < 1620; a++) {
    const ang = (a / 1620) * Math.PI * 2;
    const x = Math.round(CX + Math.cos(ang) * outerR);
    const y = Math.round(CY + Math.sin(ang) * outerR);
    const mat = a % 60 < 2 ? m.ORANGE : m.STEEL;
    for (let dz = -1; dz <= 1; dz++) g.set(x, y, centerZ + dz, mat);
  }

  // 双圈装饰（在环内再加一圈更细的支撑结构）
  const innerDecoR = radius - tube - 4;
  if (innerDecoR > 4) {
    for (let a = 0; a < 720; a++) {
      const ang = (a / 720) * Math.PI * 2;
      const x = Math.round(CX + Math.cos(ang) * innerDecoR);
      const y = Math.round(CY + Math.sin(ang) * innerDecoR);
      if (g.get(x, y, centerZ) === 0 && g.get(x, y, centerZ - 1) === 0 && g.get(x, y, centerZ + 1) === 0) {
        g.set(x, y, centerZ, a % 8 === 0 ? m.STEEL : m.MECH);
      }
    }
  }

  // 辐射支撑臂：从环连接到舰体中心
  if (hasSpokes && spokeCount > 0) {
    for (let s = 0; s < spokeCount; s++) {
      const deg = spokeAngle + (s * 360) / spokeCount;
      const ang = (deg * Math.PI) / 180;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rFrom = 24; // 从舰体边缘往外
      for (let r = rFrom; r <= radius - tube + 2; r += 0.6) {
        const px = CX + ca * r;
        const py = CY + sa * r;
        const half = r < 40 ? 3.6 : 4.6;
        const halfZ = r < 40 ? 7 : 5;
        const hi = Math.ceil(half);
        for (let a = -hi; a <= hi; a++) {
          for (let b = -hi; b <= hi; b++) {
            if (a * a + b * b > half * half + 1) continue;
            for (let dz = -halfZ; dz <= halfZ; dz++) {
              const x = Math.round(px + a);
              const y = Math.round(py + b);
              const z = centerZ + dz;
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
  }
}

function gravityRings(g, m) {
  // 前环（较小，传感器 / 散热）
  buildRing(g, m, {
    centerZ: Z_FRONT_RING,
    radius: FRONT_RING_R,
    tube: FRONT_RING_TUBE,
    segs: 48,
    warmLightRatio: 0.4,
    hasSpokes: true,
    spokeCount: 6,
    spokeAngle: 30,
    outerTeeth: true,
  });

  // 后环（主环，更大更醒目）
  buildRing(g, m, {
    centerZ: Z_AFT_RING,
    radius: AFT_RING_R,
    tube: AFT_RING_TUBE,
    segs: 64,
    warmLightRatio: 0.7,
    hasSpokes: true,
    spokeCount: 8,
    spokeAngle: 15,
    outerTeeth: true,
  });

  // 前环外侧额外传感器小圈
  const sensorZ = Z_FRONT_RING;
  for (let a = 0; a < 360; a += 6) {
    const ang = (a * Math.PI) / 180;
    const x = Math.round(CX + Math.cos(ang) * (FRONT_RING_R + FRONT_RING_TUBE + 6));
    const y = Math.round(CY + Math.sin(ang) * (FRONT_RING_R + FRONT_RING_TUBE + 6));
    g.set(x, y, sensorZ, a % 24 === 0 ? m.GOLD : m.MECH);
  }

  // 后环外侧细密散热齿：4 组 × 每齿 4 格径向厚度（收紧，避免撑出网格）
  for (const deg of [0, 90, 180, 270]) {
    const ang = (deg * Math.PI) / 180;
    for (let k = 0; k < 3; k++) {
      const r = AFT_RING_R + AFT_RING_TUBE + 2 + k;
      const x = Math.round(CX + Math.cos(ang) * r);
      const y = Math.round(CY + Math.sin(ang) * r);
      for (let dz = -2; dz <= 2; dz++) {
        g.set(x, y, Z_AFT_RING + dz, k === 1 ? m.ORANGE : m.STEEL_DARK);
      }
    }
  }
}

/* ============================== 尾部动力舱 ============================== */

const NOZZLES = [];
const AUX_NOzzLES = [];

function engineSection(g, m) {
  // 1) 尾端整面加厚：方形动力舱
  for (let z = Z_STERN; z <= 72; z++) {
    const { r, ys } = hullProfile(z);
    const rr = r + (z < 30 ? 1.8 : 0);
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
    [-22, -22],
    [22, -22],
    [-22, 22],
    [22, 22],
  ];
  for (const [ox, oy] of offs) {
    const nx = CX + ox;
    const ny = CY + oy;
    NOZZLES.push({ x: nx, y: ny, z: Z_STERN - 2 });
    for (let z = Z_STERN - 3; z <= 72; z++) {
      const t = (z - (Z_STERN - 3)) / 75;
      const radius = 15.5 - 8 * t;
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
  paintExposed(g, CX - 46, CY - 46, Z_STERN - 4, CX + 46, CY + 46, 78, (x, y, z) => {
    for (const [ox, oy] of offs) {
      const dx = x - (CX + ox);
      const dy = y - (CY + oy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 17) continue;
      const t = (z - (Z_STERN - 3)) / 75;
      const radius = 15.5 - 8 * t;
      if (d < radius - 4) continue;
      if (z >= 58) return m.GLOW_BLUE;
      if (z >= 50) return m.WIN_BLUE;
      if (d > radius - 1.6) return z < 24 ? m.STEEL : m.MECH_DARK;
      return m.MECH;
    }
    return 0;
  });

  // 4) 尾部环状橙色结构（参考图中最醒目的橙环）
  for (let z = Z_STERN - 1; z <= Z_STERN + 12; z++) {
    for (let dx = -48; dx <= 48; dx++) {
      for (let dy = -48; dy <= 48; dy++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 32 || d > 44) continue;
        let blocked = false;
        for (const [ox, oy] of offs) {
          const ndx = dx - ox;
          const ndy = dy - oy;
          if (ndx * ndx + ndy * ndy < 18 * 18) blocked = true;
        }
        if (blocked) continue;
        const mat = (z - Z_STERN) % 6 < 3 ? m.ORANGE : m.ORANGE_DEEP;
        g.set(CX + dx, CY + dy, z, mat);
      }
    }
  }

  // 5) 侧向辅助喷口 ×4（尾端四角外扩的小喷口）
  const auxOffs = [
    [CX - 36, CY - 36],
    [CX + 36, CY - 36],
    [CX - 36, CY + 36],
    [CX + 36, CY + 36],
  ];
  for (const [px, py] of auxOffs) {
    const dirX = px > CX ? 1 : -1;
    const dirY = py > CY ? 1 : -1;
    const stemX = px + dirX * 6;
    const stemY = py + dirY * 6;
    // 支架
    for (let x = Math.min(px, stemX); x <= Math.max(px, stemX); x++) {
      for (let y = Math.min(py, stemY); y <= Math.max(py, stemY); y++) {
        for (let z = 16; z <= 52; z++) g.set(x, y, z, z % 15 < 2 ? m.ORANGE : m.MECH);
      }
    }
    // 喷管本体
    for (let z = 6; z <= 44; z++) {
      const t = (z - 6) / 38;
      const radius = 9.5 - 4.6 * t;
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
    AUX_NOzzLES.push({ x: stemX, y: stemY, z: 4 });
  }
}

/* ============================== 侧挂舱与散热鳍 ============================== */

function sideModules(g, m) {
  // 大型侧挂外舱
  const pods = [
    [CX - 68, CY - 4, 66, 148],
    [CX + 68, CY - 4, 66, 148],
  ];
  for (const [px, py, z0, z1] of pods) {
    for (let z = z0; z <= z1; z++) {
      const t = (z - z0) / (z1 - z0);
      const radius = 12.5 * Math.sin(Math.PI * (0.12 + 0.76 * t)) + 3;
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
    for (let s = 0; s < 26; s++) {
      const x = px - side * s;
      for (let dy = -3; dy <= 3; dy++) {
        for (let z = 82; z <= 128; z += 19) {
          if (g.get(x, py + dy, z) === 0) g.set(x, py + dy, z, dy === 0 ? m.MECH_DARK : m.MECH);
        }
      }
    }
    // 外舱尾部小喷口（作为侧向辅助喷口）
    for (let dx = -7; dx <= 7; dx++) {
      for (let dy = -7; dy <= 7; dy++) {
        if (dx * dx + dy * dy > 49) continue;
        for (let z = z0 - 7; z <= z0; z++) g.carveBox(px + dx, py + dy, z, px + dx, py + dy, z);
      }
    }
    AUX_NOzzLES.push({ x: px, y: py, z: z0 - 6, small: true });
  }

  // 散热鳍（尾部两侧的大型薄板）
  for (const side of [-1, 1]) {
    const x0 = CX + side * 50;
    const x1 = CX + side * 92;
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const t = Math.abs(x - x0) / Math.abs(x1 - x0);
      const halfZ = 28 - 12 * t;
      for (let z = Math.round(100 - halfZ); z <= Math.round(100 + halfZ); z++) {
        for (let y = CY - 3; y <= CY + 3; y++) {
          const mat = (x + z) % 17 < 3 ? m.ORANGE : (y === CY ? m.RADIATOR : m.HULL_GREY);
          if (g.get(x, y, z) === 0) g.set(x, y, z, mat);
        }
      }
    }
  }

  // 背鳍（参考图舰体上方的板状突出）
  for (const [z0, z1, h] of [[352, 410, 18], [216, 258, 14], [92, 118, 10]]) {
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

  // 腹鳍（舰体下方的板状突出，与背鳍呼应）
  for (const [z0, z1, h] of [[120, 156, 8], [340, 372, 10]]) {
    for (let z = z0; z <= z1; z++) {
      const { r, ys } = hullProfile(z);
      const bot = Math.round(CY - r * ys);
      const t = (z - z0) / (z1 - z0);
      const hh = Math.round(h * Math.sin(Math.PI * t) * 0.9 + 1);
      for (let k = 0; k <= hh; k++) {
        const mat = k === 0 ? m.ORANGE : k < 2 ? m.HULL_LIGHT : m.HULL_MID;
        g.set(CX, bot - k, z, mat);
        g.set(CX + 1, bot - k, z, mat);
        g.set(CX - 1, bot - k, z, mat);
      }
    }
  }
}

/* ============================== 腹部结构 ============================== */

function ventralStructures(g, m) {
  // 腹部装甲板
  paintExposed(g, CX - 48, CY - 48, 74, CX + 48, CY - 10, 320, (x, y) => {
    if ((x * 3 + y) % 31 < 2) return m.MECH_DARK;
    if ((x + y) % 47 < 2) return m.ORANGE_DEEP;
    return 0;
  });

  // 大型机库 / 坞舱门（腹部的两处大型入口，内透青光）
  for (const zc of [204, 234]) {
    for (let dz = -7; dz <= 7; dz++) {
      const z = zc + dz;
      const { r, ys } = hullProfile(z);
      const bottom = Math.round(CY - r * ys);
      for (let dx = -18; dx <= 18; dx++) {
        for (let k = 0; k <= 5; k++) {
          const y = bottom - k;
          const edge = Math.abs(dx) > 16 || Math.abs(dz) > 5;
          const mat = edge ? m.ORANGE : k === 0 ? m.MECH_DARK : m.MECH;
          g.set(CX + dx, y, z, mat);
        }
      }
      // 坞舱内透出的青光
      for (let dx = -14; dx <= 14; dx += 3) {
        g.set(CX + dx, bottom - 6, z, m.WIN_CYAN);
      }
    }
  }

  // 起落支撑柱
  for (const [ox, oz] of [[-24, 156], [24, 156], [-24, 258], [24, 258]]) {
    const { r, ys } = hullProfile(oz);
    const bottom = Math.round(CY - r * ys);
    for (let k = 0; k <= 15; k++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          g.set(CX + ox + dx, bottom - k, oz + dz, k % 7 === 0 ? m.ORANGE : m.MECH);
        }
      }
    }
  }

  // 腹部装甲棱线（腹部的横向板缝）
  for (let z = 90; z <= 340; z += 8) {
    const { r, ys } = hullProfile(z);
    const bot = Math.round(CY - r * ys);
    for (let dx = -Math.round(r * 0.7); dx <= Math.round(r * 0.7); dx++) {
      if (g.get(CX + dx, bot - 1, z) === 0) g.set(CX + dx, bot - 1, z, m.ORANGE_DEEP);
    }
  }
}

/* ============================== 表面细节层 ============================== */

function surfaceDetail(g, m) {
  const pick = ihash;
  const rand = hash3;

  dbg('    · 舷窗灯带');
  // 1) 舷窗灯带：沿舰体侧面成排分布
  g.forEachExposed((x, y, z, mask, mat) => {
    if (mat >= m.WIN_CYAN) return;
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
  //    必须「先收集再落地」——遍历过程中直接长方块会沿 Y 级联
  const edges = [];
  g.forEachExposed((x, y, z, mask, mat) => {
    if (!(mask & 4)) return; // 只有朝上的面
    if (mat >= m.WIN_CYAN) return;
    const dx = x - CX;
    if (!(Math.abs(dx) < 52 && z > 20 && z < 440)) return;
    if (x % 15 === 0 || z % 15 === 0) edges.push([x, y, z]);
  });
  for (const [x, y, z] of edges) {
    if (g.get(x, y + 1, z) !== 0) continue;
    const useOrange = (z % 45 < 3) || (x % 45 < 3);
    g.paintAir(x, y + 1, z, useOrange ? m.ORANGE : m.PLATE_EDGE);
  }

  dbg('    · 机械细节生长');
  // 3) 机械细节生长（greeble）：在暴露面上长小方块
  //    护栏：径向超过 R_SAFE 后禁止向外（+X/-X/+Y/-Y）生长，避免撑出网格
  const R_SAFE = 152;
  const spots = [];
  g.forEachExposed((x, y, z, mask, mat) => {
    if (mat >= m.WIN_CYAN) return;
    const dx = x - CX;
    const dy = y - CY;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (pick(x, y, z, 7) % 47 !== 0) return; // 提高密度（v1 是 61）
    // 只放行向内（或中性）方向；如果这个面朝外且已近边缘，直接过滤
    const outward = (mask & 1) || (mask & 2) || (mask & 4) || (mask & 8);
    if (outward && Math.sqrt(dx * dx + dy * dy) > R_SAFE) return;
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
          let tx = x, ty = y, tz = z;
          if (mask & 4) { ty += c + 1; tx += a - 1; tz += b - 1; }
          else if (mask & 8) { ty -= c + 1; tx += a - 1; tz += b - 1; }
          else if (mask & 1) { tx += c + 1; ty += a - 1; tz += b - 1; }
          else if (mask & 2) { tx -= c + 1; ty += a - 1; tz += b - 1; }
          else if (mask & 16) { tz += c + 1; tx += a - 1; ty += b - 1; }
          else { tz -= c + 1; tx += a - 1; ty += b - 1; }
          grow(g, tx, ty, tz, mat);
        }
      }
    }
  }

  // 4) 横向橙色警示条（腹侧上方）
  paintExposed(g, CX - 54, CY - 54, 30, CX + 54, CY + 54, 440, (x, y, z, mat) => {
    if (mat >= m.WIN_CYAN) return 0;
    const band = ((z % 57) + 57) % 57;
    if (band > 2) return 0;
    const dy = y - CY;
    if (dy < -6) return 0;
    return m.ORANGE_DEEP;
  });

  // 5) 舰首传感器阵列（前端尖端的复杂结构）
  paintExposed(g, CX - 26, CY - 26, 380, CX + 26, CY + 26, 485, (x, y) => {
    if ((x + y) % 7 < 2) return m.MECH_DARK;
    if ((x * 2 + y) % 19 < 2) return m.STEEL;
    return 0;
  });

  // 6) 舰首尖端信标（红色警示灯）
  const tip = hullProfile(Z_BOW - 1);
  g.set(CX, CY, Z_BOW, m.BEACON_RED);
  if (tip.r < 3) {
    g.set(CX, CY, Z_BOW + 1, m.GLOW_WHITE);
    g.set(CX - 1, CY, Z_BOW, m.GLOW_WHITE);
    g.set(CX + 1, CY, Z_BOW, m.GLOW_WHITE);
  }

  // 7) 舰首侧面雷达盘（两侧的大型传感器）
  for (const side of [-1, 1]) {
    const rx = CX + side * 20;
    const rz = 340;
    for (let dz = -8; dz <= 8; dz++) {
      const { r, ys } = hullProfile(rz + dz);
      const attachY = CY + Math.round(r * ys * 0.5);
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          if (dx * dx + dy * dy > 36) continue;
          const ang = Math.atan2(dy, dx);
          const mat = (Math.cos(ang) > 0.6 && side > 0) || (Math.cos(ang) < -0.6 && side < 0) ? m.WIN_CYAN : m.MECH_DARK;
          const x = rx + side * dx;
          const y = attachY + dy;
          if (g.get(x, y, rz + dz) === 0) g.set(x, y, rz + dz, mat);
        }
      }
    }
  }

  // 8) 舰首顶部传感器阵列
  for (let z = 400; z <= 476; z++) {
    const { r, ys } = hullProfile(z);
    const top = Math.round(CY + r * ys) + 1;
    if (r < 3) break;
    for (let dx = -Math.round(r * 0.6); dx <= Math.round(r * 0.6); dx++) {
      if ((z + dx) % 5 === 0) {
        g.set(CX + dx, top, z, dx % 3 === 0 ? m.WIN_CYAN : m.MECH);
        g.set(CX + dx, top + 1, z, m.MECH_DARK);
      }
    }
  }
}

/* ============================== 装配 ============================== */

export function buildNaturalSelection(options = {}) {
  const log = options.log || (() => {});
  SHIP_LOG = log;
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
  stage('前环（传感器环）', () => {
    buildRing(g, m, {
      centerZ: Z_FRONT_RING,
      radius: FRONT_RING_R,
      tube: FRONT_RING_TUBE,
      segs: 48,
      warmLightRatio: 0.4,
      hasSpokes: true,
      spokeCount: 6,
      spokeAngle: 30,
      outerTeeth: true,
    });
  });
  stage('后环（主重力环）', () => {
    buildRing(g, m, {
      centerZ: Z_AFT_RING,
      radius: AFT_RING_R,
      tube: AFT_RING_TUBE,
      segs: 64,
      warmLightRatio: 0.7,
      hasSpokes: true,
      spokeCount: 8,
      spokeAngle: 15,
      outerTeeth: true,
    });
    // 前环外侧额外传感器小圈
    for (let a = 0; a < 360; a += 6) {
      const ang = (a * Math.PI) / 180;
      const x = Math.round(CX + Math.cos(ang) * (FRONT_RING_R + FRONT_RING_TUBE + 6));
      const y = Math.round(CY + Math.sin(ang) * (FRONT_RING_R + FRONT_RING_TUBE + 6));
      g.set(x, y, Z_FRONT_RING, a % 24 === 0 ? m.GOLD : m.MECH);
    }
    // 后环外侧细密散热齿（收紧，避免撑出网格）
    for (const deg of [0, 90, 180, 270]) {
      const ang = (deg * Math.PI) / 180;
      for (let k = 0; k < 3; k++) {
        const r = AFT_RING_R + AFT_RING_TUBE + 2 + k;
        const x = Math.round(CX + Math.cos(ang) * r);
        const y = Math.round(CY + Math.sin(ang) * r);
        for (let dz = -2; dz <= 2; dz++) {
          g.set(x, y, Z_AFT_RING + dz, k === 1 ? m.ORANGE : m.STEEL_DARK);
        }
      }
    }
  });  stage('背脊 / 舰桥', () => dorsalStructures(g, m));
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
  // 自检：舰体应当收在网格中部，超出说明坐标量化又有问题
  if (minY < 2 || maxY > GRID.sy - 2 || minX < 2 || maxX > GRID.sx - 2) {
    log('  ⚠ 造型贴近网格边缘，请检查坐标量化');
  }

  return {
    grid: g,
    palette,
    materials: m,
    nozzles: NOZZLES,
    auxNozzles: AUX_NOzzLES,
    bounds: { minX, minY, maxX, maxY, minZ, maxZ },
    sculptMs: tSculpt,
    cells: sx * sy * sz,
    // 供 main.js 计算镜头用的关键点
    keys: {
      bow: { x: CX, y: CY, z: Z_BOW },
      stern: { x: CX, y: CY, z: Z_STERN },
      frontRing: { x: CX, y: CY, z: Z_FRONT_RING, r: FRONT_RING_R },
      aftRing: { x: CX, y: CY, z: Z_AFT_RING, r: AFT_RING_R },
      bridge: { x: CX, y: CY + 60, z: 200 },
    },
  };
}
