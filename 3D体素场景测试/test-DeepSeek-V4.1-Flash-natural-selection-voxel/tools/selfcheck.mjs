/**
 * selfcheck.mjs —— 造型回归自检
 *
 * 为什么需要它：
 * 曾经因为「写入浮点坐标」导致 `(x*sy+y)*sz+z` 算出一个看似合法的下标，
 * 让上千根方块长到网格的另一头去（Y 偏移 +124、Z 偏移 +224），
 * 在画面上表现为贯穿整个场景的细柱。肉眼在离线预览里才看得出来，
 * 而浏览器验证又慢又不可靠，所以这里做一道程序化关卡。
 *
 * 判定标准：
 *   1. 实体区必须收在纵向安全范围（舰体只占网格中段）；
 *   2. 网格上下端带（y<6 / y>sy-6）里不允许有体素；
 *   3. solid 计数器必须与实际非零格数一致（fillBox 覆写时的记账 bug 会露出来）。
 *
 * 退出码非 0 表示回归，可以被 重新构建.bat / CI 直接当成质量门。
 */

import { buildNaturalSelection, GRID } from '../src/ship.js';

const LOW_LIMIT = 6;
const HIGH_FROM = GRID.sy - 6;

const log = [];
const ship = buildNaturalSelection({ log: (s) => log.push(s) });
const g = ship.grid;
const { sx, sy, sz, data } = g;

let nonzero = 0;
let outOfBand = 0;
const samples = [];
for (let x = 0; x < sx; x++) {
  for (let y = 0; y < sy; y++) {
    let i = (x * sy + y) * sz;
    for (let z = 0; z < sz; z++, i++) {
      if (data[i] === 0) continue;
      nonzero++;
      if (y < LOW_LIMIT || y >= HIGH_FROM) {
        outOfBand++;
        if (samples.length < 12) samples.push(`(${x},${y},${z})=m${data[i]}`);
        else if (samples.length === 12) samples.push('…');
      }
    }
  }
}

const b = ship.bounds;
const fails = [];

if (outOfBand > 0) {
  fails.push(`纵向带 v 外出现 ${outOfBand} 个体素（y<${LOW_LIMIT} 或 y>=${HIGH_FROM}）：${samples.join(' ')}`);
}
if (b.minY < LOW_LIMIT) fails.push(`包围盒 minY=${b.minY} 低于安全线 ${LOW_LIMIT}`);
if (b.maxY >= HIGH_FROM) fails.push(`包围盒 maxY=${b.maxY} 高于安全线 ${HIGH_FROM - 1}`);
if (g.solid !== nonzero) {
  fails.push(`solid 计数 ${g.solid} ≠ 实际非零格数 ${nonzero}（相差 ${g.solid - nonzero}），fillBox 记账有误`);
}

console.log('=== 自然选择号 · 造型自检 ===');
console.log(`网格          ${sx} × ${sy} × ${sz}`);
console.log(`实体体素      ${nonzero.toLocaleString('en-US')}（计数器 ${g.solid.toLocaleString('en-US')}）`);
console.log(`包围盒        x[${b.minX},${b.maxX}] y[${b.minY},${b.maxY}] z[${b.minZ},${b.maxZ}]`);
console.log(`网格端带体素  ${outOfBand}`);
console.log('');

if (fails.length) {
  console.log('❌ 自检未通过：');
  for (const f of fails) console.log('   · ' + f);
  process.exit(1);
}
console.log('✅ 自检通过：造型收在网格中段，没有越界生长，计数一致。');
