#!/usr/bin/env node
/**
 * 静态服务器，只用于跑 examples/ 下的 demo。
 *
 *   npm run demo              起服务并打开浏览器
 *   npm run demo:no-open      只起服务
 *   node scripts/serve.mjs --port 9100
 *
 * 之所以要服务器而不是直接双击 html：demo 用了 import map + ES module，
 * file:// 下浏览器会因为跨源策略拒绝加载模块。
 *
 * 关于 three 的来源：如果本仓库装了 node_modules/three，demo 会自动改用本地副本
 * （离线可用、版本与你的项目一致）；没装则回落到 unpkg CDN。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO = '/examples/basic/index.html';
const argv = process.argv.slice(2);

const portIdx = argv.indexOf('--port');
const PORT = portIdx >= 0 && Number.isFinite(Number(argv[portIdx + 1])) ? Number(argv[portIdx + 1]) : 9100;
const OPEN = !argv.includes('--no-open');

const CDN = 'https://unpkg.com/three@0.180.0';
const LOCAL = {
  'three': '/node_modules/three/build/three.module.js',
  'three/addons/': '/node_modules/three/examples/jsm/',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

async function hasLocalThree() {
  try {
    await fs.access(path.join(ROOT, 'node_modules/three/build/three.module.js'));
    return true;
  } catch {
    return false;
  }
}

/** 把 demo 的 import map 换成可用来源。 */
async function demoDocument() {
  let html = await fs.readFile(path.join(ROOT, DEMO), 'utf8');
  const local = await hasLocalThree();
  const map = local
    ? { 'three': LOCAL['three'], 'three/addons/': LOCAL['three/addons/'] }
    : { 'three': CDN + '/build/three.module.js', 'three/addons/': CDN + '/examples/jsm/' };
  html = html.replace(/(<script type="importmap">)[\s\S]*?(<\/script>)/,
    (_, open, close) => open + '\n' + JSON.stringify({ imports: map }, null, 2) + '\n' + close);
  return { html, local };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = DEMO;

    if (rel === DEMO) {
      const { html } = await demoDocument();
      const body = Buffer.from(html, 'utf8');
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-store' });
      res.end(body);
      return;
    }

    const file = path.join(ROOT, rel);
    if (!path.resolve(file).startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

function lan() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) return ni.address;
  }
  return null;
}

server.listen(PORT, '0.0.0.0', async () => {
  const local = await hasLocalThree();
  const url = `http://127.0.0.1:${PORT}/`;
  process.stdout.write(`[demo] ${url}\n`);
  process.stdout.write(`[demo] three 来源：${local ? '本地 node_modules/three' : 'unpkg CDN（未装依赖时）'}\n`);
  const addr = lan();
  if (addr) process.stdout.write(`[demo] 手机同 Wi-Fi：http://${addr}:${PORT}/\n`);
  process.stdout.write('[demo] Ctrl+C 停止\n');
  if (OPEN) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  }
});
