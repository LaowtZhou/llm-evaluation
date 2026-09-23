// quick test: run the sculptor headless to check voxel counts
import { buildNaturalSelection, GRID } from '../src/ship.js';
import { buildVoxelGeometry } from '../src/voxel.js';

// 模拟浏览器环境
globalThis.performance = globalThis.performance || { now: () => Date.now() };

const t0 = performance.now();
const ship = buildNaturalSelection({ log: (m) => console.log(m) });
const tSculpt = performance.now() - t0;

const t1 = performance.now();
const meshed = buildVoxelGeometry(ship.grid, ship.palette, { ao: true });
const tMesh = performance.now() - t1;

console.log('');
console.log('=== 汇总 ===');
console.log(`网格尺寸: ${GRID.sx}×${GRID.sy}×${GRID.sz} = ${GRID.sx*GRID.sy*GRID.sz.toLocaleString()} 单元`);
console.log(`实体体素: ${ship.grid.solid.toLocaleString()}`);
console.log(`内部填充: ${ship.grid.countHidden().toLocaleString()}`);
console.log(`可见面片: ${meshed.stats.faces.toLocaleString()}`);
console.log(`  实心面: ${meshed.stats.solidFaces.toLocaleString()}`);
console.log(`  发光面: ${meshed.stats.emissiveFaces.toLocaleString()}`);
console.log(`三角面: ${meshed.stats.triangles.toLocaleString()}`);
console.log(`造型范围: x[${ship.bounds.minX},${ship.bounds.maxX}] y[${ship.bounds.minY},${ship.bounds.maxY}] z[${ship.bounds.minZ},${ship.bounds.maxZ}]`);
console.log(`雕塑耗时: ${tSculpt.toFixed(0)} ms`);
console.log(`网格化耗时: ${tMesh.toFixed(0)} ms`);
console.log(`主喷口数: ${ship.nozzles.length}`);
console.log(`副喷口数: ${ship.auxNozzles.length}`);

// 校验：造型不能超出安全范围（沿三个轴都要留出至少 2 格余量）
const MIN_M = 2, MAX_M = -2;
const b = ship.bounds;
const safe = b.minX >= MIN_M && b.maxX <= GRID.sx + MAX_M &&
             b.minY >= MIN_M && b.maxY <= GRID.sy + MAX_M &&
             b.minZ >= MIN_M && b.maxZ <= GRID.sz + MAX_M;
if (safe) {
  console.log('✓ 造型三轴在安全范围内（margin >= 4）');
} else {
  const parts = [];
  if (b.minX < MIN_M) parts.push(`minX=${b.minX}`);
  if (b.maxX > GRID.sx + MAX_M) parts.push(`maxX=${b.maxX}`);
  if (b.minY < MIN_M) parts.push(`minY=${b.minY}`);
  if (b.maxY > GRID.sy + MAX_M) parts.push(`maxY=${b.maxY}`);
  if (b.minZ < MIN_M) parts.push(`minZ=${b.minZ}`);
  if (b.maxZ > GRID.sz + MAX_M) parts.push(`maxZ=${b.maxZ}`);
  console.log(`⚠ 造型越界: ${parts.join(', ')}`);
}

// 校验：实体体素数不能太少
if (ship.grid.solid < 500000) {
  console.log('⚠ 实体体素太少');
} else if (ship.grid.solid > 5000000) {
  console.log('⚠ 实体体素过多，可能超出渲染预算');
} else {
  console.log('✓ 实体体素数量在预期范围');
}
