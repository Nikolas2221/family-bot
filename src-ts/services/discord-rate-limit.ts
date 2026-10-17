import fs from 'node:fs';
import { writeSnapshot } from './file-persistence';

export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value) return 60_000;
  const seconds = Number(value);
  const duration = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(duration) && duration >= 0 ? Math.max(1000, duration) : 60_000;
}

export function createDiscordRateLimitGuard(file: string, options: {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
} = {}) {
  const now = options.now || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const log = options.log || console.warn;
  let until = 0;
  // Use the later valid copy: a partial write must never shorten a restriction.
  let existing = 0;
  let valid = 0;
  for (const name of [file, `${file}.bak`]) {
    if (!fs.existsSync(name)) continue;
    existing++;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(name, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || !('until' in parsed)
        || typeof parsed.until !== 'number' || !Number.isFinite(parsed.until) || parsed.until < 0) continue;
      until = Math.max(until, parsed.until);
      valid++;
    } catch { /* Try the backup; never overwrite unreadable state. */ }
  }
  if (existing && !valid) throw new Error('Discord rate-limit state is damaged; restore it before connecting.');
  function defer(ms: number): void {
    until = Math.max(until, now() + Math.max(1000, ms) + 1000);
    writeSnapshot(file, JSON.stringify({ until }));
    log(`[discord] Requests paused until ${new Date(until).toISOString()}; restriction saved on disk.`);
  }
  async function wait(stopping: () => boolean = () => false): Promise<boolean> {
    if (until > now()) log(`[discord] Waiting for saved restriction until ${new Date(until).toISOString()}. No login attempts during this period.`);
    while (until > now()) {
      if (stopping()) return false;
      await sleep(Math.min(until - now(), 1000));
    }
    return !stopping();
  }
  async function beforeLogin(token: string, stopping: () => boolean, fetchImpl: typeof fetch = fetch): Promise<boolean> {
    while (await wait(stopping)) {
      let response: Response;
      try {
        response = await fetchImpl('https://discord.com/api/v10/gateway/bot', {
          headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(15_000)
        });
      } catch {
        log('[discord] Gateway preflight network error; retry delayed.');
        defer(60_000);
        continue;
      }
      try {
        if (response.status === 429) {
          let duration = retryAfterMs(response.headers.get('retry-after'), now());
          if (!response.headers.has('retry-after') && response.headers.get('content-type')?.includes('application/json')) {
            const body: unknown = await response.json().catch(() => null);
            if (body && typeof body === 'object' && 'retry_after' in body
              && typeof body.retry_after === 'number' && Number.isFinite(body.retry_after) && body.retry_after >= 0) {
              duration = Math.max(1000, body.retry_after * 1000);
            }
          }
          defer(duration);
          continue;
        }
        if (response.status === 401) throw new Error('Discord rejected TOKEN (HTTP 401). Automatic login stopped.');
        if (!response.ok) {
          log(`[discord] Gateway preflight HTTP ${response.status}; retry delayed.`);
          defer(response.status === 403 ? 15 * 60_000 : 60_000);
          continue;
        }
        return !stopping();
      } finally {
        await response.body?.cancel().catch(() => undefined);
      }
    }
    return false;
  }
  return { defer, wait, beforeLogin, blocked: () => until > now(), deadline: () => until };
}
