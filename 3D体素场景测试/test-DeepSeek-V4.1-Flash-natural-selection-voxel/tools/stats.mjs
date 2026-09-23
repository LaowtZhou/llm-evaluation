import fs from 'node:fs';
import { buildNaturalSelection, GRID } from '../src/ship.js';
import { buildVoxelGeometry } from '../src/voxel.js';

const LOG = (s) => { console.log(s); try { fs.appendFileSync('_stats.log', s + '\n'); } catch {} };
try { fs.writeFileSync('_stats.log', ''); } catch {}

const mem = () => Math.round(process.memoryUsage().rss / 1048576) + ' MB';
const t0 = Date.now();
const ship = buildNaturalSelection({ log: LOG });
LOG('雕塑 RSS ' + mem());
const t1 = Date.now();
const meshed = buildVoxelGeometry(ship.grid, ship.palette, { ao: true });
LOG('网格化 ' + (Date.now() - t1) + ' ms  RSS ' + mem());
LOG('面片 ' + meshed.stats.faces.toLocaleString('en-US') + ' (实心 ' + meshed.stats.solidFaces.toLocaleString('en-US') + ' / 自发光 ' + meshed.stats.emissiveFaces.toLocaleString('en-US') + ')');
LOG('三角面 ' + meshed.stats.triangles.toLocaleString('en-US'));
LOG('顶点 ' + ((meshed.stats.faces) * 4).toLocaleString('en-US'));
const bytes = meshed.solid.positions.byteLength + meshed.solid.normals.byteLength + meshed.solid.colors.byteLength + meshed.solid.indices.byteLength
  + meshed.emissive.positions.byteLength + meshed.emissive.normals.byteLength + meshed.emissive.colors.byteLength + meshed.emissive.indices.byteLength;
LOG('几何显存 ' + (bytes / 1048576).toFixed(1) + ' MB');
LOG('体素 实体 ' + ship.grid.solid.toLocaleString('en-US') + ' / 内部 ' + ship.grid.countHidden().toLocaleString('en-US'));
LOG('总耗时 ' + (Date.now() - t0) + ' ms  RSS ' + mem());
