import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest, handler } from '../scripts/serve.mjs';

test('allowlisted preview routes only; traversal, queries, methods and foreign hosts fail closed', () => {
  assert.deepEqual(routeRequest('GET','/','127.0.0.1:4227'), { status: 200, file: 'index.html', contentType: 'text/html; charset=utf-8' });
  assert.equal(routeRequest('HEAD','/en/index.html','localhost:4227').status,200);
  for (const path of ['/../PRODUCT.md','/%2e%2e/AGENTS.md','/package.json','/index.html?x=1','//index.html','/en/../index.html','/missing','/a\\b']) assert.equal(routeRequest('GET',path,'127.0.0.1:4227').status,404);
  assert.equal(routeRequest('POST','/','127.0.0.1:4227').status,405);
  assert.equal(routeRequest('GET','/','evil.invalid').status,421);
});
test('in-memory handler emits MIME, noindex, CSP and HEAD without binding a port', async () => {
  const response = { writeHead(status,headers) { this.status=status; this.headers=headers; }, end(body) { this.body=body; } };
  await handler({method:'HEAD',url:'/index.html',headers:{host:'127.0.0.1:4227'}},response);
  assert.equal(response.status,200);
  assert.equal(response.body,undefined);
  assert.match(response.headers['Content-Security-Policy'], /connect-src 'none'/);
  assert.match(response.headers['X-Robots-Tag'], /noindex/);
  assert.equal(response.headers['Content-Type'],'text/html; charset=utf-8');
});
