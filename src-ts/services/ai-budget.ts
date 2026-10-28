import fs from 'node:fs';
import { writeSnapshot } from './file-persistence';
import { requestContext } from './request-context';
interface Usage { day: string; reserved: number; actual: number; requests: Record<string, number>; warned?: boolean }
export function createAiBudget(file: string, options: { dailyTokens: number; userRequests: number; channelRequests: number; now?: () => number }) {
  const now = options.now || Date.now;
  let state: Usage = { day: '', reserved: 0, actual: 0, requests: {} };
  let unavailable = !fs.existsSync(file) && fs.existsSync(file + '.bak');
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Usage;
      if (!parsed || typeof parsed.day !== 'string' || !Number.isFinite(parsed.reserved) || parsed.reserved < 0 || !Number.isFinite(parsed.actual) || !parsed.requests || Object.values(parsed.requests).some(count => !Number.isFinite(count) || count < 0)) throw Error();
      state = parsed;
    } catch { unavailable = true; }
  }
  let warningHandler: (() => Promise<void>) | undefined;
  const guardedFetch = (fetchImpl: typeof fetch): typeof fetch => async (input, init) => {
    if (unavailable) throw Error('AI budget unavailable; restore usage journal');
    const day = new Date(now()).toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
    if (state.day !== day) state = { day, reserved: 0, actual: 0, requests: {} };
    const body = JSON.parse(String(init?.body || '{}')) as { messages?: unknown; max_tokens?: number };
    // UTF-8 bytes plus maximum output: deliberately conservative; not a price estimate.
    const reserve = Buffer.byteLength(JSON.stringify(body.messages || []), 'utf8') + Math.max(1, Number(body.max_tokens) || 2048);
    const context = requestContext();
    const keys = [context.userId ? ['user:' + context.guildId + ':' + context.userId, options.userRequests] as const : null,
      context.channelId ? ['channel:' + context.guildId + ':' + context.channelId, options.channelRequests] as const : null].filter(item => item !== null);
    if (state.reserved + reserve > options.dailyTokens || keys.some(([key, limit]) => (state.requests[key] || 0) >= limit)) throw Error('AI budget limit reached');
    const ledger = state;
    state.reserved += reserve;
    for (const [key] of keys) state.requests[key] = (state.requests[key] || 0) + 1;
    const warn = !state.warned && state.reserved >= options.dailyTokens * 0.8 && warningHandler;
    if (warn) state.warned = true;
    writeSnapshot(file, JSON.stringify(state)); // Unknown results remain reserved after errors/restarts.
    if (warn) void Promise.resolve().then(warn).catch(() => console.warn('AI budget warning delivery uncertain; inspect /health.'));
    const response = await fetchImpl(input, init);
    if (response.ok) {
      try {
        const payload = await response.clone().json() as { usage?: { total_tokens?: number } };
        const actual = payload.usage?.total_tokens;
        if (typeof actual === 'number' && Number.isFinite(actual) && actual >= 0) {
          ledger.actual += actual;
          ledger.reserved += actual - reserve;
          if (ledger === state) writeSnapshot(file, JSON.stringify(state));
        }
      } catch { /* Keep the reservation if usage is absent or unreadable. */ }
    }
    return response;
  };
  return { guardedFetch, onWarning: (handler: () => Promise<void>) => { warningHandler = handler; }, healthLines: () => ['ИИ: ' + (unavailable ? 'журнал бюджета недоступен' : 'токены ' + state.reserved + '/' + options.dailyTokens + '; подтверждено провайдером ' + state.actual + (state.reserved >= options.dailyTokens * 0.8 ? '; достигнуто 80% бюджета' : ''))] };
}
