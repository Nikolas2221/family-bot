const assert = require('node:assert/strict');

const { createNotificationRuntimeHelpers } = require('../dist-ts/runtime-notification-helpers');

async function main() {
  const sentPayloads = [];
  const maintenanceUpdates = [];

  const embeds = {
    buildAcceptLogEmbed: (payload) => ({ type: 'accept', payload }),
    buildAutomodActionEmbed: (payload) => ({ type: 'automod', payload }),
    buildUpdateAnnouncementEmbed: (payload) => ({ type: 'update', payload }),
    buildWelcomeEmbed: () => ({ type: 'welcome' }),
    buildWelcomeButtons: () => ['buttons']
  };

  const channel = {
    send: async (payload) => {
      sentPayloads.push(payload);
      return { id: 'message-1' };
    }
  };

  const member = {
    id: 'user-1',
    guild: {
      id: 'guild-1',
      name: 'Phoenix',
      roles: {
        cache: new Map(),
        fetch: async () => null
      }
    },
    user: {
      id: 'user-1',
      createDM: async () => ({
        send: async (payload) => {
          sentPayloads.push(payload);
          return { id: 'dm-1' };
        }
      })
    },
    roles: {
      cache: new Map(),
      add: async () => true
    },
    send: async (payload) => {
      sentPayloads.push(payload);
      return { id: 'member-dm-1' };
    }
  };

  const helpers = createNotificationRuntimeHelpers({
    copy: {
      applications: {
        acceptReason: 'Собес',
        acceptRank: '1'
      }
    },
    embeds,
    database: {
      getGuild: () => ({ maintenance: {} }),
      updateGuildMaintenance: (guildId, patch) => maintenanceUpdates.push({ guildId, patch })
    },
    EmbedBuilderCtor: require('discord.js').EmbedBuilder,
    fetchTextChannel: async () => channel,
    isPremiumGuild: () => true,
    resolveGuildSettings: () => ({
      familyTitle: 'Phoenix',
      channels: {
        logs: 'logs-1',
        updates: 'updates-1',
        automod: 'automod-1',
        welcome: 'welcome-1',
        applications: 'applications-1',
        panel: 'panel-1',
        rules: 'rules-1',
        disciplineLogs: 'discipline-1'
      },
      visuals: {
        applicationsBanner: 'https://example.com/banner.png'
      },
      welcome: {
        enabled: true,
        dmEnabled: true,
        message: 'Добро пожаловать'
      },
      verification: {
        enabled: true,
        roleId: 'verify-1'
      },
      verificationRoleId: '',
      autoroleRoleId: 'autorole-1'
    }),
    currentBuildSignature: '1.0.16:abc1234',
    productVersionLabel: 'BRHD/PHOENIX 1.0 RELEASE',
    productVersionSemver: '1.0.16',
    deployBuildId: 'abc1234',
    deployCommitMessage: 'extract notification helpers',
    getUpdateChangeGroups: () => ({ added: ['notification helper'], updated: [], fixed: [] }),
    getCurrentReleaseChangeGroups: () => ({ added: ['notification helper'], updated: [], fixed: [] })
  });

  assert.equal(helpers.getVerificationRoleId('guild-1'), 'verify-1');

  const accepted = await helpers.sendAcceptanceDm({
    guild: member.guild,
    member,
    moderatorUser: { id: 'mod-1' },
    reason: 'Собеседование',
    rankName: 'Лидер'
  });
  assert.equal(accepted, true);

  await helpers.announceBuildUpdate(member.guild);
  assert.equal(maintenanceUpdates.length, 1);
  assert.equal(sentPayloads.length >= 2, true);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
