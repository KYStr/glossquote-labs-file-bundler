import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, PUBLIC_FILES, inspectTree, CSP } from './assets.mjs';
import { verifyDeploymentConfig } from './deployment-config.mjs';

if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('NODE_24_REQUIRED');
await verifyDeploymentConfig(ROOT);
const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
if (!pkg.private || pkg.type !== 'module' || pkg.dependencies || pkg.devDependencies) throw new Error('PACKAGE_CONTRACT');
const found = await inspectTree(join(ROOT, 'public'));
if (JSON.stringify(found) !== JSON.stringify([...PUBLIC_FILES].sort())) throw new Error('ASSET_CONTRACT');
for (const path of found) {
  const source = await readFile(join(ROOT, 'public', path), 'utf8');
  if (/\b(?:localStorage|sessionStorage|indexedDB|caches|serviceWorker|fetch|XMLHttpRequest|WebSocket|EventSource)\b|\bconsole\s*\.|\b(?:eval|Function)\s*\(|innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(source)) throw new Error(`DISALLOWED_API: ${path}`);
  if (path.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', join(ROOT, 'public', path)], { shell: false, windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`SYNTAX: ${path}`);
    if (/https?:|import\s*\(/.test(source)) throw new Error(`REMOTE_OR_DYNAMIC_CODE: ${path}`);
    for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      const target = match[1];
      const resolved = posix.normalize(posix.join(posix.dirname(path), target));
      if (!target.startsWith('./') || !PUBLIC_FILES.includes(resolved)) throw new Error(`IMPORT_GRAPH: ${path}`);
    }
    if (path === 'js/app.js' && !source.includes("new Worker(new URL('./bundle-worker.js', import.meta.url), { type: 'module'")) throw new Error('WORKER_GRAPH');
  }
  if (path.endsWith('.html')) {
    if (!source.includes('content="noindex,nofollow,noarchive"') || !source.includes(`content="${CSP}"`)) throw new Error('PREVIEW_POLICY');
    if (/<link[^>]+rel="canonical"|<base|<iframe|\son\w+=|<script(?![^>]+src=)/i.test(source)) throw new Error('HTML_POLICY');
    for (const match of source.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const value = match[1];
      if (value.startsWith('#')) continue;
      if (['https://glossquote.com/index.html','https://glossquote.com/en/index.html'].includes(value)) continue;
      if (!value.startsWith('/') || !PUBLIC_FILES.includes(value.slice(1))) throw new Error(`UNREVIEWED_REFERENCE: ${path}`);
    }
    if (!/<title>[^<]+<\/title>/.test(source) || !/<h1>[^<]+<\/h1>/.test(source) || !/<meta name="description" content="[^"]+">/.test(source)) throw new Error('SEO_CONTENT');
  }
  if (path.endsWith('.css') && /@import|url\s*\(/i.test(source)) throw new Error('REMOTE_STYLE');
}
process.stdout.write(`CHECK PASS: Node 24, ${found.length} assets, syntax and preview invariants. Static checks are not browser security evidence.\n`);
