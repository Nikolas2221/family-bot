const assert = require('node:assert/strict');
const ui = require('../dist-ts/afk-leave-ui');

async function main() {
  const panel = ui.buildAfkPanel();
  assert.equal(panel.embeds[0].toJSON().color, 0x2ecc71);
  assert.equal(panel.components[0].toJSON().components[0].custom_id, 'afk_request_create');
  const request = {
    id: 'abcdef12', guildId: '1', channelId: '2', messageId: '3', userId: '123456789012345678',
    nicknameStatic: 'User #1', startDate: '11.06.2026', endDate: '13.06.2026', reason: 'Отдых',
    status: 'pending', createdAt: new Date().toISOString(), reviewedAt: null, reviewedBy: null, declineReason: null
  };
  assert.equal(ui.buildAfkRequestEmbed(request).toJSON().color, 0xf39c12);
  assert.deepEqual(
    ui.buildAfkReviewButtons(request.id)[0].toJSON().components.map(component => component.custom_id),
    ['afk_approve_abcdef12', 'afk_decline_abcdef12']
  );
  const text = JSON.stringify([panel.embeds[0].toJSON(), ui.buildAfkRequestEmbed(request).toJSON()]);
  assert.doesNotMatch(text, /KLAIZ|Phoenix|BRHD/iu);
  console.log('ALL AFK LEAVE UI TESTS PASSED');
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
module.exports = { main };
