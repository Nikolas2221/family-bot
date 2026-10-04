import { createServer, type Server } from 'node:http';

export interface RuntimeHealth {
  ready: boolean;
  storageWritable: boolean;
  databaseWritable?: boolean;
  journalWritable?: boolean;
}

export function createRuntimeHealthServer(readHealth: () => RuntimeHealth): Server {
  return createServer((request, response) => {
    if (request.url !== '/healthz' || !['GET', 'HEAD'].includes(request.method || '')) {
      response.writeHead(404).end();
      return;
    }
    let healthy = false;
    let components: Record<string, boolean> | undefined;
    try {
      const status = readHealth();
      healthy = status.ready && status.storageWritable && status.databaseWritable !== false && status.journalWritable !== false;
      if (status.databaseWritable !== undefined || status.journalWritable !== undefined) {
        components = { discord: status.ready, storage: status.storageWritable, database: status.databaseWritable !== false, journal: status.journalWritable !== false };
      }
    } catch { healthy = false; }
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: healthy ? 'ok' : 'not_ready', ...(components ? { components } : {}) }));
  });
}
