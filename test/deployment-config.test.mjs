import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,copyFile,cp,mkdir,mkdtemp,lstat,realpath,readdir,rm } from 'node:fs/promises';
import { join,relative,sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT } from '../scripts/assets.mjs';
import { validateDeploymentText } from '../scripts/deployment-config.mjs';
import { validateReleaseHTML } from '../scripts/release-html.mjs';
import { PAGE_SEO } from '../scripts/release-policy.mjs';

const expected={
  name:'glossquote-file-bundler',compatibility_date:'2026-10-24',workers_dev:false,preview_urls:false,send_metrics:false,
  routes:[{pattern:'file-bundles.glossquote.com',custom_domain:true}],
  observability:{enabled:false,logs:{enabled:false,invocation_logs:false},traces:{enabled:false}},
  assets:{directory:'./release-artifacts/site',run_worker_first:false,html_handling:'none',not_found_handling:'none'},
  build:{command:'node scripts/release.mjs build'}
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scratch=join(ROOT,'evidence','m2a','config-test-work');
async function sandbox(fn) {
  await mkdir(scratch,{recursive:true});assert.ok(!(await lstat(scratch)).isSymbolicLink());
  const root=await mkdtemp(join(scratch,'config-'));await mkdir(join(root,'scripts'));
  for(const file of ['assets.mjs','serve.mjs','release.mjs','release-policy.mjs','release-html.mjs','deployment-config.mjs'])await copyFile(join(ROOT,'scripts',file),join(root,'scripts',file));
  for(const file of ['package.json','wrangler.jsonc'])await copyFile(join(ROOT,file),join(root,file));
  await cp(join(ROOT,'public'),join(root,'public'),{recursive:true,errorOnExist:true,force:false});
  let passed=false;
  try{await fn(root);passed=true;}finally{if(passed){const target=await realpath(root),base=await realpath(scratch),local=relative(base,target);assert.ok(local&&local!=='..'&&!local.startsWith(`..${sep}`)&&!local.includes(':')&&!(await lstat(root)).isSymbolicLink());await rm(target,{recursive:true});}}
}
function cli(root,mode) {
  const result=spawnSync(process.execPath,[join(root,'scripts','release.mjs'),mode],{cwd:root,shell:false,windowsHide:true,encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.signal,null);return result;
}
async function outputSnapshot(root) {
  const entries=[];
  async function walk(path) {
    const info=await lstat(join(root,path));assert.ok(!info.isSymbolicLink());
    if(info.isDirectory()){entries.push({path,kind:'dir'});for(const name of (await readdir(join(root,path))).sort())await walk(`${path}/${name}`);}
    else{const bytes=await readFile(join(root,path));entries.push({path,bytes:bytes.length,sha256:sha(bytes),mtime:info.mtimeMs});}
  }
  await walk('release-artifacts');return entries;
}
test('deployment: exact approved assets-only configuration; actual build command matches supported npm script', async()=>{
  const text=await readFile(join(ROOT,'wrangler.jsonc'),'utf8');const config=validateDeploymentText(text);
  assert.deepEqual(config,expected);assert.equal(text,JSON.stringify(expected,null,2)+'\n');
  assert.equal(Object.hasOwn(config,'main'),false);assert.equal(Object.hasOwn(config,'vars'),false);assert.equal(Object.hasOwn(config,'env'),false);
  const pkg=JSON.parse(await readFile(join(ROOT,'package.json'),'utf8'));assert.equal(config.build.command,pkg.scripts['build:release']);assert.equal(pkg.scripts['check:release'],'node scripts/release.mjs check');
});
test('deployment: reject duplicate keys, comments, trailing commas, missing keys, strings instead of booleans',()=>{
  const valid=JSON.stringify(expected,null,2)+'\n';
  for(const invalid of [valid.replace('"send_metrics": false','"send_metrics": true, "send_metrics": false'),'// comment\n'+valid,valid.replace('"workers_dev": false,','"workers_dev": false,,')+'\n',valid.replace('  "send_metrics": false,\n',''),valid.replace('"send_metrics": false','"send_metrics": "false"'),valid+'\n'])assert.throws(()=>validateDeploymentText(invalid),/RELEASE_DEPLOYMENT_CONFIG_INVALID/);
});
test('deployment: build and release check reject unsafe config without touching any artifact',async t=>{
  const mutations={
    domain:x=>x.routes[0].pattern='other.glossquote.com',wildcard:x=>x.routes[0].pattern='*.glossquote.com',customDomain:x=>x.routes[0].custom_domain=false,extraRoute:x=>x.routes.push({pattern:'other.glossquote.com',custom_domain:true}),
    assets:x=>x.assets.directory='./public',assetTraversal:x=>x.assets.directory='../elsewhere',workerFirst:x=>x.assets.run_worker_first=true,htmlRewrite:x=>x.assets.html_handling='auto-trailing-slash',spa:x=>x.assets.not_found_handling='single-page-application',
    metrics:x=>x.send_metrics=true,observability:x=>x.observability.enabled=true,logs:x=>x.observability.logs.enabled=true,invocation:x=>x.observability.logs.invocation_logs=true,traces:x=>x.observability.traces.enabled=true,
    workersDev:x=>x.workers_dev=true,preview:x=>x.preview_urls=true,date:x=>x.compatibility_date='2099-01-01',name:x=>x.name='different-worker',
    command:x=>x.build.command='node scripts/release.mjs build --production',runtime:x=>x.main='./synthetic-worker.js',environment:x=>x.env={production:{send_metrics:true}}
  };
  for(const [name,mutate]of Object.entries(mutations))await t.test(name,()=>sandbox(async root=>{
    const built=cli(root,'build');assert.equal(built.status,0,built.stderr);const before=await outputSnapshot(root);
    const config=JSON.parse(await readFile(join(root,'wrangler.jsonc'),'utf8'));mutate(config);await writeFile(join(root,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n');
    for(const mode of ['check','build']){const result=cli(root,mode);assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr,'RELEASE_DEPLOYMENT_CONFIG_INVALID\n');assert.deepEqual(await outputSnapshot(root),before);}
  }));
});
test('deployment: config build contract refuses a mismatched package script',async()=>sandbox(async root=>{
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));pkg.scripts['build:release']='node scripts/release.mjs build --production';await writeFile(join(root,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  const result=cli(root,'build');assert.equal(result.status,1);assert.equal(result.stderr,'RELEASE_DEPLOYMENT_CONFIG_INVALID\n');
}));
test('release: candidate badge restoration plus recomputed manifest is rejected in both languages',async t=>{
  for(const [path,badge]of [['index.html','<span class="candidate">本機候選版；尚未部署</span>'],['en/index.html','<span class="candidate">Local candidate; not deployed</span>']])await t.test(path,()=>sandbox(async root=>{
    const built=cli(root,'build');assert.equal(built.status,0,built.stderr);
    const target=join(root,'release-artifacts','site',path);const text=await readFile(target,'utf8');const changed=text.replace('</main>',badge+'</main>');assert.notEqual(changed,text);
    assert.throws(()=>validateReleaseHTML(changed,path,{origin:'https://file-bundles.glossquote.com',pages:PAGE_SEO}),/RELEASE_HTML_INVALID/);
    const bytes=Buffer.from(changed);await writeFile(target,bytes);const manifestPath=join(root,'release-artifacts','manifest.json');const value=JSON.parse(await readFile(manifestPath,'utf8'));const entry=value.files.find(file=>file.path===path);entry.bytes=bytes.length;entry.sha256=sha(bytes);await writeFile(manifestPath,JSON.stringify(value,null,2)+'\n');
    const before=await outputSnapshot(root);
    for(const mode of ['check','build']){const result=cli(root,mode);assert.equal(result.status,1);assert.match(result.stderr,/RELEASE_MANIFEST_MISMATCH|RELEASE_OUTPUT_CHANGED|RELEASE_HTML_INVALID/);assert.deepEqual(await outputSnapshot(root),before);}
  }));
});
