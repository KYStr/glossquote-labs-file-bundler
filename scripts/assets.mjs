import { lstat, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_FILES = Object.freeze([
  'index.html', 'en/index.html', 'css/app.css', 'js/app.js', 'js/ui.js',
  'js/bundle-worker.js', 'js/core/validation.js', 'js/core/planner.js',
  'js/core/zip-store.js', 'js/core/index-schema.js', 'js/state.js'
]);
export const ROUTES = new Map(PUBLIC_FILES.map(path => [`/${path}`, path]));
ROUTES.set('/', 'index.html');
ROUTES.set('/en/', 'en/index.html');
export const MIME = Object.freeze({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' });
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'none'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

export async function inspectTree(base, required = true) {
  try {
    if (!(await lstat(base)).isDirectory() || (await lstat(base)).isSymbolicLink()) throw new Error('UNSAFE_TREE');
  } catch (error) {
    if (error.code === 'ENOENT' && !required) return [];
    throw error;
  }
  const found = [];
  async function walk(relative = '') {
    for (const entry of await readdir(join(base, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      const info = await lstat(join(base, path));
      if (info.isSymbolicLink()) throw new Error('UNSAFE_LINK');
      if (info.isDirectory()) {
        if (!PUBLIC_FILES.some(item => item.startsWith(`${path}/`))) throw new Error('UNKNOWN_DIRECTORY');
        await walk(path);
      } else if (info.isFile() && PUBLIC_FILES.includes(path)) found.push(path);
      else throw new Error('UNKNOWN_ASSET');
    }
  }
  await walk();
  return found.sort();
}
