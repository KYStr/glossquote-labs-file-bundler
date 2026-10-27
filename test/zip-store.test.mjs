import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoredZip, serializedZipSize, crc32 } from '../public/js/core/zip-store.js';
import { readStoredZip } from './helpers.mjs';

test('B47-04: empty file a at cap 100 has exact size and zero CRC', async () => {
  const result=await createStoredZip([{name:'a',bytes:new Uint8Array()}]);
  assert.equal(result.sizeBytes,100);
  assert.equal(result.blob.size,100);
  assert.deepEqual(result.entries,[{name:'a',sizeBytes:0,crc32:'00000000'}]);
  assert.deepEqual(readStoredZip(await result.blob.arrayBuffer()).entries[0].data,new Uint8Array());
});
test('B47-05/17: x fixture has exact 109-byte records, UTF-8 flag, offsets and CRC', async () => {
  const result=await createStoredZip([{name:'a.txt',bytes:Uint8Array.of(0x78)}]);
  assert.equal(result.sizeBytes,109);
  assert.deepEqual(result.entries,[{name:'a.txt',sizeBytes:1,crc32:'8cdc1683'}]);
  const parsed=readStoredZip(await result.blob.arrayBuffer());
  assert.equal(parsed.centralOffset,36);
  assert.equal(parsed.centralSize,51);
  assert.equal(parsed.entries.length,1);
  assert.deepEqual(parsed.entries[0].data,Uint8Array.of(0x78));
  assert.equal(parsed.entries[0].crc32,'8cdc1683');
});
test('B47-08/16: STORE preserves every byte, including subarray offsets, and UTF-8 NFC names', async () => {
  const source=Uint8Array.of(10,0,255,127,20);
  const inputs=[{name:'e\u0301',bytes:source.subarray(1,4)},{name:'b',bytes:Uint8Array.of(0x80,0x0d,0x0a,0)}];
  const result=await createStoredZip(inputs);
  const parsed=readStoredZip(await result.blob.arrayBuffer());
  assert.deepEqual(parsed.entries.map(e=>e.name),['é','b']);
  assert.deepEqual(parsed.entries[0].data,Uint8Array.of(0,255,127));
  assert.deepEqual(parsed.entries[1].data,inputs[1].bytes);
  assert.deepEqual(source,Uint8Array.of(10,0,255,127,20));
  const pair=await createStoredZip([{name:'a',bytes:Uint8Array.of(1)},{name:'b',bytes:Uint8Array.of(2)}]);
  assert.equal(pair.sizeBytes,180);
  assert.equal(readStoredZip(await pair.blob.arrayBuffer()).entries.length,2);
});
test('CRC standard vector, deterministic output, empty archive and invalid metadata', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')),'cbf43926');
  const entries=[{name:'😀.txt',bytes:Uint8Array.of(255,0,13)}];
  assert.deepEqual(await (await createStoredZip(entries)).blob.arrayBuffer(),await (await createStoredZip(entries)).blob.arrayBuffer());
  assert.equal(serializedZipSize([]),22);
  assert.equal((await createStoredZip([])).blob.size,22);
  for(const entries of [[{name:'../x',sizeBytes:0}],[{name:'a',sizeBytes:0.1}],[{name:'a',sizeBytes:-1}],[{name:'a',sizeBytes:2**32}],[{name:'a',sizeBytes:0},{name:'A',sizeBytes:0}]]) assert.throws(()=>serializedZipSize(entries),/^Error: BUILD_FAILED$/);
  await assert.rejects(createStoredZip([{name:'a',bytes:[1,2]}]),/^Error: BUILD_FAILED$/);
});
test('deterministic synthetic byte fixtures round-trip without interpreting contents', async () => {
  let seed=47;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let run=0;run<24;run++) {
    const inputs=Array.from({length:1+next()%6},(_,i)=>({name:`檔案-${run}-${i}`,bytes:Uint8Array.from({length:next()%257},()=>next()%256)}));
    const archive=await createStoredZip(inputs);
    const expected=22+inputs.reduce((sum,item)=>sum+76+2*new TextEncoder().encode(item.name).length+item.bytes.length,0);
    assert.equal(archive.blob.size,expected);
    assert.equal(archive.sizeBytes,expected);
    const parsed=readStoredZip(await archive.blob.arrayBuffer());
    parsed.entries.forEach((entry,i)=>assert.deepEqual(entry.data,inputs[i].bytes));
  }
});
