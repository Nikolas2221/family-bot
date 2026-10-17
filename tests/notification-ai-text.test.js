const assert = require('node:assert/strict');
const { EmbedBuilder } = require('discord.js');
const { createNotificationRuntimeHelpers } = require('../dist-ts/runtime-notification-helpers');

async function main() {
  const sent = [];
  const inputs = [];
  let unavailable = false;
  const user = { createDM: async () => ({ send: async payload => sent.push(payload.embeds[0].toJSON()) }) };
  const guild = { id: 'guild', name: 'Test server' };
  const member = { user, guild };
  const moderatorUser = { id: 'moderator' };
  const helpers = createNotificationRuntimeHelpers({
    EmbedBuilderCtor: EmbedBuilder,
    resolveGuildSettings: () => ({ familyTitle: 'Family', visuals: {} }),
    aiService: { aiText: async (system, prompt) => {
      if (unavailable) return '';
      const data = JSON.parse(prompt);
      inputs.push({ system, ...data });
      return `New event message ${inputs.length}.`;
    } }
  });
  await helpers.sendDisciplineDm('commend', guild, user, moderatorUser, '1');
  await helpers.sendDisciplineDm('commend', guild, user, moderatorUser, '1');
  assert.match(sent[0].description, /^New event message 1\./);
  assert.match(sent[1].description, /^New event message 2\./);
  assert.doesNotMatch(sent[0].description, /Так держать/);
  assert.match(sent[0].description, /Причина: 1/);
  assert.match(sent[0].description, /<@moderator>/);
  assert.notEqual(inputs[0].variationId, inputs[1].variationId);
  assert.doesNotMatch(sent[0].description, new RegExp(inputs[0].variationId));
  assert.match(inputs[0].system, /do not invent specific achievements/);
  await helpers.sendDisciplineDm('warn', guild, user, moderatorUser, 'Exact reason');
  assert.match(sent.at(-1).description, /Причина: Exact reason/);
  await helpers.sendAcceptanceDm({ guild, member, moderatorUser, reason: 'Interview', rankName: 'Member', applicationUrl: 'https://example.com/application' });
  assert.match(sent.at(-1).description, /Выданный ранг: Member/);
  assert.match(sent.at(-1).description, /https:\/\/example.com\/application/);
  assert.doesNotMatch(sent.at(-1).description, /Поздравляем с принятием/);
  await helpers.sendRejectionDm({ guild, user, moderatorUser, reason: 'Exact refusal' });
  await helpers.sendRankDm(guild, member, { ok: true, code: 'promoted', fromRole: { name: 'Old' }, toRole: { name: 'New' } });
  await helpers.sendBlacklistDm(user, guild, 'Exact restriction');
  await helpers.sendAfkWarningDm(member);
  assert.match(sent.at(-1).description, /Период без активности: 3 дня/);
  assert.doesNotMatch(sent.at(-1).description, /кикнуть/);
  unavailable = true;
  await helpers.sendDisciplineDm('commend', guild, user, moderatorUser, 'Fallback reason');
  assert.match(sent.at(-1).description, /Спасибо за участие/);
  assert.match(sent.at(-1).description, /Причина: Fallback reason/);
  console.log('PASS fresh event-specific AI notification bodies replace templates and preserve exact facts; fallback still delivers');
}
module.exports = { main };
