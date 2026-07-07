const assert = require('node:assert/strict');

const { createGuildRuntimeApi } = require('../dist-ts/guild-runtime');

function createRuntime() {
  const records = {
    'main-guild': { settings: {} },
    'new-guild': { settings: {} }
  };

  return createGuildRuntimeApi({
    database: {
      getGuild: (guildId) => records[guildId] || { settings: {} },
      getSubscription: () => 'free',
      isPremium: () => false
    },
    storage: {},
    roleTemplates: [
      { key: 'rank15', envKey: 'ROLE_RANK_15', id: 'old-rank15', name: '15 rank' },
      { key: 'leader', envKey: 'ROLE_LEADER', id: 'old-leader', name: 'Leader' },
      { key: 'member', envKey: 'ROLE_MEMBER', id: 'old-member', name: 'Member' }
    ],
    defaults: {
      guildId: 'main-guild',
      channelId: 'old-panel',
      applicationsChannelId: 'old-applications',
      logChannelId: 'old-logs',
      disciplineLogChannelId: 'old-discipline',
      familyTitle: 'Phoenix',
      accessApplications: ['old-access-applications'],
      accessDiscipline: ['old-access-discipline'],
      accessRanks: ['old-access-ranks'],
      applicationDefaultRole: 'old-newbie',
      features: {
        aiEnabled: false,
        autoRanksEnabled: false,
        leakGuardEnabled: true,
        channelGuardEnabled: true
      },
      normalizeAutomodConfig: () => ({})
    }
  });
}

async function main() {
  const runtime = createRuntime();

  const mainSettings = runtime.resolveGuildSettings('main-guild');
  assert.equal(mainSettings.channels.panel, 'old-panel');
  assert.equal(mainSettings.channels.applications, 'old-applications');
  assert.equal(mainSettings.roles.find(role => role.key === 'leader').id, 'old-leader');
  assert.equal(mainSettings.applicationDefaultRole, 'old-newbie');

  const newSettings = runtime.resolveGuildSettings('new-guild');
  assert.equal(newSettings.channels.panel, '');
  assert.equal(newSettings.channels.applications, '');
  assert.equal(newSettings.channels.logs, '');
  assert.equal(newSettings.roles.find(role => role.key === 'leader').id, '');
  assert.equal(newSettings.applicationDefaultRole, '');

  const configuredRuntime = createGuildRuntimeApi({
    database: {
      getGuild: () => ({
        settings: {
          roles: {
            rank15: 'role-elite',
            leader: 'role-leader',
            member: 'role-member'
          },
          panelRoleIds: ['role-elite', 'role-main', 'role-family']
        }
      }),
      getSubscription: () => 'free',
      isPremium: () => false
    },
    storage: {},
    roleTemplates: [
      { key: 'rank15', envKey: 'ROLE_RANK_15', id: '', name: '15 rank' },
      { key: 'leader', envKey: 'ROLE_LEADER', id: '', name: 'Leader' },
      { key: 'member', envKey: 'ROLE_MEMBER', id: '', name: 'Member' }
    ],
    defaults: {
      guildId: 'main-guild',
      channelId: '',
      applicationsChannelId: '',
      logChannelId: '',
      disciplineLogChannelId: '',
      familyTitle: 'Phoenix',
      accessApplications: [],
      accessDiscipline: [],
      accessRanks: [],
      applicationDefaultRole: '',
      features: {
        aiEnabled: false,
        autoRanksEnabled: false,
        leakGuardEnabled: true,
        channelGuardEnabled: true
      },
      normalizeAutomodConfig: () => ({})
    }
  });

  const snapshot = configuredRuntime.buildGuildSettingsSnapshot({
    id: 'configured-guild',
    name: 'Configured Guild',
    ownerId: 'owner-1'
  });

  assert.equal(snapshot.settings.roles.rank15, 'role-elite');
  assert.equal(snapshot.settings.roles.leader, 'role-leader');
  assert.deepEqual(snapshot.settings.panelRoleIds, ['role-elite', 'role-main', 'role-family']);

  const overrideRuntime = createGuildRuntimeApi({
    database: {
      getGuild: () => ({ settings: { roles: { newbie: '1519857232345436220' } } }),
      getSubscription: () => 'free',
      isPremium: () => false
    },
    storage: {},
    roleTemplates: [],
    defaults: {
      guildId: 'main-guild',
      channelId: '',
      applicationsChannelId: '',
      logChannelId: '',
      disciplineLogChannelId: '',
      familyTitle: 'Phoenix',
      accessApplications: [],
      accessDiscipline: [],
      accessRanks: [],
      applicationDefaultRole: '1522317438228627528',
      guestRoleId: '',
      features: {
        aiEnabled: false,
        autoRanksEnabled: false,
        leakGuardEnabled: true,
        channelGuardEnabled: true
      },
      normalizeAutomodConfig: () => ({})
    }
  });

  assert.equal(overrideRuntime.resolveGuildSettings('main-guild').applicationDefaultRole, '1522317438228627528');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
