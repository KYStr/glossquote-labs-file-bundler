import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, ROUTES, MIME, CSP, inspectTree } from './assets.mjs';

export function routeRequest(method, rawUrl, host) {
  if (host !== '127.0.0.1:4227' && host !== 'localhost:4227') return { status: 421 };
  if (method !== 'GET' && method !== 'HEAD') return { status: 405 };
  if (typeof rawUrl !== 'string' || rawUrl.includes('?') || rawUrl.includes('#') || rawUrl.includes('%') || rawUrl.includes('\\')) return { status: 404 };
  const file = ROUTES.get(rawUrl);
  return file ? { status: 200, file, contentType: MIME[extname(file)] } : { status: 404 };
}
export async function handler(request, response) {
  const route = routeRequest(request.method, request.url, request.headers.host);
  const headers = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cross-Origin-Resource-Policy': 'same-origin' };
  if (route.status !== 200) {
    response.writeHead(route.status, { ...headers, ...(route.status === 405 ? { Allow: 'GET, HEAD' } : {}) });
    response.end();
    return;
  }
  try {
    await inspectTree(join(ROOT, 'public'));
    const bytes = await readFile(join(ROOT, 'public', route.file));
    response.writeHead(200, { ...headers, 'Content-Type': route.contentType, 'Content-Length': bytes.length });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(500, headers);
    response.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer(handler);
  server.on('error', () => { process.stderr.write('SERVER_START_FAILED: port must remain reserved; no process was stopped.\n'); process.exitCode = 1; });
  server.listen(4227, '127.0.0.1', () => process.stdout.write('Preview: http://127.0.0.1:4227 (no browser opened)\n'));
}
