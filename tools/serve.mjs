// Serve docs/ on http://localhost:8080 (zero dependencies). The site also works opened straight from disk,
// but the Brick Breaker on-screen buttons need a real http origin.   npm run serve [-- --port=8080]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
const DOCS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const port = +((process.argv.find((a) => a.startsWith('--port=')) || '').slice(7) || process.env.PORT || 8080);
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json'};
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DOCS, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(DOCS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, {'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache'}); fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`AI Pong League: http://localhost:${port}/`));
