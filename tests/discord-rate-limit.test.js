const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDiscordRateLimitGuard, retryAfterMs } = require('../dist-ts/services/discord-rate-limit');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-rate-limit-'));
  try {
    let now = 100000;
    let calls = 0;
    const file = path.join(dir, 'state.json');
    const opts = { now: () => now, sleep: async ms => { now += ms; }, log: () => {} };
    const guard = createDiscordRateLimitGuard(file, opts);
    assert.equal(retryAfterMs('17886'), 17886000);
    assert.equal(retryAfterMs('invalid'), 60000);
    guard.defer(10000);
    const restored = createDiscordRateLimitGuard(file, opts);
    const deadline = restored.deadline();
    const result = await restored.beforeLogin('secret', () => false, async () => {
      calls++;
      assert.ok(now >= deadline, 'no requests before saved deadline');
      if (calls === 1) return new Response('<html>Access denied</html>', {
        status: 429, headers: { 'retry-after': '17886', 'content-type': 'text/html' }
      });
      assert.ok(now >= deadline + 17886000);
      return new Response('{}', { status: 200 });
    });
    assert.equal(result, true);
    assert.equal(calls, 2);
    assert.equal(restored.blocked(), false);
    const afterRestart = createDiscordRateLimitGuard(file, opts);
    await assert.rejects(afterRestart.beforeLogin('secret', () => false,
      async () => new Response('{}', { status: 401 })), /401/);
    guard.defer(50000);
    assert.equal(await guard.beforeLogin('secret', () => true, async () => {
      throw Error('must not fetch after shutdown');
    }), false);
    fs.writeFileSync(file, 'broken');
    assert.ok(createDiscordRateLimitGuard(file, opts).deadline() > now);
    fs.writeFileSync(file + '.bak', 'broken');
    assert.throws(() => createDiscordRateLimitGuard(file, opts), /damaged/);

    let attempts = 0;
    const jsonGuard = createDiscordRateLimitGuard(path.join(dir, 'json.json'), opts);
    const begin = now;
    await jsonGuard.beforeLogin('secret', () => false, async () => {
      if (++attempts === 1) return new Response(JSON.stringify({ retry_after: 90 }), {
        status: 429, headers: { 'content-type': 'application/json' }
      });
      assert.ok(now >= begin + 91000);
      return new Response('{}');
    });
    let stopped = false;
    const networkGuard = createDiscordRateLimitGuard(path.join(dir, 'network.json'), {
      ...opts, sleep: async ms => { now += ms; stopped = true; }
    });
    assert.equal(await networkGuard.beforeLogin('secret', () => stopped, async () => {
      throw Error('network');
    }), false);
    assert.ok(networkGuard.blocked());
    console.log('PASS Discord restriction persistence, wait, repeated 429, JSON retry, network backoff and corrupt backup');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
module.exports = { main };
