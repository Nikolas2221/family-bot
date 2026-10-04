const assert = require('node:assert/strict');
const { handleNaturalAdminCommand } = require('../dist-ts/event-runtime');
async function main() {
  let admin = true;
  let calls = 0;
  const actor = { id: '111111111111111111', permissions: { has: () => admin }, roles: { highest: { position: 10 } } };
  actor.fetch = async force => { assert.equal(force, true); return actor; };
  const target = { id: '222222222222222222', roles: { highest: { position: 1 } }, moderatable: true,
    timeout: async () => { calls++; }, fetch: async () => target };
  const guild = { id: 'guild', ownerId: 'owner', members: { fetch: async id => id === actor.id ? actor : target } };
  let brain;
  const options = { client: { user: { id: '999999999999999999' } },
    resolveGuildSettings: () => ({ aiBrain: brain }),
    database: { updateGuildSettings: (_, patch) => { brain = patch.aiBrain; } },
    sendSecurityLog: async () => {} };
  for (const action of ['замуть', 'размуть']) {
    const message = { guild, author: actor, member: { permissions: { has: () => true } },
      content: `${action} <@${target.id}>`, channel: { id: 'channel', send: async () => {} } };
    for (const reason of ['revoked', 'hierarchy', 'unmoderatable', 'allowed']) {
      admin = reason !== 'revoked';
      target.roles.highest.position = reason === 'hierarchy' ? 20 : 1;
      target.moderatable = reason !== 'unmoderatable';
      const before = calls;
      assert.equal(await handleNaturalAdminCommand(message, message.content, options, new Map()), true);
      assert.equal(calls - before, reason === 'allowed' ? 1 : 0);
      assert.equal(brain.audit.at(-1).status, reason === 'allowed' ? 'completed' : 'failed');
    }
  }
}
module.exports = { main };
