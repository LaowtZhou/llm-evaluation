/**
 * browser-check.mjs —— 真浏览器冒烟验收
 *
 * 为什么不用 agent-browser / playwright：
 *   本机没有硬件 GPU，Chromium 走 SwiftShader 软件渲染，一帧要好几秒。
 *   CLI 类工具统一在「等待页面稳定」这一步超时，拿不到任何有效信息。
 *
 * 所以这里直接走 CDP（Chrome DevTools Protocol）：
 *   1. 起一个带 --remote-debugging-port 的无头 Chrome；
 *   2. 连上页面 target，开 Runtime / Log 域，把控制台报错和未捕获异常全收下来；
 *   3. 导航到目标 HTML，等固定真实时间（不做虚拟时间快进，fast-forward 会逼着
 *      软件渲染器画满几千帧，几个小时都跑不完）；
 *   4. 读页面状态（加载层是否消失、统计面板有没有填上数值）+ 抓一张截图；
 *   5. 关掉 Chrome。
 *
 * 用法：node tools/browser-check.mjs <html路径> [等待秒数]
 *
 * 退出码：
 *   0  页面启动成功，且没有捕获到 JS 异常
 *   1  页面报错 / 加载层一直没消失 / 截图失败
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  path.join(os.homedir(), '.agent-browser', 'browsers', 'chrome-152.0.7977.75', 'chrome.exe'),
  path.join(os.homedir(), '.agent-browser', 'browsers', 'chrome-152.0.7977.64', 'chrome.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, '自然选择号-体素全景.html');
const waitSec = Number(process.argv[3] || 75);
// 可选：锁定到某个机位（0-4），并关掉自动巡航，方便稳定地看一个角度
const lockShot = process.argv[4] !== undefined ? Number(process.argv[4]) : null;
const PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('找不到 Chrome / Edge 可执行文件，可用 CHROME_PATH 环境变量指定');
}

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('DevTools 端口一直没有响应');
}

async function main() {
  const chrome = findChrome();
  const htmlUrl = pathToFileURL(target).href;
  const userDir = path.join(os.tmpdir(), 'nsvox-browser-check-' + Date.now());

  console.log('浏览器   ' + chrome);
  console.log('目标     ' + target);
  console.log('等待     ' + waitSec + ' s');
  console.log('');

  const child = spawn(chrome, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--enable-unsafe-swiftshader',   // 允许软件 WebGL
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-first-run',
    '--disable-extensions',
    '--window-size=1280,720',
    '--user-data-dir=' + userDir,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let chromeErr = '';
  child.stderr.on('data', (d) => { chromeErr += d.toString(); });

  const errors = [];
  const warnings = [];
  const logs = [];

  try {
    await waitForDevtools();

    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (!page) throw new Error('没找到可用的页面 target');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error('WebSocket 连接失败'));
    });

    let msgId = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id !== undefined) {
        const p = pending.get(m.id);
        if (p) { pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
        return;
      }
      // ---- 事件 ----
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push('未捕获异常: ' + (d.exception?.description || d.text));
      } else if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
        if (m.params.type === 'error') errors.push('console.error: ' + text);
        else if (m.params.type === 'warning') warnings.push('console.warn: ' + text);
        else logs.push('console.' + m.params.type + ': ' + text);
      } else if (m.method === 'Log.entryAdded') {
        const e = m.params.entry;
        if (e.level === 'error') errors.push('页面错误: ' + e.text + (e.url ? ' @ ' + e.url : ''));
        else if (e.level === 'warning') warnings.push('页面警告: ' + e.text);
      }
    };

    const send = (method, params = {}) => new Promise((res, rej) => {
      const id = ++msgId;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, 60000);
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');

    console.log('导航中 …');
    await send('Page.navigate', { url: htmlUrl });

    // 等页面跑完加载流程，再决定是否锁定机位
    await sleep(12000);
    if (lockShot !== null && Number.isFinite(lockShot)) {
      console.log('锁定机位 ' + lockShot + ' …');
      await send('Runtime.evaluate', {
        expression: `(() => {
          const tour = document.getElementById('btn-tour');
          if (tour && tour.classList.contains('is-active')) tour.click();
          const b = document.querySelector('[data-shot="${lockShot}"]');
          if (b) b.click();
          return !!b;
        })()`,
        returnByValue: true,
      });
    }

    // 等真实时间：软件渲染下一帧要好幾秒，给足余量
    const elapsed = lockShot !== null ? 12 : 0;
    const probeAt = [elapsed + 8, elapsed + 20, Math.max(elapsed + 20, waitSec - 20)];
    let probeIdx = 0;
    for (let t = elapsed; t <= waitSec; t += 2) {
      await sleep(2000);
      if (probeIdx < probeAt.length && t + 2 >= probeAt[probeIdx]) {
        probeIdx++;
        const st = await query(send);
        console.log(`  [${t + 2}s] ${st.summary}`);
      }
    }

    const state = await query(send);
    console.log('');
    console.log('=== 页面状态 ===');
    console.log(state.detail);

    // 截图
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const outPng = path.join(root, '_shot_browser.png');
    fs.writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
    console.log('');
    console.log('截图     ' + outPng + '  (' + (fs.statSync(outPng).size / 1024).toFixed(1) + ' KB)');

    // 亮度分析：直接读 canvas 是不行的（preserveDrawingBuffer 默认关闭，
    // 合成之后绘图缓冲就被清空，rAF 之外 drawImage 拿到的一定是全黑）。
    // 所以拿合成后的截图喂回页面里做直方图，这才是真实的画面内容。
    let br = null;
    try {
      const r = await send('Runtime.evaluate', {
        expression: `(async () => {
          const img = new Image();
          img.src = 'data:image/png;base64,${shot.data}';
          await img.decode();
          const c = document.createElement('canvas');
          c.width = 240; c.height = 135;
          const g2 = c.getContext('2d');
          g2.drawImage(img, 0, 0, 240, 135);
          const d = g2.getImageData(0, 0, 240, 135).data;
          let lit = 0, sum = 0, peak = 0, bright = 0;
          for (let i = 0; i < d.length; i += 4) {
            const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
            sum += l;
            if (l > 24) lit++;
            if (l > 150) bright++;
            if (l > peak) peak = l;
          }
          const n = 240 * 135;
          return { lit, bright, total: n, mean: +(sum / n).toFixed(1), peak: Math.round(peak) };
        })()`,
        returnByValue: true,
        awaitPromise: true,
      });
      br = r.result.value;
    } catch (e) {
      br = { error: e.message };
    }
    console.log('画面亮度 ' + JSON.stringify(br));

    ws.close();

    console.log('');
    console.log('=== 控制台 ===');
    console.log('错误   ' + errors.length);
    for (const e of errors) console.log('   ✗ ' + e);
    console.log('警告   ' + warnings.length);
    for (const w of warnings.slice(0, 10)) console.log('   ! ' + w);
    if (logs.length) {
      console.log('日志   ' + logs.length);
      for (const l of logs.slice(0, 12)) console.log('   · ' + l);
    }

    const ok = errors.length === 0 && state.ready && state.raw.errorVisible === false;
    console.log('');
    console.log(ok ? '✅ 浏览器验收通过' : '❌ 浏览器验收未通过');
    process.exitCode = ok ? 0 : 1;
  } catch (err) {
    console.error('❌ 验收脚本出错：' + err.message);
    if (chromeErr) console.error(chromeErr.split('\n').slice(-12).join('\n'));
    process.exitCode = 1;
  } finally {
    try { child.kill(); } catch { /* ignore */ }
  }
}

async function query(send) {
  const expr = `(() => {
    const q = (id) => document.getElementById(id);
    const loading = q('loading');
    const err = q('error-card');
    const val = (id) => { const e = q(id); return e ? e.textContent.trim() : null; };
    const canvas = document.querySelector('canvas');
    const errVisible = err ? getComputedStyle(err).display !== 'none' : null;
    return {
      webgl2: !!canvas,
      canvas: canvas ? (canvas.width + 'x' + canvas.height) : null,
      loadingClass: loading ? loading.className : null,
      loadingPct: val('loading-pct'),
      errorHiddenAttr: err ? err.hidden : null,
      errorVisible: errVisible,
      voxels: val('stat-voxels'),
      faces: val('stat-faces'),
      tris: val('stat-tris'),
      buildMs: val('stat-build'),
      fps: val('m-fps'),
      shotName: val('shot-name'),
    };
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const v = r.result.value || {};
  const ready = !!(v.loadingClass && v.loadingClass.includes('is-gone') && v.voxels && v.voxels !== '—');
  const summary = `加载=${v.loadingPct} 体素=${v.voxels} 三角面=${v.tris} 错误卡片可见=${v.errorVisible} 帧率=${v.fps} 机位=${v.shotName}`;
  const detail = Object.entries(v).map(([k, val]) => `  ${k.padEnd(16)} ${val}`).join('\n');
  return { summary, detail, ready, raw: v };
}

main();
