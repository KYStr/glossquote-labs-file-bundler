import { readFile,lstat } from 'node:fs/promises';
import { join } from 'node:path';

// Exact user-authorized assets-only configuration. JSONC uses canonical JSON
// syntax deliberately: comments, duplicate keys and overrides cannot hide drift.
const expected={
  name:'glossquote-file-bundler',compatibility_date:'2026-10-24',workers_dev:false,preview_urls:false,send_metrics:false,
  routes:[{pattern:'file-bundles.glossquote.com',custom_domain:true}],
  observability:{enabled:false,logs:{enabled:false,invocation_logs:false},traces:{enabled:false}},
  assets:{directory:'./release-artifacts/site',run_worker_first:false,html_handling:'none',not_found_handling:'none'},
  build:{command:'node scripts/release.mjs build'}
};
export const DEPLOYMENT_CONFIG_TEXT=JSON.stringify(expected,null,2)+'\n';
function invalid(){throw Object.assign(new Error('RELEASE_DEPLOYMENT_CONFIG_INVALID'),{code:'RELEASE_DEPLOYMENT_CONFIG_INVALID'});}
export function validateDeploymentText(text) {
  if(typeof text!=='string')invalid();
  let config;try{config=JSON.parse(text);}catch{invalid();}
  if(text!==DEPLOYMENT_CONFIG_TEXT||JSON.stringify(config)!==JSON.stringify(expected))invalid();
  return config;
}
export async function verifyDeploymentConfig(root) {
  const path=join(root,'wrangler.jsonc');const info=await lstat(path);
  if(info.isSymbolicLink()||!info.isFile())invalid();
  const config=validateDeploymentText(await readFile(path,'utf8'));
  const packagePath=join(root,'package.json');const packageInfo=await lstat(packagePath);
  if(packageInfo.isSymbolicLink()||!packageInfo.isFile())invalid();
  let pkg;try{pkg=JSON.parse(await readFile(packagePath,'utf8'));}catch{invalid();}
  if(pkg.type!=='module'||pkg.private!==true||pkg.dependencies||pkg.devDependencies||pkg.scripts?.['build:release']!==config.build.command||pkg.scripts?.['check:release']!=='node scripts/release.mjs check')invalid();
  const script=await lstat(join(root,'scripts','release.mjs'));if(script.isSymbolicLink()||!script.isFile())invalid();
  return config;
}
