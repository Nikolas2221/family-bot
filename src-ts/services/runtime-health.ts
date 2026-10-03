import { createServer, type Server } from 'node:http';

export interface RuntimeHealth {
  ready: boolean;
  storageWritable: boolean;
}

export function createRuntimeHealthServer(readHealth: () => RuntimeHealth): Server {
  return createServer((request, response) => {
    if (request.url !== '/healthz' || !['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(404).end();
      return;
    }
    let healthy = false;
    try {
      const status = readHealth();
      healthy = status.ready && status.storageWritable;
    } catch { healthy = false; }
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: healthy ? 'ok' : 'not_ready' }));
  });
}
