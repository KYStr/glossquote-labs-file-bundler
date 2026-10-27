import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePackageLimit, validateSelection, validateName, MAX_BYTES } from '../public/js/core/validation.js';
import { descriptor, sizedDescriptor } from './helpers.mjs';

test('B47-01–03: exact ASCII integer/units parser and limits', () => {
  for (const [text, bytes] of [['150',150],['150 B',150],['20 MiB',20971520],['1 MiB',1048576],['64 MiB',67108864],['000150   B',150],['\t\r\n150 B\f\v ',150],['67108864',67108864]]) assert.deepEqual(parsePackageLimit(text), {ok:true,valueBytes:bytes});
  for (const text of ['0','-1','1.5 MiB','1e3','65 MiB','',' ','B','1,000','１２','١','1 mib','1 MIB','1 b','1 MB','+1','1\tB','1\nMiB','1 B',' 1','1 ','67108865','9007199254740993',null,100]) assert.deepEqual(parsePackageLimit(text), {ok:false,code:'INVALID_LIMIT'});
});
test('B47-09–11: count, single and total limits are checked before reads', () => {
  assert.equal(validateSelection(Array.from({length:101},(_,i)=>sizedDescriptor(i,`file-${i}`,0)),150).errors[0].code,'TOO_MANY_FILES');
  const tooLarge=validateSelection([sizedDescriptor(0,'a',MAX_BYTES+1)],MAX_BYTES);
  assert.deepEqual(tooLarge.errors,[{code:'FILE_TOO_LARGE',fileIndexes:[0]}]);
  const many=Array.from({length:64},(_,i)=>sizedDescriptor(i,`file-${i}`,1048576));
  assert.equal(validateSelection(many,MAX_BYTES).ok,true);
  many.push(sizedDescriptor(64,'last',1));
  assert.deepEqual(validateSelection(many,MAX_BYTES).errors,[{code:'TOTAL_SIZE_LIMIT',fileIndexes:[]}]);
  for(const size of [-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1]) assert.equal(validateSelection([sizedDescriptor(0,'a',size)],100).errors.some(item=>item.code==='FILE_TOO_LARGE'),true);
});
test('B47-12–15: unsafe names and NFC/lowercase collisions include every related source index', () => {
  for(const name of ['', '.', '..', '../evil.txt','a/b','a\\b','a:b','a\0b','a\x1fb','a\x7fb','a\x85b','a\u202eb','a\u202db','a\u2066b','a\ud800b','a\udc00b','a.','a ','a\t','a ','CON.txt','prn','AUX.csv','NUL','com1.png','LPT9.a']) {
    assert.equal(validateName(name),null,JSON.stringify(name));
    assert.deepEqual(validateSelection([descriptor(3,name)],1000).errors,[{code:'INVALID_FILENAME',fileIndexes:[3]}]);
  }
  for (const pair of [['é.txt','e\u0301.txt'],['A.txt','a.TXT']]) assert.deepEqual(validateSelection([descriptor(4,pair[0]),descriptor(1,pair[1])],1000).errors,[{code:'FILENAME_COLLISION',fileIndexes:[1,4]}]);
  // JavaScript lowercasing, with no locale transformation or second NFC pass.
  assert.equal(validateName('İ').normalizedCollisionKey,'i\u0307');
  assert.equal(validateSelection([descriptor(0,'İ'),descriptor(1,'i\u0307')],1000).errors[0].code,'FILENAME_COLLISION');
});
test('name UTF-8 boundaries and accepted Unicode/HTML-like literal text', () => {
  assert.equal(validateName('a'.repeat(255)).nameUtf8Length,255);
  assert.equal(validateName('a'.repeat(256)),null);
  assert.equal(validateName('é'.repeat(127)+'a').nameUtf8Length,255);
  assert.equal(validateName('é'.repeat(128)),null);
  assert.equal(validateName('e\u0301.txt').name,'é.txt');
  for(const name of ['COM0','COM10','LPT0','😀.txt','<img onerror=x>.txt','CONsole.txt']) assert.ok(validateName(name));
});
test('selection collects distinct errors, sorted indexes, no validated partial output', () => {
  const result=validateSelection([sizedDescriptor(9,'a.',MAX_BYTES+1),descriptor(3,'A'),descriptor(1,'a')],0);
  assert.deepEqual(result,{ok:false,errors:[{code:'INVALID_LIMIT',fileIndexes:[]},{code:'INVALID_FILENAME',fileIndexes:[9]},{code:'FILENAME_COLLISION',fileIndexes:[1,3]},{code:'FILE_TOO_LARGE',fileIndexes:[9]}]});
  assert.deepEqual(validateSelection([],100),{ok:false,errors:[{code:'NO_FILES',fileIndexes:[]}]});
  assert.equal(validateSelection([descriptor(0,'a'),descriptor(0,'b')],1000).errors[0].code,'BUILD_FAILED');
});
