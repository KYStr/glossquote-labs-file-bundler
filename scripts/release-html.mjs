// Strict tokenizer for this pinned static HTML vocabulary; no browser execution.
function invalid() { throw Object.assign(new Error('RELEASE_HTML_INVALID'), {code:'RELEASE_HTML_INVALID'}); }
const whitespace = char => char !== undefined && /[\t\n\r\f ]/.test(char);
const nameChar = char => char !== undefined && /[A-Za-z0-9:_-]/.test(char);
const voidTags = new Set(['meta','link','input','br','hr','img','area','base','col','embed','param','source','track','wbr']);
export function parseHTML(source) {
  const root={name:'#document',attrs:{},children:[]};
  const stack=[root];
  let index=0;
  while(index<source.length) {
    if(source[index]!=='<') {
      const end=source.indexOf('<',index);
      const next=end<0?source.length:end;
      stack.at(-1).children.push({name:'#text',text:source.slice(index,next)});
      index=next;continue;
    }
    if(source.startsWith('<!--',index)) {
      const end=source.indexOf('-->',index+4);if(end<0)invalid();index=end+3;continue;
    }
    if(/^<!doctype html>/i.test(source.slice(index,index+15))) {index+=15;continue;}
    index++;
    const closing=source[index]==='/';if(closing)index++;
    const start=index;while(nameChar(source[index]))index++;
    if(start===index)invalid();
    const name=source.slice(start,index).toLowerCase();
    const attrs={};let selfClosing=false;
    while(index<source.length) {
      while(whitespace(source[index]))index++;
      if(source[index]==='>'){index++;break;}
      if(source[index]==='/'&&source[index+1]==='>'){selfClosing=true;index+=2;break;}
      if(closing)invalid();
      const keyStart=index;while(nameChar(source[index]))index++;
      if(keyStart===index)invalid();
      const key=source.slice(keyStart,index).toLowerCase();
      if(Object.hasOwn(attrs,key))invalid();
      while(whitespace(source[index]))index++;
      let value='';
      if(source[index]==='=') {
        index++;while(whitespace(source[index]))index++;
        const quote=source[index++];if(quote!=='"'&&quote!=="'")invalid();
        const end=source.indexOf(quote,index);if(end<0)invalid();
        value=source.slice(index,end);index=end+1;
      }
      attrs[key]=value;
    }
    if(index>source.length||source[index-1]!=='>')invalid();
    if(closing) {if(stack.length<2||stack.at(-1).name!==name)invalid();stack.pop();}
    else {const node={name,attrs,children:[]};stack.at(-1).children.push(node);if(!voidTags.has(name)&&!selfClosing)stack.push(node);}
  }
  if(stack.length!==1)invalid();
  return root;
}
export function nodes(root,name) {
  return root.children.flatMap(node=>[...(node.name===name?[node]:[]),...(node.children?nodes(node,name):[])]);
}
export function text(node) {return node.name==='#text'?node.text:node.children.map(text).join('');}
const hasRel=(node,rel)=>(node.attrs.rel??'').toLowerCase().split(/\s+/).includes(rel);
export function validateReleaseHTML(source, pagePath, policy) {
  const fail=()=>invalid();
  const doc=parseHTML(source);
  if(nodes(doc,'span').some(node=>(node.attrs.class??'').split(/\s+/).includes('candidate'))||/本機候選版|尚未部署|Local\s+candidate\s*;?\s*not\s+deployed/i.test(text(doc)))fail();
  const html=nodes(doc,'html');const heads=nodes(doc,'head');const bodies=nodes(doc,'body');
  const expected=policy.pages[pagePath];
  if(!expected||html.length!==1||heads.length!==1||bodies.length!==1||html[0].attrs.lang!==expected.lang)fail();
  if(!html[0].children.includes(heads[0])||!html[0].children.includes(bodies[0]))fail();
  const head=heads[0];
  const titles=nodes(doc,'title');const descriptions=nodes(doc,'meta').filter(node=>node.attrs.name?.toLowerCase()==='description');
  const h1=nodes(doc,'h1');
  if(titles.length!==1||!head.children.includes(titles[0])||text(titles[0])!==expected.title||descriptions.length!==1||!head.children.includes(descriptions[0])||descriptions[0].attrs.content!==expected.description||h1.length!==1||text(h1[0])!==expected.h1)fail();
  const robots=nodes(doc,'meta').filter(node=>node.attrs.name?.toLowerCase()==='robots');
  if(robots.length!==1||!head.children.includes(robots[0])||robots[0].attrs.content!=='index,follow')fail();
  const canonical=nodes(doc,'link').filter(node=>hasRel(node,'canonical'));
  if(canonical.length!==1||!head.children.includes(canonical[0])||canonical[0].attrs.href!==`${policy.origin}/${pagePath}`)fail();
  const alternates=nodes(doc,'link').filter(node=>hasRel(node,'alternate'));
  const expectedAlternates={'zh-Hant':`${policy.origin}/index.html`,en:`${policy.origin}/en/index.html`,'x-default':`${policy.origin}/index.html`};
  if(alternates.length!==3)fail();
  const found=new Set();
  for(const alternate of alternates) {
    const lang=alternate.attrs.hreflang;
    if(!head.children.includes(alternate)||found.has(lang)||!Object.hasOwn(expectedAlternates,lang)||alternate.attrs.href!==expectedAlternates[lang])fail();
    found.add(lang);
  }
  if(nodes(doc,'summary').length!==5)fail();
  return {lang:html[0].attrs.lang,title:text(titles[0]),description:descriptions[0].attrs.content,h1:text(h1[0]),canonical:canonical[0].attrs.href,alternates:expectedAlternates};
}
