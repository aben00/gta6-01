// A tiny static server for game/ (Node 22, standard library only), so the
// entry can be played locally without a build step: `node serve.ts` serves
// game/ on http://localhost:8080. It sends the MIME types a browser game
// needs, refuses any path outside game/, and otherwise does nothing
// clever: this is a development convenience, not a web server for the
// internet.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));

/** The MIME type for a file, from its extension; unknown means bytes. */
function mimeFor(path: string): string {
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.wasm': 'application/wasm',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.txt': 'text/plain; charset=utf-8',
  };
  return types[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** The port from `--port N`, or 8080 when absent or invalid. */
function parsePort(argv: string[]): number {
  const at = argv.indexOf('--port');
  const wanted = at === -1 ? NaN : Number(argv[at + 1]);
  return Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;
}

/** Join a request path onto the root; null when it escapes game/. */
function safeJoin(pathname: string): string | null {
  const file = resolve(join(root, pathname));
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

const port = parsePort(process.argv.slice(2));

createServer(async (request, response) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = safeJoin(pathname);
  if (file === null) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeFor(file),
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
}).listen(port, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${port}`);
});
