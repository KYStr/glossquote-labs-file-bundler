import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkerJob } from '../public/js/bundle-worker.js';
import { validateSelection } from '../public/js/core/validation.js';
import { planPackages } from '../public/js/core/planner.js';
import { descriptor, readStoredZip } from './helpers.mjs';

export function workerMessage(files,cap=300) {
  const validated=validateSelection(files,cap);
  assert.equal(validated.ok,true);
  return {type:'build',jobId:'job-1',files:validated.files,packages:planPackages(validated.files,cap).packages};
}
test('worker protocol emits progress, transfers buffers only when every bundle succeeds', async () => {
  const events=[];const transfers=[];
  const message=workerMessage([descriptor(0,'a',[1]),descriptor(1,'b',[2])],179);
  await buildWorkerJob(message,(event,transfer=[])=>{events.push(event);transfers.push(transfer);});
  assert.deepEqual(events.slice(0,2),[{type:'progress',jobId:'job-1',completedFiles:1,totalFiles:2},{type:'progress',jobId:'job-1',completedFiles:2,totalFiles:2}]);
  const done=events.at(-1);
  assert.equal(done.type,'complete');
  assert.deepEqual(done.packages.map(p=>p.bytes.byteLength),[101,101]);
  assert.deepEqual(done.packages.map(p=>readStoredZip(p.bytes).entries[0].data),[Uint8Array.of(1),Uint8Array.of(2)]);
  assert.deepEqual(transfers.at(-1),done.packages.map(p=>p.bytes));
});
test('B47-24: late read-size mismatch or exception discards earlier successful package', async () => {
  for(const shouldThrow of [false,true]) {
    const files=[descriptor(0,'a',[1]),{sourceIndex:1,originalName:'b',sizeBytes:1,file:{size:1,async arrayBuffer(){if(shouldThrow)throw new Error('PRIVATE_FAKE_CONTENT');return new ArrayBuffer(0);}}}];
    const events=[];
    await buildWorkerJob(workerMessage(files,179),event=>events.push(event));
    assert.equal(events.some(e=>e.type==='complete'),false);
    assert.deepEqual(events.at(-1),{type:'error',jobId:'job-1',result:{schemaVersion:1,jobId:'job-1',status:'error',error:{code:'BUILD_FAILED',fileIndexes:[],messageKey:'error.buildFailed'},packages:[],index:null}});
    assert.equal(JSON.stringify(events).includes('PRIVATE_FAKE_CONTENT'),false);
  }
});
test('worker rejects mismatched plans and malformed messages before reads', async () => {
  const message=workerMessage([descriptor(0,'a',[1])]);
  message.packages[0].entries[0].name='wrong';
  for(const input of [message,{}, {...message,type:'other'}, {...message,extra:true}]) {
    const events=[];await buildWorkerJob(input,event=>events.push(event));
    assert.equal(events.length,1);assert.equal(events[0].result.error.code,'BUILD_FAILED');
  }
});
