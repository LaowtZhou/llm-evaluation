/**
 * tools/preview.mjs —— 离线预览器
 *
 * 不依赖浏览器：直接在 Node 里跑体素雕塑 + 网格化，然后用一个极简
 * Z-Buffer 光栅化器把结果画成 PNG。用来快速检查舰体造型是否正确。
 *
 * 用法：node tools/preview.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildNaturalSelection, GRID } from '../src/ship.js';
import { buildVoxelGeometry } from '../src/voxel.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ---------------- PNG 编码 ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function writePng(file, w, h, rgb) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

/* ---------------- 光栅化 ---------------- */

function renderView(meshes, opts) {
  const {
    width = 1400, height = 980,
    azimuth = 35, elevation = 18,
    target = [0, 0, 0], fit = 1.06,
    bg = [10, 14, 22],
  } = opts;

  const az = (azimuth * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  // 相机方向
  const fwd = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  const right = [Math.cos(az), 0, -Math.sin(az)];
  const up = [
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[2] * fwd[1],
    right[1] * fwd[0] - right[0] * fwd[1],
  ];
  // 用叉积算 up = fwd × right
  const upx = fwd[1] * right[2] - fwd[2] * right[1];
  const upy = fwd[2] * right[0] - fwd[0] * right[2];
  const upz = fwd[0] * right[1] - fwd[1] * right[0];

  const project = (x, y, z) => {
    const px = x - target[0];
    const py = y - target[1];
    const pz = z - target[2];
    return [
      px * right[0] + py * right[1] + pz * right[2],
      px * upx + py * upy + pz * upz,
      px * fwd[0] + py * fwd[1] + pz * fwd[2],
    ];
  };

  // 先算屏幕包围盒
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const mesh of meshes) {
    const pos = mesh.positions;
    for (let i = 0; i < pos.length; i += 3) {
      const p = project(pos[i], pos[i + 1], pos[i + 2]);
      if (p[0] < minU) minU = p[0];
      if (p[0] > maxU) maxU = p[0];
      if (p[1] < minV) minV = p[1];
      if (p[1] > maxV) maxV = p[1];
    }
  }
  const spanU = maxU - minU;
  const spanV = maxV - minV;
  const scale = Math.min(width / (spanU * fit), height / (spanV * fit));
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;

  if (opts.debug) {
    console.log('   [debug] 投影包围盒 u[' + minU.toFixed(2) + ',' + maxU.toFixed(2) + '] v[' + minV.toFixed(2) + ',' + maxV.toFixed(2) + ']');
    console.log('   [debug] scale=' + scale + ' cu=' + cu + ' cv=' + cv);
    let nan = 0;
    for (const mesh of meshes) {
      const p = mesh.positions;
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) nan++;
    }
    console.log('   [debug] 非法坐标数量 = ' + nan);
    let maxIdx = -1;
    for (const mesh of meshes) {
      let mx = 0;
      for (let i = 0; i < mesh.indices.length; i++) if (mesh.indices[i] > mx) mx = mesh.indices[i];
      console.log('   [debug] 顶点数=' + (mesh.positions.length / 3) + ' 索引最大值=' + mx);
      maxIdx = Math.max(maxIdx, mx);
    }
  }

  const color = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    color[i * 3] = bg[0];
    color[i * 3 + 1] = bg[1];
    color[i * 3 + 2] = bg[2];
  }
  const depth = new Float32Array(width * height).fill(Infinity);

  const L = [0.55, 0.46, 0.69];
  const len = Math.hypot(...L);
  const light = L.map((v) => v / len);
  const rim = [-0.72, -0.18, -0.66];

  let drawn = 0;
  for (const mesh of meshes) {
    const { positions, normals, colors, indices, colorNormalized } = mesh;
    for (let t = 0; t < indices.length; t += 3) {
      const i0 = indices[t] * 3;
      const i1 = indices[t + 1] * 3;
      const i2 = indices[t + 2] * 3;

      const a = project(positions[i0], positions[i0 + 1], positions[i0 + 2]);
      const b = project(positions[i1], positions[i1 + 1], positions[i1 + 2]);
      const c = project(positions[i2], positions[i2 + 1], positions[i2 + 2]);

      const ax = (a[0] - cu) * scale + width / 2;
      const ay = height / 2 - (a[1] - cv) * scale;
      const bx = (b[0] - cu) * scale + width / 2;
      const by = height / 2 - (b[1] - cv) * scale;
      const cx = (c[0] - cu) * scale + width / 2;
      const cy = height / 2 - (c[1] - cv) * scale;

      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
      if (minX > maxX || minY > maxY) continue;

      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-9) continue;
      const inv = 1 / area;

      // 面法线（用三顶点法线平均），面着色
      const nx = (normals[i0] + normals[i1] + normals[i2]) / 3;
      const ny = (normals[i0 + 1] + normals[i1 + 1] + normals[i2 + 1]) / 3;
      const nz = (normals[i0 + 2] + normals[i1 + 2] + normals[i2 + 2]) / 3;

      const nl = Math.hypot(nx, ny, nz) || 1;
      const ndx = nx / nl, ndy = ny / nl, ndz = nz / nl;
      const lam = Math.max(0, ndx * light[0] + ndy * light[1] + ndz * light[2]);
      const rimV = Math.max(0, ndx * rim[0] + ndy * rim[1] + ndz * rim[2]);
      const rimW = Math.pow(rimV, 2.2) * 0.42;

      const cr = colorNormalized ? colors[i0] / 255 : colors[i0];
      const cg = colorNormalized ? colors[i0 + 1] / 255 : colors[i0 + 1];
      const cb = colorNormalized ? colors[i0 + 2] / 255 : colors[i0 + 2];

      let r = cr * (0.1 + lam * 1.02) + rimW * 0.16;
      let g = cg * (0.1 + lam * 1.02) + rimW * 0.26;
      let bl = cb * (0.1 + lam * 1.02) + rimW * 0.45;

      const zAvg = (a[2] + b[2] + c[2]) / 3;
      drawn++;

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * inv;
          const w1 = ((px - ax) * (cy - ay) - (py - ay) * (cx - ax)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const idx = y * width + x;
          if (zAvg >= depth[idx]) continue;
          depth[idx] = zAvg;
          color[idx * 3] = Math.min(255, Math.max(0, Math.round(r * 255)));
          color[idx * 3 + 1] = Math.min(255, Math.max(0, Math.round(g * 255)));
          color[idx * 3 + 2] = Math.min(255, Math.max(0, Math.round(bl * 255)));
        }
      }
    }
  }
  return { color, width, height, drawn };
}

/* ---------------- 主流程 ---------------- */

const t0 = Date.now();
try { fs.writeFileSync('_preview.log', ''); } catch (e) { /* ignore */ }
const LOG = (s) => {
  console.log(s);
  try { fs.appendFileSync('_preview.log', s + '\n'); } catch (e) { /* ignore */ }
};
LOG('体素雕塑中...');
const ship = buildNaturalSelection({ log: LOG });
const tSculpt = Date.now() - t0;

LOG('网格化中...');
const t1 = Date.now();
const meshed = buildVoxelGeometry(ship.grid, ship.palette, { ao: true });
const tMesh = Date.now() - t1;
LOG('内部体素统计中...');
const hidden = ship.grid.countHidden();
LOG('统计完成，开始渲染视图...');
const b = ship.bounds;
const cx = (b.minX + b.maxX + 1) / 2;
const cy = (b.minY + b.maxY + 1) / 2;
const cz = (b.minZ + b.maxZ + 1) / 2;

console.log('=== 自然选择号 · 体素雕塑报告 ===');
console.log('网格尺寸        ', GRID.sx + ' × ' + GRID.sy + ' × ' + GRID.sz, '=', ship.cells.toLocaleString('en-US'), '单元');
console.log('实体体素        ', ship.grid.solid.toLocaleString('en-US'));
console.log('内部填充体素    ', hidden.toLocaleString('en-US'));
console.log('可见面片        ', meshed.stats.faces.toLocaleString('en-US'), '(实心', meshed.stats.solidFaces.toLocaleString('en-US'), '/ 自发光', meshed.stats.emissiveFaces.toLocaleString('en-US'), ')');
console.log('三角面          ', meshed.stats.triangles.toLocaleString('en-US'));
console.log('包围盒          ', `x[${b.minX},${b.maxX}] y[${b.minY},${b.maxY}] z[${b.minZ},${b.maxZ}]`, `尺寸 ${b.maxX - b.minX + 1}×${b.maxY - b.minY + 1}×${b.maxZ - b.minZ + 1}`);
console.log('雕塑耗时        ', tSculpt + ' ms');
console.log('网格化耗时      ', tMesh + ' ms');

// 顶点数据平移到中心（和运行时一致）
const shift = (mesh) => {
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    p[i] -= cx;
    p[i + 1] -= cy;
    p[i + 2] -= cz;
  }
  return mesh;
};

const meshes = [shift(meshed.solid), shift(meshed.emissive)];

const views = [
  { name: 'A-三四分之三视角', azimuth: 34, elevation: 20, fit: 1.05, debug: true },
  { name: 'B-正侧视', azimuth: 90, elevation: 4, fit: 1.05 },
  { name: 'C-俯视', azimuth: 90, elevation: 78, fit: 1.05 },
  { name: 'D-尾部视角', azimuth: 196, elevation: 12, fit: 1.05 },
];

const outDir = path.join(root, '_preview');
fs.mkdirSync(outDir, { recursive: true });

for (const v of views) {
  const t = Date.now();
  LOG(`渲染中 ${v.name} ...`);
  const img = renderView(meshes, {
    width: 1500,
    height: 1000,
    azimuth: v.azimuth,
    debug: v.debug,
    elevation: v.elevation,
    fit: v.fit,
  });
  const file = path.join(outDir, v.name + '.png');
  writePng(file, img.width, img.height, img.color);
  LOG(`渲染 ${v.name}  ${img.drawn.toLocaleString('en-US')} 面  ${Date.now() - t} ms  → ${path.basename(file)}`);
}

LOG('总耗时 ' + (Date.now() - t0) + ' ms');
