const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const {
  appendBrainAudit,
  auditServerPermissions,
  createEmptyServerBrainSettings,
  formatBrainMemory,
  readRulesSnapshot,
  rememberChannelPurpose,
  riskForBrainAction,
  snapshotServerMap,
  withRulesSnapshot
} = require('../dist-ts/services/server-brain');

async function main() {
  const base = createEmptyServerBrainSettings();
  const applications = { id: 'channel-apps', name: 'applications', type: ChannelType.GuildText, parentId: 'category-1' };
  const remembered = rememberChannelPurpose(base, applications, 'applications', 'admin-1');
  assert.equal(remembered.channels['channel-apps'].purpose, 'applications');
  assert.equal(remembered.channels['channel-apps'].configuredBy, 'admin-1');

  const audited = appendBrainAudit(remembered, {
    action: 'channel_assign', risk: 'low', status: 'completed', actorId: 'admin-1', targetId: 'channel-apps', summary: 'saved'
  });
  assert.equal(audited.audit.length, 1);
  assert.equal(riskForBrainAction('permissions_audit'), 'read');
  assert.equal(riskForBrainAction('mute'), 'medium');
  assert.equal(riskForBrainAction('ban'), 'high');
  assert.equal(riskForBrainAction('channel_delete'), 'critical');

  const rulesSnapshot = await readRulesSnapshot({
    id: 'rules-1',
    messages: {
      fetch: async () => new Map([
        ['m2', { id: 'm2', createdTimestamp: 2, content: '2. Запрещён флуд.', embeds: [] }],
        ['m1', { id: 'm1', createdTimestamp: 1, content: '1. Уважайте участников.', embeds: [] }]
      ])
    }
  });
  assert.match(rulesSnapshot.text, /^1\. Уважайте/u);
  assert.equal(rulesSnapshot.messageIds.join(','), 'm1,m2');
  assert.equal(rulesSnapshot.hash.length, 64);

  const everyone = { id: 'everyone' };
  const dangerousRole = {
    id: 'danger', name: 'Danger', position: 10, managed: false,
    permissions: { bitfield: PermissionFlagsBits.Administrator, has: permission => permission === PermissionFlagsBits.Administrator }
  };
  const normalRole = {
    id: 'member', name: 'Member', position: 2, managed: false,
    permissions: { bitfield: 0n, has: () => false }
  };
  const logs = {
    id: 'logs-1', name: 'logs', type: ChannelType.GuildText, parentId: null,
    permissionsFor: target => ({
      has: permission => target === everyone
        ? permission === PermissionFlagsBits.ViewChannel
        : permission !== PermissionFlagsBits.EmbedLinks
    })
  };
  const guild = {
    id: 'guild-1',
    channels: { cache: new Map([[applications.id, applications], [logs.id, logs]]) },
    roles: { everyone, cache: new Map([[everyone.id, everyone], [dangerousRole.id, dangerousRole], [normalRole.id, normalRole]]) },
    members: { me: null }
  };
  const settings = {
    channels: { applications: applications.id, logs: logs.id },
    roles: { member: normalRole.id },
    aiBrain: withRulesSnapshot(audited, rulesSnapshot)
  };
  const mapped = snapshotServerMap(guild, settings, settings.aiBrain);
  assert.equal(mapped.channels['channel-apps'].purpose, 'applications');
  assert.equal(mapped.roles.danger.name, 'Danger');
  assert.match(formatBrainMemory({ aiBrain: mapped }), /Каналов в памяти: 2/u);

  const botMember = { roles: { highest: { position: 1 } } };
  const permissionAudit = auditServerPermissions(guild, settings, botMember);
  assert.match(permissionAudit.summary, /Danger/u);
  assert.match(permissionAudit.summary, /@everyone/u);
  assert.match(permissionAudit.summary, /Embed Links/u);
  assert.match(permissionAudit.summary, /не выше/u);

  console.log('ALL SERVER BRAIN TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
