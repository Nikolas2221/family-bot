const assert = require('node:assert/strict');
const { watchDiscordStartup } = require('../dist-ts/services/discord-startup');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  let failures = 0;
  watchDiscordStartup(() => false, () => failures++, 10);
  await sleep(30);
  assert.equal(failures, 1);
  const stop = watchDiscordStartup(() => false, () => failures++, 10);
  stop();
  watchDiscordStartup(() => true, () => failures++, 10);
  await sleep(30);
  assert.equal(failures, 1);
  console.log('PASS Discord startup watchdog timeout, ready and cancellation');
}
module.exports = { main };
