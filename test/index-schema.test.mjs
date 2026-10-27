import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndex, serializeIndex } from '../public/js/core/index-schema.js';

const fixture=()=>({packageLimitBytes:150,packages:[{fileName:'bundle-001.zip',sizeBytes:109,entries:[{sourceIndex:0,name:'a.txt',sizeBytes:1,crc32:'8cdc1683'}]}]});
test('B47-18: index exact schema, numbers, field order and newline; excludes blobs and unknown fields', () => {
  const input=fixture();
  input.extra='DROP'; input.packages[0].blob=new Blob(['fake']); input.packages[0].entries[0].path='DROP';
  const expected={schemaVersion:1,kind:'glossquote-file-bundler-index',algorithm:'stable-ffd-zip-store-v1',packageLimitBytes:150,packages:[{fileName:'bundle-001.zip',sizeBytes:109,entries:[{sourceIndex:0,name:'a.txt',sizeBytes:1,crc32:'8cdc1683'}]}]};
  assert.deepEqual(createIndex(input),expected);
  assert.equal(serializeIndex(expected),JSON.stringify(expected,null,2)+'\n');
  assert.equal(new TextDecoder().decode(new TextEncoder().encode(serializeIndex(expected))),serializeIndex(expected));
});
test('index rejects wrong names, byte counts, CRC format, collision and oversized cap', () => {
  for(const mutate of [x=>x.packageLimitBytes=108,x=>x.packageLimitBytes=0,x=>x.packages[0].fileName='bundle-999.zip',x=>x.packages[0].sizeBytes=108,x=>x.packages[0].sizeBytes='109',x=>x.packages[0].entries[0].crc32='8CDC1683',x=>x.packages[0].entries[0].sourceIndex=-1,x=>x.packages[0].entries[0].name='../a.txt',x=>x.packages=[]]) {
    const input=fixture();mutate(input);assert.throws(()=>createIndex(input),/^Error: BUILD_FAILED$/);
  }
});
test('CRC is exactly eight lowercase ASCII characters, never a number or newline-suffixed string', () => {
  for(const crc of [12345678,'8cdc1683\n','8cdc1683\r','8cdc1683 ',' 8cdc1683',null,{},'000000000']) {
    const input=fixture();input.packages[0].entries[0].crc32=crc;
    assert.throws(()=>createIndex(input),/^Error: BUILD_FAILED$/);
  }
});
