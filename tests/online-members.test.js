const assert = require('node:assert/strict');
const { buildDiscordOnlineMembersText } = require('../dist-ts/services/online-members');

async function main() {
  let fetched = false;
  const guild = {
    members: {
      cache: new Map([
        ['1', { id: '1', displayName: 'Online User', user: { bot: false }, presence: { status: 'online' } }],
        ['2', { id: '2', displayName: 'Idle User', user: { bot: false }, presence: { status: 'idle' } }],
        ['3', { id: '3', displayName: 'Offline User', user: { bot: false }, presence: { status: 'offline' } }],
        ['4', { id: '4', displayName: 'Bot', user: { bot: true }, presence: { status: 'online' } }]
      ]),
      async fetch(options) { fetched = options.withPresences; }
    }
  };
  const text = await buildDiscordOnlineMembersText(guild);
  assert.equal(fetched, true);
  assert.match(text, /Участники Discord в сети: 2/u);
  assert.match(text, /Online User/u);
  assert.match(text, /Idle User/u);
  assert.doesNotMatch(text, /Offline User|Bot/u);
  console.log('ALL ONLINE MEMBERS TESTS PASSED');
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { main };
