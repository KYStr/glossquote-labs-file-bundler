import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSelection } from '../public/js/core/validation.js';
import { planPackages } from '../public/js/core/planner.js';
import { descriptor } from './helpers.mjs';
const plan=(files,cap)=>planPackages(validateSelection(files,cap).files,cap);

test('B47-06: all files that cannot fit an empty ZIP are returned, without packages', () => {
  assert.deepEqual(plan([descriptor(0,'a.txt',[0x78])],108),{ok:false,code:'FILE_TOO_LARGE_FOR_PACKAGE',fileIndexes:[0]});
  assert.deepEqual(plan([descriptor(5,'long-name',[1]),descriptor(1,'other-name',[2])],100),{ok:false,code:'FILE_TOO_LARGE_FOR_PACKAGE',fileIndexes:[1,5]});
});
test('B47-07–08: 179 bytes splits; exactly 180 bytes fits', () => {
  const files=[descriptor(0,'a',[1]),descriptor(1,'b',[2])];
  const separate=plan(files,179);
  assert.deepEqual(separate.packages.map(pkg=>[pkg.fileName,pkg.sizeBytes,pkg.entries.map(e=>e.sourceIndex)]),[['bundle-001.zip',101,[0]],['bundle-002.zip',101,[1]]]);
  const together=plan(files,180);
  assert.equal(together.packages.length,1);
  assert.equal(together.packages[0].sizeBytes,180);
});
test('B47-19: descending size, source-index tie-break and original selection remain stable', () => {
  const files=[descriptor(0,'x',[1,2]),descriptor(1,'y',[3,4,5])];
  assert.deepEqual(plan(files,300).packages[0].entries.map(item=>item.sourceIndex),[1,0]);
  assert.deepEqual(files.map(item=>item.sourceIndex),[0,1]);
  assert.deepEqual(plan([descriptor(9,'z',[1]),descriptor(2,'a',[2])],180).packages[0].entries.map(item=>item.sourceIndex),[2,9]);
});
test('first available bundle is used; no source-size-only fitting or name sort', () => {
  const files=[descriptor(0,'a',Array(200).fill(0)),descriptor(1,'b',Array(150).fill(1)),descriptor(2,'c',Array(20).fill(2)),descriptor(3,'d',Array(19).fill(3))];
  assert.deepEqual(plan(files,400).packages.map(pkg=>[pkg.sizeBytes,pkg.entries.map(item=>item.sourceIndex)]),[[398,[0,2]],[347,[1,3]]]);
});
test('100 empty inputs are uniquely preserved and deterministic at exact cap', () => {
  const files=Array.from({length:100},(_,i)=>descriptor(i,`f${String(i).padStart(3,'0')}`));
  const result=plan(files,8422);
  assert.equal(result.packages.length,1);
  assert.equal(result.packages[0].sizeBytes,8422);
  assert.deepEqual(result.packages[0].entries.map(e=>e.sourceIndex),Array.from({length:100},(_,i)=>i));
  assert.deepEqual(plan(files,8422),result);
});
