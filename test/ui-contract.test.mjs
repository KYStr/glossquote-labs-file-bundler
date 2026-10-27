import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createUI } from '../public/js/ui.js';
import { createBundleController } from '../public/js/state.js';
import { buildWorkerJob } from '../public/js/bundle-worker.js';

class MockNode {
  children=[];attributes={};events={};dataset={};value='';hidden=false;text='';classes=new Set();
  constructor(tag) { this.tag=tag;this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),toggle:(name,active)=>active?this.classes.add(name):this.classes.delete(name)}; }
  set textContent(value) { this.text=String(value);this.children=[]; }
  get textContent() { return this.text+this.children.map(child=>child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text='';this.children=children; }
  setAttribute(key,value) { this.attributes[key]=String(value); }
  addEventListener(type,callback) { this.events[type]=callback; }
  click() { throw new Error('AUTOMATIC_CLICK_FORBIDDEN'); }
}
async function mockDocument(lang) {
  const source=await readFile(new URL(lang==='en'?'../public/en/index.html':'../public/index.html',import.meta.url),'utf8');
  const ids=new Map([...source.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],new MockNode('fixture')]));
  const created=[];
  return {documentElement:{lang},getElementById:id=>ids.get(id),createElement:tag=>{const node=new MockNode(tag);created.push(node);return node;},created,source};
}
test('B47-23 Node-only DOM contract: three native ZIP links plus independent index; names stay text nodes', async () => {
  for(const lang of ['zh-Hant','en']) {
    const doc=await mockDocument(lang);let controller;let worker;let urls=0;
    const ui=createUI(doc,index=>controller.removeFile(index));
    controller=createBundleController({urls:{createObjectURL(){return `blob:fake-${urls++}`;},revokeObjectURL(){}},workerFactory(){worker={postMessage(message){this.message=message;},terminate(){}};return worker;},onChange:ui.render});
    ui.render(controller.snapshot());
    assert.equal(ui.el('build').disabled,true);
    controller.selectFiles(['<img onerror=x>.txt','b','c'].map(name=>new File([Uint8Array.of(1)],name)));
    controller.setLimitInput('150');
    await controller.start();
    await buildWorkerJob(worker.message,data=>worker.onmessage?.({data}));
    assert.equal(controller.snapshot().phase,'ready');
    const links=doc.created.filter(node=>node.tag==='a');
    assert.deepEqual(links.map(link=>link.download),['bundle-001.zip','bundle-002.zip','bundle-003.zip','bundle-index.json']);
    assert.deepEqual(links.map(link=>link.href),['blob:fake-0','blob:fake-1','blob:fake-2','blob:fake-3']);
    assert.ok(links.every(link=>link.textContent.includes(link.download)));
    assert.equal(doc.created.some(node=>node.tag==='img'),false);
    assert.ok(ui.el('bundles').textContent.includes('<img onerror=x>.txt'));
    assert.ok(ui.el('bundles').textContent.includes('CRC32'));
    assert.equal(ui.el('build').disabled,false);
    controller.reset();
    assert.deepEqual(ui.el('bundles').children,[]);assert.deepEqual(ui.el('index-download').children,[]);
  }
});
test('Node-only DOM contract: both languages cover every error, status, progress and cancel recovery', async () => {
  const codes=['INVALID_LIMIT','NO_FILES','TOO_MANY_FILES','TOTAL_SIZE_LIMIT','INVALID_FILENAME','FILENAME_COLLISION','FILE_TOO_LARGE','FILE_TOO_LARGE_FOR_PACKAGE','BUILD_FAILED'];
  for(const lang of ['zh-Hant','en']) {
    const doc=await mockDocument(lang);const ui=createUI(doc,()=>{});
    const base={phase:'selected',files:[{sourceIndex:2,originalName:'fake.txt',sizeBytes:0}],limitInput:'20 MiB',errors:[],notice:'',result:null,progress:{completedFiles:0,totalFiles:1}};
    for(const code of codes) {
      ui.render({...base,errors:[{code,fileIndexes:[2]}]});
      assert.equal(ui.el('error-panel').hidden,false);
      const text=ui.el('errors').textContent;
      assert.ok(text.length>20);assert.ok(!text.includes('undefined'));assert.ok(text.includes('#3'));
      assert.equal(ui.el('package-limit').attributes['aria-invalid'],String(code==='INVALID_LIMIT'));
    }
    for(const phase of ['empty','selected','validating','planning','building']) {
      ui.render({...base,phase});assert.ok(ui.el('status').textContent);assert.ok(!ui.el('status').textContent.includes('undefined'));
    }
    ui.render({...base,notice:'canceled'});assert.equal(ui.el('error-panel').hidden,true);assert.ok(ui.el('status').textContent.includes(lang==='en'?'canceled':'已取消'));
    ui.render({...base,notice:'cleared'});assert.ok(ui.el('status').textContent.includes(lang==='en'?'cleared':'已清除'));
  }
});
test('static bilingual documents contain exact SEO, language anchors, warning, FAQ and connected labels', async () => {
  for(const lang of ['zh-Hant','en']) {
    const {source}=await mockDocument(lang);
    const ids=[...source.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
    assert.equal(ids.length,new Set(ids).size);
    for(const match of source.matchAll(/(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g))for(const id of match[1].split(' '))assert.ok(ids.includes(id),`missing ${id}`);
    assert.equal((source.match(/<h1>/g)||[]).length,1);assert.equal((source.match(/<summary>/g)||[]).length,5);
    assert.ok(source.includes('content="noindex,nofollow,noarchive"'));
    assert.ok(source.includes(lang==='en'?'<title>Attachment Size Bundler — Free Local ZIP Splitter</title>':'<title>附件大小分包｜免費本機 ZIP 分包工具</title>'));
    assert.ok(source.includes(lang==='en'?'<h1>Bundle files by attachment size</h1>':'<h1>依附件大小分包</h1>'));
    assert.ok(source.includes(lang==='en'?'href="/index.html" lang="zh-Hant"':'href="/en/index.html" lang="en"'));
    assert.ok(source.includes(lang==='en'?'Changing language leaves this page. Selected files and undownloaded bundles will be lost.':'切換語言會離開此頁；未下載的分包和索引會遺失。'));
    assert.equal(/<link[^>]+rel="canonical"|<form|\son\w+=/.test(source),false);
  }
});
