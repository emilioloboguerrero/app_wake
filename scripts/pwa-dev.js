#!/usr/bin/env node
/**
 * PWA dev mode: runs Expo web dev server and a second server that serves the
 * production-style PWA shell at /app with the bundle loaded from Expo, so you get
 * standalone + live reload in the Simulator.
 *
 * Usage: npm run pwa:dev (from repo root)
 *
 * - Starts Expo (expo start --web) on EXPO_PORT.
 * - Waits for Expo to be ready, then fetches the dev bundle script URL.
 * - Serves apps/pwa/web/index.html at /app (and /app/*) with that script
 *   injected and paths rewritten for /app (manifest, icons, assets).
 * - Serves manifest, app/assets/*, app/install-guide/*, and app/data/* from filesystem.
 * - Proxies all other requests (e.g. /_expo/* for require()'d assets) to Expo.
 * - Proxies WebSocket upgrade requests to Expo so HMR works when the page is
 *   served from this server (document origin 5000, HMR client connects to 5000).
 *
 * Open http://localhost:PWA_PORT/app in the Simulator, add to home screen, then
 * open from the icon for standalone. Edits trigger live reload.
 */

const http = require('http');
const httpProxy = require('http-proxy');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { dirPwaRoot, dirPwaWeb, dirPwaPublic, basePathPwa } = require('./paths.js');

const EXPO_PORT = parseInt(process.env.EXPO_PORT || '8081', 10);
const PWA_PORT = parseInt(process.env.PWA_DEV_PORT || '5000', 10);

let expoProcess = null;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function waitForExpo() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 60000;
    function tryOnce() {
      http.get(`http://localhost:${EXPO_PORT}/`, (res) => {
        if (res.statusCode === 200) return resolve();
        if (Date.now() > deadline) return reject(new Error('Timeout waiting for Expo'));
        setTimeout(tryOnce, 1500);
      }).on('error', () => {
        if (Date.now() > deadline) return reject(new Error('Timeout waiting for Expo'));
        setTimeout(tryOnce, 1500);
      });
    }
    tryOnce();
  });
}

function getBundleScriptUrl() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${EXPO_PORT}/`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        const m = body.match(/<script\s+src="([^"]+)"/);
        if (!m) return reject(new Error('Could not find bundle script in Expo HTML'));
        const scriptPath = m[1];
        const full = scriptPath.startsWith('http') ? scriptPath : `http://localhost:${EXPO_PORT}${scriptPath.startsWith('/') ? '' : '/'}${scriptPath}`;
        resolve(full);
      });
    }).on('error', reject);
  });
}

function buildPwaHtml(scriptUrl) {
  const templatePath = path.join(dirPwaWeb, 'index.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  const base = basePathPwa || '';
  html = html.replace(
    /  <!-- EXPO_BUNDLE_SCRIPT: replaced by build script with actual bundle script tag -->/,
    `  <script src="${scriptUrl}"></script>`
  );
  html = html.replace(/\s(href|src)="\/manifest\.json"/g, ` $1="${base}/manifest.json"`);
  html = html.replace(/\s(href|src)="\/(app_icon\.png)"/g, ` $1="${base}/$2"`);
  html = html.replace(/\ssrc="\/(assets\/[^"]*)"/g, ` src="${base}/$1"`);
  html = html.replace(/fetch\s*\(\s*['"]\/sw\.js['"]/g, `fetch('${base}/sw.js'`);
  html = html.replace(/navigator\.serviceWorker\.register\s*\(\s*['"]\/sw\.js['"]/g, `navigator.serviceWorker.register('${base}/sw.js'`);
  html = html.replace(/__LOGIN_PATH__/g, base + '/login');
  const expoOrigin = `http://localhost:${EXPO_PORT}`;
  if (html.includes('Content-Security-Policy')) {
    html = html.replace(
      /(script-src\s+)([^;]+)(;)/,
      (_, pre, list, post) => `${pre}${list} ${expoOrigin}${post}`
    );
  }
  return html;
}

function getManifestForApp() {
  const manifestPath = path.join(dirPwaPublic, 'manifest.json');
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const base = basePathPwa || '';
  raw.start_url = base ? `${base}/` : '/';
  raw.scope = base ? `${base}/` : '/';
  if (raw.icons && Array.isArray(raw.icons)) {
    raw.icons = raw.icons.map((icon) => ({
      ...icon,
      src: icon.src.startsWith('/') ? `${base}${icon.src}` : icon.src,
    }));
  }
  return JSON.stringify(raw);
}

function proxyToExpo(requestPath, res, expoPort) {
  const target = `http://localhost:${expoPort}${requestPath}`;
  http.get(target, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  }).on('error', (err) => {
    log(`Proxy error: ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  });
}

function serveFile(filePath, contentType, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function startPwaServer(pwaHtml, manifestJson, expoPort) {
  const mime = {
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.html': 'text/html',
  };

  const mimeAssets = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4' };

  const wsProxy = httpProxy.createProxyServer({
    target: { host: 'localhost', port: expoPort },
  });
  wsProxy.on('error', (err) => log('WebSocket proxy error: ' + err.message));

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    const pathname = url.split('?')[0];
    const base = basePathPwa || '';

    if (pathname === base || pathname.startsWith(base + '/')) {
      const sub = pathname.slice(base.length) || '/';
      if (sub === '/manifest.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(manifestJson);
        return;
      }
      if (sub === '/app_icon.png' || sub === '/sw.js') {
        const filePath = path.join(dirPwaPublic, sub.slice(1));
        const ext = path.extname(filePath);
        serveFile(filePath, mime[ext] || 'application/octet-stream', res);
        return;
      }
      if (sub.startsWith('/assets/')) {
        const rel = sub.slice('/assets/'.length).replace(/\.\./g, '');
        const assetPath = path.resolve(path.join(dirPwaRoot, 'assets', rel));
        const assetsDir = path.resolve(path.join(dirPwaRoot, 'assets'));
        if (!assetPath.startsWith(assetsDir)) {
          res.writeHead(404);
          res.end();
          return;
        }
        const ext = path.extname(assetPath);
        serveFile(assetPath, mimeAssets[ext] || 'application/octet-stream', res);
        return;
      }
      if (sub.startsWith('/install-guide/')) {
        const rel = sub.slice('/install-guide/'.length).replace(/\.\./g, '');
        const filePath = path.resolve(path.join(dirPwaPublic, 'install-guide', rel));
        const installGuideDir = path.resolve(path.join(dirPwaPublic, 'install-guide'));
        if (!filePath.startsWith(installGuideDir)) {
          res.writeHead(404);
          res.end();
          return;
        }
        const ext = path.extname(filePath);
        serveFile(filePath, mimeAssets[ext] || mime[ext] || 'application/octet-stream', res);
        return;
      }
      if (sub.startsWith('/data/')) {
        const filePath = path.join(dirPwaPublic, sub);
        const ext = path.extname(filePath);
        serveFile(filePath, mime[ext] || 'application/octet-stream', res);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(pwaHtml);
      return;
    }

    proxyToExpo(url, res, expoPort);
  });

  server.on('upgrade', (req, socket, head) => {
    wsProxy.ws(req, socket, head, { target: `http://localhost:${expoPort}` });
  });

  function tryListen(port) {
    server.removeAllListeners('error');
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const next = port + 1;
        if (next <= PWA_PORT + 2) {
          log('Port ' + port + ' in use, trying ' + next + '...');
          tryListen(next);
        } else {
          log('Ports ' + PWA_PORT + '-' + (PWA_PORT + 2) + ' in use. Set PWA_DEV_PORT to a free port.');
          process.exit(1);
        }
      } else {
        log('Server error: ' + err.message);
        process.exit(1);
      }
    });
    server.listen(port, () => {
      log(`PWA server at http://localhost:${port}${basePathPwa || ''}`);
      console.log('');
      console.log('  Open in Simulator: http://localhost:' + port + (basePathPwa || ''));
      console.log('  Then: Share → Add to Home Screen → open from icon for standalone + live reload.');
      console.log('');
    });
  }

  tryListen(PWA_PORT);
  return server;
}

function main() {
  log('Starting Expo (expo start --web)...');
  expoProcess = spawn('npx', ['expo', 'start', '--web', '--port', String(EXPO_PORT)], {
    cwd: dirPwaRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  expoProcess.stdout.on('data', (d) => process.stdout.write(d));
  expoProcess.stderr.on('data', (d) => process.stderr.write(d));
  expoProcess.on('error', (err) => {
    log('Expo spawn error: ' + err.message);
    process.exit(1);
  });
  expoProcess.on('exit', (code) => {
    if (code != null && code !== 0) log('Expo exited with code ' + code);
  });

  process.on('SIGINT', () => {
    log('Shutting down...');
    if (expoProcess) expoProcess.kill();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    if (expoProcess) expoProcess.kill();
    process.exit(0);
  });

  log('Waiting for Expo at http://localhost:' + EXPO_PORT + '...');
  waitForExpo()
    .then(() => {
      log('Expo ready. Fetching bundle script URL...');
      return getBundleScriptUrl();
    })
    .then((scriptUrl) => {
      log('Bundle URL: ' + scriptUrl);
      const pwaHtml = buildPwaHtml(scriptUrl);
      const manifestJson = getManifestForApp();
      startPwaServer(pwaHtml, manifestJson, EXPO_PORT);
    })
    .catch((err) => {
      log('Error: ' + err.message);
      if (expoProcess) expoProcess.kill();
      process.exit(1);
    });
}

main();
