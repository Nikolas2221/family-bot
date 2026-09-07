const assert = require('node:assert/strict');
const { startTelegramBot, stopTelegramBot } = require('../dist-ts/telegram/bot');

async function main() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduled = [];
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, unref() {} };
    scheduled.push(timer);
    return timer;
  };
  global.clearTimeout = timer => { timer.cancelled = true; };
  try {
    let calls = 0;
    let finish;
    const bot = {
      launch: async options => {
        assert.equal(options.dropPendingUpdates, false);
        calls += 1;
        if (calls === 1) throw new Error('ETIMEDOUT');
        return new Promise(resolve => { finish = resolve; });
      },
      stop: () => finish?.()
    };
    assert.equal(await startTelegramBot(bot), false);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, 5000);
    scheduled[0].callback();
    assert.equal(calls, 2);
    const pending = startTelegramBot(bot);
    assert.equal(calls, 2, 'must not launch a second poller');
    stopTelegramBot(bot);
    await pending;
    const retryBot = { launch: async () => { throw new Error('network'); }, stop() {} };
    await startTelegramBot(retryBot);
    const timer = scheduled.at(-1);
    stopTelegramBot(retryBot);
    assert.equal(timer.cancelled, true);
    const count = scheduled.length;
    timer.callback();
    await Promise.resolve();
    assert.equal(scheduled.length, count);
    const badTokenBot = { launch: async () => { throw { response: { error_code: 401 } }; }, stop() {} };
    await startTelegramBot(badTokenBot);
    assert.equal(scheduled.length, count, 'invalid token must not retry endlessly');
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

module.exports = { main };
