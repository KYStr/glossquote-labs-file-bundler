import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, inspectTree } from '../scripts/assets.mjs';

function luminance(hex) {
  const [r,g,b]=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*r+.7152*g+.0722*b;
}
function contrast(a,b) { const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05); }
test('static CSS token contrast and responsive/focus rules; rendered accessibility remains unverified', async () => {
  const css=await readFile(new URL('../public/css/app.css',import.meta.url),'utf8');
  const tokens=Object.fromEntries([...css.matchAll(/--gq-color-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map(match=>[match[1],match[2]]));
  for(const [foreground,background,min] of [['ink','paper',4.5],['ink','surface',4.5],['ink','acid',4.5],['text-muted','paper',4.5],['text-muted','surface',4.5],['text-muted','paper-subtle',4.5],['danger-text','danger-surface',4.5],['control-border','surface',3],['control-border','paper',3],['control-border','paper-subtle',3]]) assert.ok(contrast(tokens[foreground],tokens[background])>=min,`${foreground}/${background}`);
  for(const rule of ['min-width: 0','overflow-wrap: anywhere','min-height: 44px',':focus-visible','outline: 3px','(min-width: 48rem)','(min-width: 75rem)','prefers-reduced-motion']) assert.ok(css.includes(rule));
});
test('build tree rejects unknown/stale assets and permits only closed public paths', async () => {
  await mkdir(join(ROOT,'evidence','m1b'),{recursive:true});
  const fixture=join(ROOT,'evidence','m1b','tree-fixture');
  await mkdir(fixture,{recursive:false});
  const file=join(fixture,'unexpected.txt');
  try {
    await writeFile(file,'synthetic fixture');
    await assert.rejects(inspectTree(fixture),/^Error: UNKNOWN_ASSET$/);
    await unlink(file);
    await mkdir(join(fixture,'outside'));
    await assert.rejects(inspectTree(fixture),/^Error: UNKNOWN_DIRECTORY$/);
    await rmdir(join(fixture,'outside'));
    assert.deepEqual(await inspectTree(fixture),[]);
  } finally {
    // Explicit, bounded cleanup; no recursive deletion or computed shell commands.
    await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(join(fixture,'outside')).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(fixture);
  }
});
