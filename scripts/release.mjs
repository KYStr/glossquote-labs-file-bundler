import { lstat, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { PUBLIC_FILES, CSP } from './assets.mjs';
import { ORIGIN, TOOL_SLUG, SOURCE_FILES, SERVE_SHA256, PINNED_CSP, RELEASE_HEADERS, PAGE_SEO, RELEASE_ONLY_BADGES } from './release-policy.mjs';
import { validateReleaseHTML } from './release-html.mjs';
import { verifyDeploymentConfig } from './deployment-config.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sorted=values=>[...values].sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const record=(path,bytes)=>({path,bytes:bytes.length,sha256:sha256(bytes)});
const safePath=path=>typeof path==='string'&&/^[A-Za-z0-9._/-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(part=>!part||part==='.'||part==='..');

async function tree(directory, allowed) {
  const base=await lstat(directory);
  if(base.isSymbolicLink()||!base.isDirectory())fail('RELEASE_UNSAFE_TREE');
  const found=new Map();
  async function visit(relative='') {
    for(const item of await readdir(join(directory,relative),{withFileTypes:true})) {
      const path=relative?`${relative}/${item.name}`:item.name;
      if(!safePath(path))fail('RELEASE_UNSAFE_PATH');
      const target=join(directory,path);const info=await lstat(target);
      if(info.isSymbolicLink())fail('RELEASE_UNSAFE_LINK');
      if(info.isDirectory()) {
        if(!allowed.some(file=>file.startsWith(`${path}/`)))fail('RELEASE_UNKNOWN_DIRECTORY');
        await visit(path);
      } else if(info.isFile()&&allowed.includes(path))found.set(path,await readFile(target));
      else fail('RELEASE_UNKNOWN_FILE');
    }
  }
  await visit();
  if(!same(sorted(found.keys()),sorted(allowed)))fail('RELEASE_MISSING_FILE');
  return found;
}
function transformHTML(source,path) {
  const begin=source.indexOf('<head>');const end=source.indexOf('</head>');
  const robots='<meta name="robots" content="noindex,nofollow,noarchive">';
  if(begin<0||end<begin||source.indexOf('<head>',begin+1)>=0)fail('RELEASE_PREVIEW_INVALID');
  const head=source.slice(begin,end);
  if(head.split(robots).length!==2)fail('RELEASE_PREVIEW_INVALID');
  const links=[`  <link rel="canonical" href="${ORIGIN}/${path}">`,`  <link rel="alternate" hreflang="zh-Hant" href="${ORIGIN}/index.html">`,`  <link rel="alternate" hreflang="en" href="${ORIGIN}/en/index.html">`,`  <link rel="alternate" hreflang="x-default" href="${ORIGIN}/index.html">`].join('\n')+'\n';
  const page=source.slice(0,begin)+head.replace(robots,'<meta name="robots" content="index,follow">')+links+source.slice(end);
  const badge=RELEASE_ONLY_BADGES[path];
  if(!badge||page.split(badge).length!==2)fail('RELEASE_PREVIEW_BADGE_INVALID');
  return page.replace(badge,'');
}
async function expectedArtifacts() {
  if(Number(process.versions.node.split('.')[0])!==24)fail('RELEASE_NODE_24_REQUIRED');
  const rootInfo=await lstat(ROOT);if(rootInfo.isSymbolicLink()||!rootInfo.isDirectory())fail('RELEASE_UNSAFE_TREE');
  await verifyDeploymentConfig(ROOT);
  const url=new URL(ORIGIN);
  if(url.protocol!=='https:'||url.hostname!=='file-bundles.glossquote.com'||url.origin!==ORIGIN||url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash||TOOL_SLUG!=='file-bundler')fail('RELEASE_POLICY_INVALID');
  if(!same(sorted(PUBLIC_FILES),SOURCE_FILES.map(file=>file.path))||CSP!==PINNED_CSP)fail('RELEASE_POLICY_CHANGED');
  const serve=join(ROOT,'scripts','serve.mjs');const serveInfo=await lstat(serve);
  if(serveInfo.isSymbolicLink()||!serveInfo.isFile()||sha256(await readFile(serve))!==SERVE_SHA256)fail('RELEASE_HEADER_SOURCE_CHANGED');
  const source=await tree(join(ROOT,'public'),SOURCE_FILES.map(file=>file.path));
  for(const pin of SOURCE_FILES) {
    const bytes=source.get(pin.path);
    if(bytes.length!==pin.bytes||sha256(bytes)!==pin.sha256)fail('RELEASE_SOURCE_CHANGED');
  }
  const site=new Map();
  for(const [path,bytes] of source) {
    if(Object.hasOwn(PAGE_SEO,path)) {
      const page=transformHTML(bytes.toString('utf8'),path);
      validateReleaseHTML(page,path,{origin:ORIGIN,pages:PAGE_SEO});
      site.set(path,Buffer.from(page,'utf8'));
    } else site.set(path,bytes);
  }
  site.set('robots.txt',Buffer.from(`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`));
  site.set('_headers',Buffer.from('/*\n'+Object.entries(RELEASE_HEADERS).map(([key,value])=>`  ${key}: ${value}\n`).join('')));
  site.set('_redirects',Buffer.from('/ /index.html 301\n/en /en/index.html 301\n/en/ /en/index.html 301\n','utf8'));
  site.set('sitemap.xml',Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${ORIGIN}/index.html</loc></url>\n  <url><loc>${ORIGIN}/en/index.html</loc></url>\n</urlset>\n`));
  const files=sorted(site.keys()).map(path=>record(path,site.get(path)));
  const sourceFiles=SOURCE_FILES.map(file=>record(`public/${file.path}`,source.get(file.path)));
  const manifest={schemaVersion:1,mode:'release-candidate',origin:ORIGIN,toolSlug:TOOL_SLUG,files,sourceFiles};
  const outputs=new Map([['manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')],...files.map(file=>[`site/${file.path}`,site.get(file.path)])]);
  return {outputs,manifest};
}
function validateManifest(manifest,expected) {
  if(!manifest||!same(Object.keys(manifest).sort(),['schemaVersion','mode','origin','toolSlug','files','sourceFiles'].sort())||manifest.schemaVersion!==1||manifest.mode!=='release-candidate'||manifest.origin!==ORIGIN||manifest.toolSlug!==TOOL_SLUG)fail('RELEASE_MANIFEST_INVALID');
  for(const key of ['files','sourceFiles']) {
    if(!Array.isArray(manifest[key]))fail('RELEASE_MANIFEST_INVALID');
    const paths=[];
    for(const item of manifest[key]) {
      if(!item||!same(Object.keys(item).sort(),['bytes','path','sha256'])||!safePath(item.path)||!Number.isSafeInteger(item.bytes)||item.bytes<0||typeof item.sha256!=='string'||item.sha256.length!==64||!/^[0-9a-f]+$/.test(item.sha256))fail('RELEASE_MANIFEST_INVALID');
      paths.push(item.path);
    }
    if(new Set(paths).size!==paths.length||!same(paths,sorted(paths))||!same(manifest[key],expected[key]))fail('RELEASE_MANIFEST_MISMATCH');
  }
}
async function verifyArtifacts(expected) {
  const actual=await tree(join(ROOT,'release-artifacts'),[...expected.outputs.keys()]);
  let manifest;
  try {manifest=JSON.parse(actual.get('manifest.json').toString('utf8'));}catch{fail('RELEASE_MANIFEST_INVALID');}
  validateManifest(manifest,expected.manifest);
  for(const [path,bytes] of expected.outputs)if(!actual.get(path).equals(bytes))fail('RELEASE_OUTPUT_CHANGED');
  // Parse complete documents in addition to exact-byte reconstruction.
  for(const path of Object.keys(PAGE_SEO))validateReleaseHTML(actual.get(`site/${path}`).toString('utf8'),path,{origin:ORIGIN,pages:PAGE_SEO});
  return expected.manifest;
}
export async function release(mode) {
  if(!['build','check'].includes(mode))fail('RELEASE_USAGE');
  const expected=await expectedArtifacts();
  let exists=true;
  try {await lstat(join(ROOT,'release-artifacts'));}catch(error){if(error.code==='ENOENT')exists=false;else throw error;}
  if(exists) {await verifyArtifacts(expected);return {mode,status:'PASS',written:false,files:expected.manifest.files.length};}
  if(mode==='check')fail('RELEASE_MISSING_OUTPUT');
  // Exclusive creation only after every input and the output absence pass preflight.
  // An existing (even empty) unmanaged tree is never adopted, erased or repaired.
  const output=join(ROOT,'release-artifacts');
  await mkdir(output);
  const directories=new Set(['site']);
  for(const path of expected.outputs.keys()) {
    const parts=path.split('/');parts.pop();
    while(parts.length){directories.add(parts.join('/'));parts.pop();}
  }
  for(const path of [...directories].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b)))await mkdir(join(output,path));
  for(const [path,bytes] of expected.outputs)if(path!=='manifest.json')await writeFile(join(output,path),bytes,{flag:'wx'});
  await writeFile(join(output,'manifest.json'),expected.outputs.get('manifest.json'),{flag:'wx'});
  await verifyArtifacts(expected);
  return {mode,status:'PASS',written:true,files:expected.manifest.files.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2);if(args.length!==1||!['build','check'].includes(args[0]))fail('RELEASE_USAGE');
    const result=await release(args[0]);
    process.stdout.write(`RELEASE ${result.mode.toUpperCase()} PASS: ${result.files} site files; ${result.written?'created':'verified without writes'}; candidate only, not deployed.\n`);
  } catch(error) {
    const code=typeof error.code==='string'&&error.code.startsWith('RELEASE_')?error.code:'RELEASE_IO_FAILED';
    process.stderr.write(`${code}\n`);process.exitCode=1;
  }
}
