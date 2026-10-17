const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDiscordRateLimitGuard, retryAfterMs, readPublicEgressIp } = require('../dist-ts/services/discord-rate-limit');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-rate-limit-'));
  try {
    let now = 100000;
    let calls = 0;
    const file = path.join(dir, 'state.json');
    const opts = { now: () => now, sleep: async ms => { now += ms; }, log: () => {}, lookupIp: async () => null };
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
    const recoveryFile = path.join(dir, 'recovery.json');
    createDiscordRateLimitGuard(recoveryFile, opts).defer(500000);
    for (const name of [recoveryFile, recoveryFile + '.bak']) {
      const state = JSON.parse(fs.readFileSync(name));
      fs.writeFileSync(name, JSON.stringify({ ...state, egressIp: '192.0.2.1' }));
    }
    const recoveryStart = now;
    const recovery = createDiscordRateLimitGuard(recoveryFile, {
      ...opts, networkChangeId: 'amsterdam-one', lookupIp: async () => '192.0.2.2'
    });
    assert.equal(await recovery.beforeLogin('secret', () => false, async () => {
      assert.equal(now, recoveryStart);
      return new Response('{}');
    }), true);
    assert.equal(createDiscordRateLimitGuard(recoveryFile, opts).blocked(), false);
    recovery.defer(500000);
    let recoveryCalls = 0;
    let cancelRecovery = false;
    const repeated = createDiscordRateLimitGuard(recoveryFile, {
      ...opts, networkChangeId: 'amsterdam-one', sleep: async ms => { now += ms; cancelRecovery = true; }
    });
    assert.equal(await repeated.beforeLogin('secret', () => cancelRecovery, async () => {
      recoveryCalls++;
      return new Response('{}');
    }), false);
    assert.equal(recoveryCalls, 0, 'used marker cannot bypass another restriction');
    const rejectedFile = path.join(dir, 'rejected.json');
    createDiscordRateLimitGuard(rejectedFile, opts).defer(500000);
    for (const name of [rejectedFile, rejectedFile + '.bak']) {
      const state = JSON.parse(fs.readFileSync(name));
      fs.writeFileSync(name, JSON.stringify({ ...state, egressIp: '192.0.2.1' }));
    }
    let rejectStopped = false;
    const rejected = createDiscordRateLimitGuard(rejectedFile, {
      ...opts, networkChangeId: 'amsterdam-two', lookupIp: async () => '192.0.2.2',
      sleep: async ms => { now += ms; rejectStopped = true; }
    });
    assert.equal(await rejected.beforeLogin('secret', () => rejectStopped, async () => {
      recoveryCalls++;
      return new Response('blocked', { status: 429, headers: { 'retry-after': '600' } });
    }), false);
    assert.equal(recoveryCalls, 1);
    assert.ok(rejected.blocked());
    assert.ok(JSON.parse(fs.readFileSync(rejectedFile)).usedNetworkChanges.includes('amsterdam-two'));
    let freshStopped = false;
    let freshCalls = 0;
    const fresh = createDiscordRateLimitGuard(path.join(dir, 'fresh.json'), {
      ...opts, networkChangeId: 'fresh-migration', sleep: async ms => { now += ms; freshStopped = true; }
    });
    assert.equal(await fresh.beforeLogin('secret', () => freshStopped, async () => {
      freshCalls++;
      return new Response('blocked', { status: 429, headers: { 'retry-after': '600' } });
    }), false);
    assert.equal(freshCalls, 1, 'new restriction cannot use an unconsumed migration marker');
    for (const [name, savedIp, detectedIp] of [
      ['same', '192.0.2.1', '192.0.2.1'],
      ['unknown', '192.0.2.1', null],
      ['legacy', '', '192.0.2.2']
    ]) {
      const testFile = path.join(dir, name + '.json');
      fs.writeFileSync(testFile, JSON.stringify({ until: now + 500000, egressIp: savedIp }));
      let halted = false;
      let probes = 0;
      const testGuard = createDiscordRateLimitGuard(testFile, {
        ...opts, networkChangeId: 'new-marker', lookupIp: async () => detectedIp,
        sleep: async ms => { now += ms; halted = true; }
      });
      assert.equal(await testGuard.beforeLogin('secret', () => halted, async () => {
        probes++;
        return new Response('{}');
      }), false);
      assert.equal(probes, 0, name + ' must not authorize an early Discord request');
    }
    assert.equal(await readPublicEgressIp(async (url, request) => {
      assert.equal(url, 'https://api.ipify.org?format=json');
      assert.equal(request.headers, undefined);
      return new Response(JSON.stringify({ ip: '192.0.2.1' }));
    }), '192.0.2.1');
    assert.equal(await readPublicEgressIp(async () => new Response('{"ip":"not-an-ip"}')), null);
    assert.equal(await readPublicEgressIp(async () => { throw Error('network'); }), null);
    console.log('PASS Discord restriction persistence, wait, repeated 429, JSON retry, network backoff and corrupt backup');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
module.exports = { main };
