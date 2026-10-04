const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { deliverOnce } = require('../dist-ts/services/delivery-result');
const { finishInteractionError } = require('../dist-ts/interaction-helpers');
const { registerFatalHandlers } = require('../dist-ts/services/fatal-errors');

async function main() {
  assert.equal(await deliverOnce(async () => {}), 'delivered');
  assert.equal(await deliverOnce(async () => { throw { status: 403 }; }), 'failed');
  for (const error of [{ code: 'ETIMEDOUT' }, { status: 502 }, { status: 408 }, { status: 429 }]) {
    assert.equal(await deliverOnce(async () => { throw error; }), 'sending');
  }
  assert.equal(await deliverOnce(undefined), 'failed');
  for (const state of ['new', 'deferred', 'replied']) {
    const calls = [];
    const interaction = {
      isRepliable: () => true, deferred: state === 'deferred', replied: state === 'replied',
      reply: async payload => calls.push(['reply', payload]),
      editReply: async payload => calls.push(['edit', payload]),
      followUp: async payload => calls.push(['followUp', payload])
    };
    await finishInteractionError(interaction, 'Failed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], { new: 'reply', deferred: 'edit', replied: 'followUp' }[state]);
    assert.equal(calls[0][1].content, 'Failed');
  }
  await finishInteractionError({ isRepliable: () => false }, 'Ignored');
  const source = new EventEmitter();
  const fatal = [];
  registerFatalHandlers(error => fatal.push(error), source);
  const error = new Error('fatal test');
  source.emit('unhandledRejection', error);
  source.emit('uncaughtException', new Error('second fault'));
  assert.deepEqual(fatal, [error], 'fatal faults must initiate shutdown only once');
  for (const trigger of ["Promise.reject(new Error('unhandled'))", "setImmediate(() => { throw new Error('uncaught'); })"]) {
    const child = spawnSync(process.execPath, ['-e', `
      const { registerFatalHandlers } = require('./dist-ts/services/fatal-errors');
      const { drainWork, trackWork } = require('./dist-ts/services/shutdown');
      void trackWork(() => new Promise(resolve => setTimeout(resolve, 10)));
      registerFatalHandlers(() => {
        void drainWork(1000).then(drained => {
          if (!drained) process.exit(2);
          console.log('drained-before-exit');
          process.exit(1);
        });
      });
      ${trigger};
    `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000 });
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stdout, /drained-before-exit/);
  }
}
module.exports = { main };
