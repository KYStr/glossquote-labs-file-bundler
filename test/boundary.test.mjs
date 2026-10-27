import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStoredZip } from '../public/js/core/zip-store.js';
import { validateSelection, MAX_BYTES } from '../public/js/core/validation.js';
import { planPackages } from '../public/js/core/planner.js';
import { sizedDescriptor } from './helpers.mjs';

test('exact 64 MiB ZIP boundary includes 100 bytes of STORE overhead for a', async () => {
  const data=new Uint8Array(MAX_BYTES-100);data[0]=0xff;data[data.length-1]=0x7f;
  const result=await createStoredZip([{name:'a',bytes:data}]);
  assert.equal(result.sizeBytes,67108864);assert.equal(result.blob.size,67108864);
  const buffer=await result.blob.arrayBuffer();const bytes=new Uint8Array(buffer);const view=new DataView(buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint32(18,true),67108764);
  assert.equal(view.getUint32(67108842,true),0x06054b50);
  assert.equal(createHash('sha256').update(bytes.subarray(31,31+data.length)).digest('hex'),createHash('sha256').update(data).digest('hex'));
});
test('64 MiB source cap and ZIP cap differ; metadata validation precedes reading', () => {
  const files=[sizedDescriptor(0,'a',MAX_BYTES)];
  const validated=validateSelection(files,MAX_BYTES);assert.equal(validated.ok,true);
  assert.deepEqual(planPackages(validated.files,MAX_BYTES),{ok:false,code:'FILE_TOO_LARGE_FOR_PACKAGE',fileIndexes:[0]});
  const many=Array.from({length:64},(_,i)=>sizedDescriptor(i,`f${String(i).padStart(2,'0')}`,1048576));
  const plan=planPackages(validateSelection(many,MAX_BYTES).files,MAX_BYTES);
  assert.equal(plan.packages.length,2);
  assert.equal(plan.packages[0].entries.length,63);assert.equal(plan.packages[1].entries.length,1);
  assert.ok(plan.packages.every(pkg=>pkg.sizeBytes<=MAX_BYTES));
});
