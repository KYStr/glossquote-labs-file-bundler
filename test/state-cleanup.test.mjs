import test from 'node:test';
import assert from 'node:assert/strict';
import { createBundleController } from '../public/js/state.js';
import { buildWorkerJob } from '../public/js/bundle-worker.js';
import { readStoredZip } from './helpers.mjs';

class ManualWorker {
  terminateCount = 0;
  postMessage(message) { this.message = message; }
  terminate() { this.terminateCount++; }
  deliver(data) { this.onmessage?.({ data }); }
  async finish() { await buildWorkerJob(this.message, data => this.deliver(data)); }
}
function harness(overrides = {}) {
  const workers = [];
  const created = [];
  const revoked = [];
  const changes = [];
  const controller = createBundleController({
    workerFactory: () => { const worker = new ManualWorker(); workers.push(worker); return worker; },
    urls: { createObjectURL(blob) { const url = `blob:fake-${created.length}`; created.push({ url, blob }); return url; }, revokeObjectURL(url) { revoked.push(url); } },
    onChange: view => changes.push(view.phase),
    ...overrides
  });
  return { controller, workers, created, revoked, changes };
}
const file = (name='a.txt', bytes=[0x78]) => new File([Uint8Array.from(bytes)],name);
async function ready(h) {
  h.controller.selectFiles([file()]);
  h.controller.setLimitInput('150');
  await h.controller.start();
  await h.workers.at(-1).finish();
  assert.equal(h.controller.snapshot().phase,'ready');
}
test('controller integrates real core and worker protocol into Blob plus exact JSON downloads', async () => {
  const h=harness();await ready(h);
  const view=h.controller.snapshot();
  assert.deepEqual(h.changes,['selected','selected','validating','planning','building','building','ready']);
  assert.equal(view.packages[0].blob.size,109);
  assert.deepEqual(readStoredZip(await view.packages[0].blob.arrayBuffer()).entries[0].data,Uint8Array.of(0x78));
  assert.equal(h.created.length,2);
  assert.equal(h.created[0].blob.type,'application/zip');
  const json=await h.created[1].blob.text();
  assert.ok(json.endsWith('\n'));
  assert.deepEqual(JSON.parse(json),view.index);
  assert.equal(view.index.packages[0].entries[0].crc32,'8cdc1683');
  assert.equal(h.workers[0].terminateCount,1);
});
test('B47-20: canceled A completion and progress cannot affect B or create URLs', async () => {
  const h=harness();h.controller.selectFiles([file()]);await h.controller.start();
  const a=h.workers[0];const oldHandler=a.onmessage;
  const oldMessage=a.message;
  h.controller.cancel();
  assert.equal(a.terminateCount,1);
  assert.equal(h.controller.snapshot().notice,'canceled');
  assert.deepEqual(h.controller.snapshot().errors,[]);
  assert.equal(h.controller.snapshot().result.error.code,'CANCELED');
  await h.controller.start();
  const bId=h.controller.snapshot().jobId;
  await buildWorkerJob(oldMessage,data=>oldHandler({data}));
  assert.equal(h.controller.snapshot().jobId,bId);
  assert.equal(h.controller.snapshot().phase,'building');
  assert.equal(h.created.length,0);
  assert.equal(h.workers[1].terminateCount,0);
  await h.workers[1].finish();
  assert.equal(h.controller.snapshot().phase,'ready');
});
test('B47-21: reset revokes each ZIP/index URL once and releases all references', async () => {
  const h=harness();await ready(h);
  const expected=h.created.map(entry=>entry.url);
  h.controller.reset();h.controller.reset();
  assert.deepEqual(h.revoked,expected);
  const view=h.controller.snapshot();
  assert.equal(view.phase,'empty');assert.equal(view.limitInput,'20 MiB');
  assert.deepEqual(view.files,[]);assert.deepEqual(view.packages,[]);assert.equal(view.index,null);assert.equal(view.result,null);assert.deepEqual(view.downloads,[]);assert.equal(view.indexDownload,null);
});
test('B47-22: advancing fake clock by 20 minutes keeps Ready downloads; no auto-expiry', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:0});
  const h=harness();await ready(h);
  const links=h.controller.snapshot().downloads;
  t.mock.timers.tick(20*60*1000);
  assert.equal(h.controller.snapshot().phase,'ready');
  assert.equal(h.controller.snapshot().downloads,links);
  assert.deepEqual(h.revoked,[]);
  t.mock.timers.reset();
});
test('Ready invalidation is synchronous for limit, reselect, remove, cancel, new job and pagehide', async () => {
  const actions=[c=>c.setLimitInput('200'),c=>c.selectFiles([file('other')]),c=>c.removeFile(0),c=>c.cancel(),c=>c.start(),c=>c.pagehide()];
  for(const action of actions) {
    const h=harness();await ready(h);const old=h.created.map(entry=>entry.url);
    const pending=action(h.controller);
    assert.deepEqual(h.revoked,old);
    assert.deepEqual(h.controller.snapshot().downloads,[]);
    assert.deepEqual(h.controller.snapshot().packages,[]);
    assert.equal(h.controller.snapshot().index,null);
    await pending;
    if(h.controller.snapshot().phase==='building')h.controller.cancel();
  }
});
test('changing selection or limit during build terminates old worker; stale callback ignored', async () => {
  for(const action of [c=>c.setLimitInput('200'),c=>c.selectFiles([file('new')]),c=>c.removeFile(0),c=>c.reset(),c=>c.pagehide()]) {
    const h=harness();h.controller.selectFiles([file()]);await h.controller.start();
    const a=h.workers[0];const handler=a.onmessage;const message=a.message;
    action(h.controller);
    const phase=h.controller.snapshot().phase;
    await buildWorkerJob(message,data=>handler({data}));
    assert.equal(a.terminateCount,1);
    assert.equal(h.controller.snapshot().phase,phase);
    assert.equal(h.created.length,0);
  }
});
test('cancel during validation prevents worker creation, preserving file input', async () => {
  const h=harness();h.controller.selectFiles([file()]);
  const pending=h.controller.start();h.controller.cancel();await pending;
  assert.equal(h.workers.length,0);assert.equal(h.controller.snapshot().files.length,1);assert.equal(h.controller.snapshot().phase,'selected');
});
test('all validation/planning errors expose zero packages and no object URLs', async () => {
  for(const [files,limit,code] of [[[],'150','NO_FILES'],[[file()],'0','INVALID_LIMIT'],[[file()],'108','FILE_TOO_LARGE_FOR_PACKAGE'],[[file('A'),file('a')],'1000','FILENAME_COLLISION'],[[file('../evil')],'1000','INVALID_FILENAME']]) {
    const h=harness();h.controller.selectFiles(files);h.controller.setLimitInput(limit);await h.controller.start();
    const view=h.controller.snapshot();assert.equal(view.result.error.code,code);assert.deepEqual(view.packages,[]);assert.equal(view.index,null);assert.equal(h.created.length,0);assert.equal(h.workers.length,0);
  }
});
test('worker error, message decode failure and startup failure recover without raw diagnostics', async () => {
  for(const type of ['onerror','onmessageerror','error','unknown']) {
    const h=harness();h.controller.selectFiles([file()]);await h.controller.start();
    const worker=h.workers[0];
    if(type==='onerror'||type==='onmessageerror')worker[type]({preventDefault(){},message:'PRIVATE_FAKE'});
    else worker.deliver({type,jobId:worker.message.jobId,result:{error:'PRIVATE_FAKE'}});
    const view=h.controller.snapshot();assert.equal(view.phase,'selected');assert.equal(view.result.error.code,'BUILD_FAILED');assert.equal(worker.terminateCount,1);assert.equal(h.created.length,0);assert.ok(!JSON.stringify(view.errors).includes('PRIVATE_FAKE'));
  }
  const h=harness({workerFactory(){throw new Error('PRIVATE_FAKE');}});h.controller.selectFiles([file()]);await h.controller.start();assert.equal(h.controller.snapshot().result.error.code,'BUILD_FAILED');
});
test('B47-24: malformed complete batch validates all members before creating any URLs', async () => {
  const h=harness();h.controller.selectFiles([file('a',[1]),file('b',[2])]);h.controller.setLimitInput('179');await h.controller.start();
  const worker=h.workers[0];let complete;
  await buildWorkerJob(worker.message,data=>{if(data.type==='complete')complete=data;});
  complete.packages[1].bytes=new ArrayBuffer(1);
  worker.deliver(complete);
  assert.equal(h.controller.snapshot().result.error.code,'BUILD_FAILED');assert.deepEqual(h.controller.snapshot().packages,[]);assert.equal(h.created.length,0);
});
test('URL allocation failure rolls back every allocated URL exactly once', async () => {
  const revoked=[];let count=0;
  const h=harness({urls:{createObjectURL(){if(count++)throw new Error('FAKE_ALLOCATION');return 'blob:allocated';},revokeObjectURL(url){revoked.push(url);}}});
  h.controller.selectFiles([file()]);await h.controller.start();await h.workers[0].finish();
  assert.equal(h.controller.snapshot().result.error.code,'BUILD_FAILED');assert.deepEqual(revoked,['blob:allocated']);assert.deepEqual(h.controller.snapshot().downloads,[]);assert.equal(h.controller.snapshot().index,null);
  h.controller.reset();assert.deepEqual(revoked,['blob:allocated']);
});
test('removing a selected member keeps remaining sourceIndexes in original order', () => {
  const h=harness();h.controller.selectFiles([file('a'),file('b'),file('c')]);h.controller.removeFile(1);
  assert.deepEqual(h.controller.snapshot().files.map(item=>item.sourceIndex),[0,2]);
});
