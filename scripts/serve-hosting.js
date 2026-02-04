#!/usr/bin/env node
/**
 * Serves the hosting/ folder with SPA rewrites (same as firebase.json).
 * Use after: npm run build:all
 * Usage: node scripts/serve-hosting.js [port]
 * Default port: 3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const root = path.resolve(__dirname, '..');
const hostingDir = path.join(root, 'hosting');
const port = parseInt(process.argv[2] || '3000', 10);

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webmanifest': 'application/manifest+json',
};

function getRewriteDestination(pathname) {
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return '/app/index.html';
  }
  if (pathname === '/creators' || pathname.startsWith('/creators/')) {
    return '/creators/index.html';
  }
  if (pathname === '/landing' || pathname.startsWith('/landing/')) {
    return '/index.html';
  }
  return '/index.html';
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname);
  // Strip leading slash so path.join doesn't treat pathname as absolute
  const relativePath = pathname.replace(/^\//, '') || 'index.html';
  let filePath = path.join(hostingDir, relativePath);

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      serveFile(filePath, res);
      return;
    }

    if (!err && stat.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      fs.stat(indexPath, (err2) => {
        if (!err2) {
          serveFile(indexPath, res);
        } else {
          const dest = getRewriteDestination(pathname);
          const destRelative = dest.replace(/^\//, '');
          const destPath = path.join(hostingDir, destRelative);
          serveFile(destPath, res);
        }
      });
      return;
    }

    const dest = getRewriteDestination(pathname);
    const destRelative = dest.replace(/^\//, '');
    const destPath = path.join(hostingDir, destRelative);
    serveFile(destPath, res);
  });
});

if (!fs.existsSync(hostingDir)) {
  console.error('hosting/ not found. Run: npm run build:all');
  process.exit(1);
}

server.listen(port, () => {
  console.log(`Serving hosting/ at http://localhost:${port}`);
  console.log('  /, /landing, /landing/* → Landing');
  console.log('  /app, /app/* → PWA');
  console.log('  /creators, /creators/* → Creator dashboard');
});
