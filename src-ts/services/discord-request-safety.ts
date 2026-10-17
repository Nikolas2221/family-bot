import { createHash } from 'node:crypto';
import type { RESTOptions } from 'discord.js';

export function protectDiscordRequests(makeRequest: RESTOptions['makeRequest'], options: {
  blocked: () => boolean;
  pause: (ms: number) => void;
  stopping: () => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}): RESTOptions['makeRequest'] {
  const now = options.now || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const log = options.log || console.warn;
  const circuits = new Map<string, number>();
  const invalid: number[] = [];
  let unauthorized = false;
  let pending = 0;
  let active = 0;
  let nextAt = 0;
  let tail: Promise<void> = Promise.resolve();

  return async (url, init) => {
    const key = createHash('sha256').update(`${init.method || 'GET'}:${new URL(url).pathname}`).digest('hex');
    const check = () => {
      if (init.signal?.aborted) throw new Error('Discord request cancelled before transmission.');
      if (options.stopping() || unauthorized || options.blocked()) throw new Error('Discord REST safety pause active.');
      if ((circuits.get(key) || 0) > now()) throw new Error('Discord resource temporarily suspended after 403/404.');
    };
    check();
    if (pending >= 64) throw new Error('Discord REST safety queue full. Try again later.');
    pending++;
    const queuedAt = now();
    const gate = tail.then(async () => {
      check();
      if (now() - queuedAt >= 8000) throw new Error('Discord REST safety queue timeout.');
      while (active >= 4 || nextAt > now()) {
        if (now() - queuedAt >= 8000) throw new Error('Discord REST safety queue timeout.');
        await sleep(Math.min(50, Math.max(1, nextAt - now())));
        check();
      }
      check();
      active++;
      nextAt = now() + 150;
    });
    tail = gate.catch(() => undefined);
    let admitted = false;
    try {
      await gate;
      admitted = true;
      check();
      const response = await makeRequest(url, init);
      const time = now();
      for (const [id, expiry] of circuits) if (expiry <= time) circuits.delete(id);
      const headers = init.headers;
      const authorization = Array.isArray(headers)
        ? headers.find(([name]) => name?.toLowerCase() === 'authorization')?.[1]
        : headers && 'get' in headers && typeof headers.get === 'function'
          ? headers.get('authorization')
          : Object.entries(headers || {}).find(([name]) => name.toLowerCase() === 'authorization')?.[1];
      const botAuthRejected = response.status === 401 && String(authorization || '').startsWith('Bot ');
      if (response.status === 403 || response.status === 404 || (response.status === 401 && !botAuthRejected)) {
        circuits.set(key, time + 10 * 60_000);
        while (circuits.size > 2000) circuits.delete(circuits.keys().next().value!);
        log(`[discord-safety] HTTP ${response.status}; repeated requests to this resource paused for 10 minutes.`);
      }
      while (invalid.length && invalid[0]! <= time - 10 * 60_000) invalid.shift();
      const countsAsInvalid = [401, 403, 429].includes(response.status)
        && !(response.status === 429 && response.headers.get('x-ratelimit-scope') === 'shared');
      if (countsAsInvalid) invalid.push(time);
      if (botAuthRejected) {
        unauthorized = true;
        options.pause(15 * 60_000);
        log('[discord-safety] HTTP 401; further REST requests stopped. Check TOKEN before restarting.');
      } else if (invalid.length >= 40) {
        options.pause(15 * 60_000);
        invalid.length = 0;
        log('[discord-safety] Invalid-request threshold reached; REST paused for 15 minutes. Inspect permissions and scheduled jobs.');
      }
      return response;
    } finally {
      pending--;
      if (admitted) active--;
    }
  };
}
