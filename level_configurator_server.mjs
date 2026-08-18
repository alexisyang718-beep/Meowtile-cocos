import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const levelsDir = join(root, 'assets/resources/config/levels');
const metaPath = join(root, 'assets/resources/config/meta/meta_chapters.json');
const feedbackPath = join(root, 'docs/level_feedback.json');
const port = Number(process.env.PORT || 8770);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function levelPath(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return join(levelsDir, `level-${String(n).padStart(3, '0')}.json`);
}

async function readFeedback() {
  if (!existsSync(feedbackPath)) return [];
  const content = await readFile(feedbackPath, 'utf8');
  return JSON.parse(content || '[]');
}

async function writeFeedback(items) {
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(feedbackPath, JSON.stringify(items, null, 2) + '\n', 'utf8');
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (url.pathname === '/api/health') {
    return send(res, 200, { ok: true, levelsDir });
  }
  if (url.pathname === '/api/meta') {
    const content = await readFile(metaPath, 'utf8');
    return send(res, 200, JSON.parse(content));
  }
  if (url.pathname === '/api/feedback') {
    if (req.method === 'GET') return send(res, 200, await readFeedback());
    if (req.method === 'POST') {
      const raw = await readBody(req);
      let item;
      try {
        item = JSON.parse(raw);
      } catch (_error) {
        return send(res, 400, { error: 'Invalid JSON' });
      }
      const list = await readFeedback();
      list.push({ ...item, savedAt: new Date().toISOString() });
      await writeFeedback(list);
      return send(res, 200, { ok: true, count: list.length, path: feedbackPath });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }
  const match = url.pathname.match(/^\/api\/level\/(\d+)$/);
  if (!match) return send(res, 404, { error: 'Unknown API' });
  const path = levelPath(match[1]);
  if (!path) return send(res, 400, { error: 'Invalid level id' });
  if (req.method === 'GET') {
    if (!existsSync(path)) return send(res, 404, { error: `Level file not found: ${match[1]}` });
    const content = await readFile(path, 'utf8');
    return send(res, 200, JSON.parse(content));
  }
  if (req.method === 'PUT') {
    const raw = await readBody(req);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      return send(res, 400, { error: 'Invalid JSON' });
    }
    await writeFile(path, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    return send(res, 200, { ok: true, path });
  }
  return send(res, 405, { error: 'Method not allowed' });
}

async function handleStatic(_req, res, url) {
  const rawPath = url.pathname === '/' ? '/level_configurator.html' : url.pathname;
  const safe = normalize(rawPath).replace(/^\.\.(\/|\\|$)/, '');
  const path = join(root, safe);
  if (!path.startsWith(root) || !existsSync(path)) {
    return send(res, 404, '<h1>404</h1>', 'text/html; charset=utf-8');
  }
  const data = await readFile(path);
  res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await handleStatic(req, res, url);
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: String(error?.message || error) });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`MeowTile level configurator: http://127.0.0.1:${port}/level_configurator.html`);
});
