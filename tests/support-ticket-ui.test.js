const assert = require('node:assert/strict');
const ui = require('../dist-ts/support-ticket-ui');

async function main() {
  const panel = ui.buildTicketPanel();
  const info = ui.buildTicketInfo();
  assert.equal(panel.components[0].toJSON().components[0].custom_id, 'ticket_create');
  assert.equal(panel.components[0].toJSON().components[0].style, 3);
  assert.equal(panel.embeds[0].toJSON().color, 0x2ecc71);
  assert.equal(info.embeds[0].toJSON().color, 0x3498db);

  const ticket = {
    channelId: '1', channelName: 'ticket-user-1', userId: '123456789012345678', guildId: '2',
    createdAt: new Date().toISOString(), status: 'open', topic: 'Тема', description: 'Описание', evidence: '',
    claimedBy: null, closedAt: null, closedBy: null, closeReason: null
  };
  const text = JSON.stringify([
    panel.embeds[0].toJSON(), info.embeds[0].toJSON(), ui.buildTicketOpenEmbed(ticket).toJSON()
  ]);
  assert.doesNotMatch(text, /KLAIZ|Phoenix|BRHD/iu);
  const controls = ui.buildTicketControls()[0].toJSON().components.map(component => component.custom_id);
  assert.deepEqual(controls, ['support_ticket_close', 'support_ticket_claim', 'support_ticket_add', 'support_ticket_remove']);
  console.log('ALL SUPPORT TICKET UI TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exit(1); });
}

module.exports = { main };
