import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute, sep, extname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.ANATREA_PINS_PORT || 4178);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, pathname === '/' ? 'demo/index.html' : pathname.startsWith('/src/') ? `.${pathname}` : `demo${pathname}`);
    const fromRoot = relative(root, path);
    const allowed = ['demo', 'src'].some(dir => fromRoot.startsWith(`${dir}${sep}`));
    if (isAbsolute(fromRoot) || !allowed || !contentTypes[extname(path)]) {
      response.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': contentTypes[extname(path)] }).end(body);
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Anatrea Pins demo: http://127.0.0.1:${port}`);
});
