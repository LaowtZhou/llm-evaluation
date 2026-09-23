/**
 * build.mjs —— 把源码打包成一个自带三件套的单文件 HTML
 *
 *   1. esbuild 把 src/main.js（含 three.js）打成 IIFE
 *   2. 把星云背景图转成 base64 data URI
 *   3. CSS 与 JS 内联进 src/template.html，输出到项目根目录
 *
 * 这样可以做到：双击 HTML 就能看，不需要本地服务器、不需要联网。
 *
 * 参数：
 *   node build.mjs           正式包，压缩，输出「自然选择号-体素全景.html」
 *   node build.mjs --debug   排查包，不压缩，输出「_debug.html」
 *
 * 为什么要有 --debug：正式包经过 esbuild 压缩后，变量会被改名（例如
 * lastShotChange → $t），一旦运行期抛错，堆栈里只剩单字母，几乎无法定位。
 * 排查包保留原始函数名、变量名和行号，控制台能直接印出可读堆栈。
 * 所以：正式包报错 → 先构建 --debug 复现 → 定位 → 回正式包验证。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const p = (...a) => path.join(root, ...a);

/** esbuild 装在托管 node 工作区里，ESM 不认 NODE_PATH，这里按候选路径依次尝试 */
async function loadEsbuild() {
  const candidates = [
    process.env.ESBUILD_PATH,
    'esbuild',
    'C:/Users/Alex/.workbuddy/binaries/node/workspace/node_modules/esbuild/lib/main.js',
  ].filter(Boolean);
  const errors = [];
  for (const c of candidates) {
    try {
      const spec = c === 'esbuild' || /^[a-z]+:/.test(c) ? c : pathToFileURL(c).href;
      const mod = await import(spec);
      return mod.build || mod.default?.build;
    } catch (err) {
      errors.push(c + ' → ' + err.code);
    }
  }
  throw new Error('找不到 esbuild，尝试过：\n  ' + errors.join('\n  '));
}

const OUT_NAME = '自然选择号-体素全景.html';
const OUT_NAME_DEBUG = '_debug.html';

async function main() {
  const t0 = Date.now();
  const debug = process.argv.includes('--debug');
  const build = await loadEsbuild();

  const result = await build({
    entryPoints: [p('src', 'main.js')],
    bundle: true,
    format: 'iife',
    target: ['chrome100', 'firefox100', 'safari15', 'edge100'],
    minify: !debug,
    write: false,
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'warning',
  });

  const js = result.outputFiles[0].text;
  const css = await fs.readFile(p('src', 'style.css'), 'utf8');
  const template = await fs.readFile(p('src', 'template.html'), 'utf8');
  const jpg = await fs.readFile(p('assets', 'space-panorama.jpg'));
  const dataUri = 'data:image/jpeg;base64,' + jpg.toString('base64');
  const panoramaScript =
    'window.__SPACE_PANORAMA__=' + JSON.stringify(dataUri) + ';';

  const html = template
    .replace('/*__CSS__*/', () => css)
    .replace('/*__PANORAMA__*/', () => panoramaScript)
    .replace('/*__JS__*/', () => js);

  const outName = debug ? OUT_NAME_DEBUG : OUT_NAME;
  const outPath = p(outName);
  await fs.writeFile(outPath, html, 'utf8');

  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log('✅ 构建完成：' + outName + (debug ? '（排查包 · 未压缩）' : ''));
  console.log('   JS 包   ' + kb(Buffer.byteLength(js)));
  console.log('   CSS     ' + kb(Buffer.byteLength(css)));
  console.log('   背景图  ' + kb(jpg.length));
  console.log('   总计    ' + kb(Buffer.byteLength(html)));
  console.log('   耗时    ' + (Date.now() - t0) + ' ms');
  if (debug) {
    console.log('   ⚠ 排查包仅供定位报错，发布请重新运行不带 --debug 的构建。');
  }
}

main().catch((err) => {
  console.error('❌ 构建失败：', err);
  process.exit(1);
});
