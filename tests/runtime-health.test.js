const assert = require('node:assert/strict');
const { createRuntimeHealthServer } = require('../dist-ts/services/runtime-health');

async function main() {
  let status = { ready: false, storageWritable: true };
  const server = createRuntimeHealthServer(() => status);
  const request = (url = '/healthz', method = 'GET') => {
    const result = {};
    const response = { writeHead(code, headers) { result.code = code; result.headers = headers; return this; }, end(body) { result.body = body; } };
    server.emit('request', { url, method }, response);
    return result;
  };
  assert.equal(request().code, 503);
  status.ready = true;
  assert.deepEqual(JSON.parse(request().body), { status: 'ok' });
  assert.equal(request('/healthz', 'HEAD').body, undefined);
  status.storageWritable = false;
  assert.equal(request().code, 503);
  assert.equal(request('/').code, 404);
  assert.equal(request('/healthz', 'POST').code, 404);
  const failing = createRuntimeHealthServer(() => { throw new Error('private path'); });
  let body;
  failing.emit('request', { url: '/healthz', method: 'GET' }, { writeHead(code) { assert.equal(code, 503); return this; }, end(value) { body = value; } });
  assert.doesNotMatch(body, /private/);
}

module.exports = { main };
