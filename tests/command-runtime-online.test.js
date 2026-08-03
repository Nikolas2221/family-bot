const assert = require('node:assert/strict');

const { handleCommandRuntime } = require('../dist-ts/command-runtime');

async function main() {
  let deferPayload = null;
  let editPayload = null;
  const guild = {
    id: '123456789012345678',
    members: {
      cache: new Map([
        ['1', { id: '1', displayName: 'Online User', user: { bot: false }, presence: { status: 'online' } }]
      ]),
      async fetch() {}
    }
  };
  const interaction = {
    commandName: 'online',
    guild,
    isChatInputCommand: () => true,
    async deferReply(payload) { deferPayload = payload; },
    async editReply(payload) { editPayload = payload; }
  };

  const handled = await handleCommandRuntime(interaction, {
    guildStorage: { addCommend() {} }
  });

  assert.equal(handled, true);
  assert.deepEqual(deferPayload, { flags: 64 });
  assert.equal(editPayload.allowedMentions.parse.length, 0);
  assert.match(editPayload.content, /Online User/u);
  console.log('ALL ONLINE COMMAND RUNTIME TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
