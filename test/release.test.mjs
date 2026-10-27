import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, copyFile, mkdir, mkdtemp, readFile, writeFile, readdir, lstat, realpath, rm, unlink, rename, symlink } from 'node:fs/promises';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT } from '../scripts/assets.mjs';
import { validateReleaseHTML } from '../scripts/release-html.mjs';
import { PAGE_SEO } from '../scripts/release-policy.mjs';

const intendedOrigin='https://file-bundles.glossquote.com';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scratch=join(ROOT,'evidence','m2a-entry-redirects','test-work');
async function sandbox(action) {
  await mkdir(scratch,{recursive:true});
  assert.ok(!(await lstat(scratch)).isSymbolicLink());
  const root=await mkdtemp(join(scratch,'release-'));
  await mkdir(join(root,'scripts'));
  for(const file of ['assets.mjs','serve.mjs','release.mjs','release-policy.mjs','release-html.mjs','deployment-config.mjs'])await copyFile(join(ROOT,'scripts',file),join(root,'scripts',file));
  await copyFile(join(ROOT,'package.json'),join(root,'package.json'));
  await copyFile(join(ROOT,'wrangler.jsonc'),join(root,'wrangler.jsonc'));
  await cp(join(ROOT,'public'),join(root,'public'),{recursive:true,errorOnExist:true,force:false});
  let passed=false;
  try {await action(root);passed=true;}
  finally {
    if(passed) {
      const target=await realpath(root);const base=await realpath(scratch);const within=relative(base,target);
      assert.ok(within&&!within.startsWith(`..${sep}`)&&within!=='..'&&!within.includes(':')&&!(await lstat(root)).isSymbolicLink());
      // Task-owned scratch copy only; checked absolute target, no shell deletion.
      await rm(target,{recursive:true});
    }
  }
}
function cli(root,...args) {
  const result=spawnSync(process.execPath,[join(root,'scripts','release.mjs'),...args],{cwd:root,shell:false,windowsHide:true,encoding:'utf8',timeout:10000});
  assert.equal(result.signal,null);assert.equal(result.error,undefined);
  return result;
}
function pass(root,mode) {const r=cli(root,mode);assert.equal(r.status,0,r.stderr);return r;}
function rejected(root,mode,pattern=/RELEASE_/) {const r=cli(root,mode);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,pattern);return r;}
async function snapshot(root) {
  const result=[];
  async function visit(path) {
    let info;try{info=await lstat(join(root,path));}catch(error){if(error.code==='ENOENT')return;throw error;}
    if(info.isSymbolicLink()){result.push({path,kind:'link'});return;}
    if(info.isDirectory()){result.push({path,kind:'directory'});for(const name of (await readdir(join(root,path))).sort())await visit(path?`${path}/${name}`:name);}
    else {const bytes=await readFile(join(root,path));result.push({path,bytes:bytes.length,sha256:sha(bytes),mtime:info.mtimeMs});}
  }
  await visit('');return result;
}
async function manifest(root) {return JSON.parse(await readFile(join(root,'release-artifacts','manifest.json'),'utf8'));}
async function rewriteManifest(root,value) {await writeFile(join(root,'release-artifacts','manifest.json'),JSON.stringify(value,null,2)+'\n');}
async function tamperFile(root,path,edit,both=false) {
  const target=join(root,'release-artifacts','site',path);
  const bytes=Buffer.from(edit(await readFile(target,'utf8')));
  await writeFile(target,bytes);
  if(both){const value=await manifest(root);const entry=value.files.find(file=>file.path===path);entry.bytes=bytes.length;entry.sha256=sha(bytes);await rewriteManifest(root,value);}
}
async function assertRefusesWithoutWrites(root) {
  const before=await snapshot(join(root,'release-artifacts'));
  rejected(root,'check');assert.deepEqual(await snapshot(join(root,'release-artifacts')),before);
  rejected(root,'build');assert.deepEqual(await snapshot(join(root,'release-artifacts')),before);
}

test('release: exact bilingual SEO, intended origin, preview/body/runtime bytes unchanged', async () => sandbox(async root=>{
  const inputBefore=await snapshot(join(root,'public'));
  pass(root,'build');pass(root,'check');
  assert.deepEqual(await snapshot(join(root,'public')),inputBefore);
  const expected={
    'index.html':{lang:'zh-Hant',title:'附件大小分包｜免費本機 ZIP 分包工具',h1:'依附件大小分包'},
    'en/index.html':{lang:'en',title:'Attachment Size Bundler — Free Local ZIP Splitter',h1:'Bundle files by attachment size'}
  };
  for(const [path,seo]of Object.entries(expected)) {
    const preview=await readFile(join(root,'public',path),'utf8');
    const output=await readFile(join(root,'release-artifacts','site',path),'utf8');
    assert.ok(preview.includes('<meta name="robots" content="noindex,nofollow,noarchive">'));
    assert.equal(preview.includes('rel="canonical"'),false);
    const badge=path==='index.html'?'<span class="candidate">本機候選版；尚未部署</span>':'<span class="candidate">Local candidate; not deployed</span>';
    assert.equal(preview.split(badge).length,2);
    assert.equal(output.slice(output.indexOf('</head>')),preview.slice(preview.indexOf('</head>')).replace(badge,''));
    assert.equal(output.slice(0,output.indexOf('<head>')),preview.slice(0,preview.indexOf('<head>')));
    assert.ok(output.includes(`<html lang="${seo.lang}">`));assert.ok(output.includes(`<title>${seo.title}</title>`));assert.ok(output.includes(`<h1>${seo.h1}</h1>`));
    assert.equal((output.match(/rel="canonical"/g)||[]).length,1);assert.ok(output.includes(`<link rel="canonical" href="${intendedOrigin}/${path}">`));
    assert.equal((output.match(/rel="alternate"/g)||[]).length,3);
    for(const [lang,target]of [['zh-Hant','index.html'],['en','en/index.html'],['x-default','index.html']])assert.ok(output.includes(`<link rel="alternate" hreflang="${lang}" href="${intendedOrigin}/${target}">`));
    assert.ok(output.includes('<meta name="robots" content="index,follow">'));
    assert.equal(output.includes(badge),false);
  }
  const value=await manifest(root);
  assert.deepEqual(Object.keys(value),['schemaVersion','mode','origin','toolSlug','files','sourceFiles']);
  assert.equal(value.schemaVersion,1);assert.equal(value.mode,'release-candidate');assert.equal(value.origin,intendedOrigin);assert.equal(value.toolSlug,'file-bundler');
  assert.equal(value.files.length,15);assert.equal(value.sourceFiles.length,11);
  assert.deepEqual(value.files.map(file=>file.path),value.files.map(file=>file.path).sort());
  assert.equal(new Set(value.files.map(file=>file.path)).size,15);
  for(const entry of value.files) {
    const bytes=await readFile(join(root,'release-artifacts','site',entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);
    if(!entry.path.endsWith('.html')&&!['_headers','_redirects','robots.txt','sitemap.xml'].includes(entry.path))assert.deepEqual(bytes,await readFile(join(root,'public',entry.path)));
  }
  for(const entry of value.sourceFiles){const bytes=await readFile(join(root,entry.path));assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);}
}));
test('release: robots, two-URL sitemap and unchanged serve security headers except robots', async () => sandbox(async root=>{
  pass(root,'build');
  assert.equal(await readFile(join(root,'release-artifacts/site/robots.txt'),'utf8'),'User-agent: *\nAllow: /\nSitemap: https://file-bundles.glossquote.com/sitemap.xml\n');
  const sitemap=await readFile(join(root,'release-artifacts/site/sitemap.xml'),'utf8');
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]),['https://file-bundles.glossquote.com/index.html','https://file-bundles.glossquote.com/en/index.html']);
  assert.equal(sitemap.includes('lastmod'),false);
  const headers=await readFile(join(root,'release-artifacts/site/_headers'),'utf8');
  assert.equal(headers,"/*\n  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'none'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Cache-Control: no-store\n  X-Robots-Tag: index, follow\n  Cross-Origin-Resource-Policy: same-origin\n");
  assert.equal((await snapshot(join(root,'release-artifacts/site'))).some(file=>file.path==='manifest.json'),false);
}));
test('release: deterministic across fresh copies and rebuild performs no writes', async () => sandbox(async first=>sandbox(async second=>{
  pass(first,'build');const before=await snapshot(join(first,'release-artifacts'));
  pass(first,'build');pass(first,'check');assert.deepEqual(await snapshot(join(first,'release-artifacts')),before);
  pass(second,'build');
  const normalize=items=>items.map(({mtime,...rest})=>rest);
  assert.deepEqual(normalize(await snapshot(join(second,'release-artifacts'))),normalize(before));
  const data=await readFile(join(first,'release-artifacts/manifest.json'),'utf8');assert.equal(data.includes(first),false);assert.equal(/timestamp|createdAt|lastmod/.test(data),false);
})));
test('release: reject no mode, unknown mode, origin override and extra arguments without writes', async () => sandbox(async root=>{
  for(const args of [[],['deploy'],['--help'],['build','check'],['build','https://evil.invalid'],['check','--origin','https://evil.invalid'],['build','--force']]) {
    const r=cli(root,...args);assert.equal(r.status,1);assert.equal(r.stderr,'RELEASE_USAGE\n');assert.deepEqual(await snapshot(join(root,'release-artifacts')),[]);
  }
  rejected(root,'check',/RELEASE_MISSING_OUTPUT/);
}));
test('release: reject extra/missing/modified output and unknown directory; never repair or delete', async t=>{
  for(const kind of ['extra-site','extra-root','missing','modified','directory','manifest-missing','empty-unmanaged'])await t.test(kind,()=>sandbox(async root=>{
    if(kind==='empty-unmanaged')await mkdir(join(root,'release-artifacts'));
    else {
      pass(root,'build');
      if(kind==='extra-site')await writeFile(join(root,'release-artifacts/site/extra.txt'),'synthetic extra');
      if(kind==='extra-root')await writeFile(join(root,'release-artifacts/notes.txt'),'synthetic extra');
      if(kind==='missing')await unlink(join(root,'release-artifacts/site/robots.txt'));
      if(kind==='modified')await tamperFile(root,'js/app.js',text=>text+'\n// synthetic tamper\n');
      if(kind==='directory')await mkdir(join(root,'release-artifacts/site/obsolete'));
      if(kind==='manifest-missing')await unlink(join(root,'release-artifacts/manifest.json'));
    }
    await assertRefusesWithoutWrites(root);
  }));
});
test('release: manifest plus asset together tampered still rejected independently', async t=>{
  for(const path of ['js/app.js','index.html','_headers','_redirects','robots.txt','sitemap.xml'])await t.test(path,()=>sandbox(async root=>{
    pass(root,'build');
    await tamperFile(root,path,text=>path.endsWith('.html')?text.replace('rel="canonical" href="https://file-bundles.glossquote.com/index.html"','rel="canonical" href="https://wrong.invalid/index.html"'):text+'\nsynthetic tamper\n',true);
    await assertRefusesWithoutWrites(root);
  }));
});
test('release: wrong origin/schema, duplicates, unsafe paths and source metadata cannot forge manifest', async t=>{
  const mutations={origin:x=>x.origin='https://wrong.invalid',mode:x=>x.mode='production',schema:x=>x.schemaVersion=2,extra:x=>x.extra=true,duplicate:x=>x.files.push(x.files[0]),traversal:x=>x.files[0].path='../outside',absolute:x=>x.files[0].path='C:/outside',badBytes:x=>x.files[0].bytes='12',badHash:x=>x.files[0].sha256='0'.repeat(64),source:x=>x.sourceFiles[0].sha256='0'.repeat(64)};
  for(const [name,mutate]of Object.entries(mutations))await t.test(name,()=>sandbox(async root=>{
    pass(root,'build');const value=await manifest(root);mutate(value);await rewriteManifest(root,value);await assertRefusesWithoutWrites(root);
  }));
});
test('release: changed source rejected even with recomputed source manifest; original output preserved', async () => sandbox(async root=>{
  pass(root,'build');
  const path='public/js/app.js';const bytes=Buffer.concat([await readFile(join(root,path)),Buffer.from('\n// changed source\n')]);await writeFile(join(root,path),bytes);
  const value=await manifest(root);const entry=value.sourceFiles.find(file=>file.path===path);entry.bytes=bytes.length;entry.sha256=sha(bytes);await rewriteManifest(root,value);
  const before=await snapshot(join(root,'release-artifacts'));rejected(root,'check',/RELEASE_SOURCE_CHANGED/);rejected(root,'build',/RELEASE_SOURCE_CHANGED/);assert.deepEqual(await snapshot(join(root,'release-artifacts')),before);
}));
test('release: three exact entry redirects use real LF, local canonical targets and 301; manifest covers bytes',async()=>sandbox(async root=>{
  pass(root,'build');pass(root,'check');
  const bytes=await readFile(join(root,'release-artifacts/site/_redirects'));
  assert.deepEqual(bytes,Buffer.from('/ /index.html 301\n/en /en/index.html 301\n/en/ /en/index.html 301\n','utf8'));
  assert.equal(bytes.length,65);assert.equal(bytes.includes(Buffer.from('\\n')),false);assert.equal(bytes.includes(13),false);
  assert.deepEqual(bytes.toString('utf8').split('\n'),['/ /index.html 301','/en /en/index.html 301','/en/ /en/index.html 301','']);
  const value=await manifest(root);assert.deepEqual(value.files.find(file=>file.path==='_redirects'),{path:'_redirects',bytes:65,sha256:sha(bytes)});
  await assert.rejects(readFile(join(root,'public/_redirects')),{code:'ENOENT'});
}));
test('release: redirect rule tampering plus matching manifest cannot pass or be silently repaired',async t=>{
  const variants={
    missingRoot:text=>text.replace('/ /index.html 301\n',''),missingEn:text=>text.replace('/en /en/index.html 301\n',''),missingEnSlash:text=>text.replace('/en/ /en/index.html 301\n',''),
    external:text=>text.replace('/ /index.html 301','/ https://wrong.invalid/index.html 301'),wrongTarget:text=>text.replace('/en/ /en/index.html 301','/en/ /index.html 301'),wrongStatus:text=>text.replaceAll('301','302'),
    extraRule:text=>text+'/* /index.html 301\n',crlf:text=>text.replaceAll('\n','\r\n'),literalEscape:text=>text.replaceAll('\n','\\n'),missingFinalLf:text=>text.trimEnd(),
    reordered:text=>text.split('\n').filter(Boolean).reverse().join('\n')+'\n',empty:()=>''
  };
  for(const [name,edit]of Object.entries(variants))await t.test(name,()=>sandbox(async root=>{
    pass(root,'build');await tamperFile(root,'_redirects',edit,true);await assertRefusesWithoutWrites(root);
  }));
});
test('release: missing redirects rejected even when manifest entry is also removed',async()=>sandbox(async root=>{
  pass(root,'build');await unlink(join(root,'release-artifacts/site/_redirects'));const value=await manifest(root);value.files=value.files.filter(file=>file.path!=='_redirects');await rewriteManifest(root,value);await assertRefusesWithoutWrites(root);
}));
test('release: unknown/missing public inputs and changed header source fail before creating output', async t=>{
  for(const kind of ['extra','missing','serve'])await t.test(kind,()=>sandbox(async root=>{
    if(kind==='extra')await writeFile(join(root,'public/extra.txt'),'synthetic');
    if(kind==='missing')await unlink(join(root,'public/css/app.css'));
    if(kind==='serve')await writeFile(join(root,'scripts/serve.mjs'),(await readFile(join(root,'scripts/serve.mjs'),'utf8')).replace("'no-store'","'no-cache'"));
    rejected(root,'build');assert.deepEqual(await snapshot(join(root,'release-artifacts')),[]);
  }));
});
test('release: source and output junction/symlink boundaries are rejected', async t=>{
  for(const kind of ['source-directory','output-directory','output-root'])await t.test(kind,()=>sandbox(async root=>{
    if(kind.startsWith('output'))pass(root,'build');
    const link=kind==='source-directory'?join(root,'public/css'):kind==='output-root'?join(root,'release-artifacts'):join(root,'release-artifacts/site/js');
    const target=join(root,'synthetic-link-target');await rename(link,target);
    await symlink(target,link,process.platform==='win32'?'junction':'dir');
    const r=rejected(root,'build',/RELEASE_UNSAFE_(?:LINK|TREE)/);assert.equal(r.status,1);
  }));
});
test('release: semantic HTML validation rejects wrong locale, robots, canonical, alternates and body', async () => sandbox(async root=>{
  pass(root,'build');
  const html=await readFile(join(root,'release-artifacts/site/en/index.html'),'utf8');
  const policy={origin:intendedOrigin,pages:PAGE_SEO};
  assert.equal(validateReleaseHTML(html,'en/index.html',policy).canonical,'https://file-bundles.glossquote.com/en/index.html');
  for(const edit of [
    text=>text.replace('<html lang="en">','<html lang="zh-Hant">'),
    text=>text.replace('content="index,follow"','content="noindex,nofollow"'),
    text=>text.replace('rel="canonical" href="https://file-bundles.glossquote.com/en/index.html"','rel="canonical" href="https://file-bundles.glossquote.com/index.html"'),
    text=>text.replace('hreflang="x-default" href="https://file-bundles.glossquote.com/index.html"','hreflang="x-default" href="https://file-bundles.glossquote.com/en/index.html"'),
    text=>text.replace('hreflang="zh-Hant"','hreflang="en"'),
    text=>text.replace('<h1>Bundle files by attachment size</h1>','<h1>Changed</h1>'),
    text=>text.replace('<title>Attachment Size Bundler — Free Local ZIP Splitter</title>','<title>Wrong</title>'),
    text=>text.replace('<head>','<head><meta name="robots" content="index,follow">'),
    text=>text.replace('</head>','<link rel="canonical" href="https://file-bundles.glossquote.com/en/index.html"></head>'),
    text=>text.replace('<summary>Are my files uploaded?</summary>','<p>Changed</p>')
  ])assert.throws(()=>validateReleaseHTML(edit(html),'en/index.html',policy),/RELEASE_HTML_INVALID/);
}));
