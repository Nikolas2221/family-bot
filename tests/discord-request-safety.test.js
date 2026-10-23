const assert = require('node:assert/strict');
const { protectDiscordRequests } = require('../dist-ts/services/discord-request-safety');

async function main() {
  let now = 0;
  let blocked = false;
  let calls = 0;
  const pauses = [];
  const logs = [];
  const options = {
    now: () => now, sleep: async ms => { now += ms; },
    blocked: () => blocked, stopping: () => false,
    pause: ms => { pauses.push(ms); blocked = true; }, log: line => logs.push(line)
  };
  const times = [];
  const request = protectDiscordRequests(async () => {
    calls++; times.push(now); return new Response('{}');
  }, options);
  await Promise.all(Array.from({ length: 8 }, (_, i) => request('https://discord.com/api/test/' + i, {})));
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 150);
  assert.equal(calls, 8);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(request('https://discord.com/api/test/abort', { signal: controller.signal }), /cancelled/);
  assert.equal(calls, 8);
  const forbidden = protectDiscordRequests(async () => { calls++; return new Response('{}', { status: 403 }); }, options);
  await forbidden('https://discord.com/api/channels/123', {});
  const previousCalls = calls;
  await assert.rejects(forbidden('https://discord.com/api/channels/123', {}), /suspended/);
  assert.equal(calls, previousCalls);
  now += 10 * 60_000;
  await forbidden('https://discord.com/api/channels/123', {});
  assert.equal(calls, previousCalls + 1);
  const storm = protectDiscordRequests(async () => new Response('{}', { status: 403 }), options);
  for (let i = 0; i < 40; i++) await storm('https://discord.com/api/channels/storm' + i, {});
  assert.deepEqual(pauses, [15 * 60_000]);
  await assert.rejects(request('https://discord.com/api/test/paused', {}), /pause/);
  blocked = false;
  const auth = protectDiscordRequests(async () => new Response('{}', { status: 401 }), options);
  await auth('https://discord.com/api/users/@me', { headers: { Authorization: 'Bot secret-value' } });
  blocked = false;
  await assert.rejects(auth('https://discord.com/api/test/auth', {}), /pause/);
  assert.ok(!logs.join('\n').includes('secret-value'));
  const shared = protectDiscordRequests(async () => new Response('{}', {
    status: 429, headers: { 'x-ratelimit-scope': 'shared' }
  }), options);
  const count = pauses.length;
  for (let i = 0; i < 41; i++) await shared('https://discord.com/api/shared/' + i, {});
  assert.equal(pauses.length, count);
  assert.match(request.healthLines().join('\n'), /в очереди 0/);
  assert.match(auth.healthLines().join('\n'), /токен отклонён/);
  let signalStarted, complete;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const slow = protectDiscordRequests(async () => {
    signalStarted(); await new Promise(resolve => { complete = resolve; }); return new Response('{}');
  }, options);
  const operation = slow('https://discord.com/api/slow', {});
  await started;
  assert.match(slow.healthLines().join('\n'), /выполняется 1\/4; в очереди 0/);
  complete(); await operation;
  assert.match(slow.healthLines().join('\n'), /выполняется 0\/4/);
  const globalLimit = protectDiscordRequests(async () => new Response('{}', { status: 429,
    headers: { 'x-ratelimit-global': 'true', 'retry-after': '3' } }), options);
  await globalLimit('https://discord.com/api/global', {});
  assert.equal(pauses.at(-1), 3000);
  assert.match(globalLimit.healthLines().join('\n'), /пауза после ограничения/);
  console.log('PASS Discord REST pacing, abort, permission circuits, invalid-request breaker, token rejection and shared limits');
}
module.exports = { main };
