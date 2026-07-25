const assert = require('node:assert/strict');

const { registerInteractionRuntime } = require('../dist-ts/interaction-runtime');

function createOptions(calls) {
  const listenerBox = {};
  const guild = {
    id: 'guild-1',
    members: {
      fetch: async (id) => ({ id, guild, permissions: { has: () => true } })
    }
  };
  const targetMember = { id: 'target-1', guild };

  return {
    guild,
    targetMember,
    options: {
      client: {
        removeAllListeners() {},
        on(event, listener) {
          listenerBox[event] = listener;
        }
      },
      handleCommand: async () => false,
      applicationCooldownMs: 0,
      ephemeral: payload => payload,
      copy: {
        common: { noAccess: 'no access', unknownError: 'unknown' },
        profile: { notFound: 'not found' },
        admin: { premiumOnly: 'premium only' },
        ai: { unavailable: message => message, advisorUnavailable: 'ai unavailable' }
      },
      embeds: {},
      database: {},
      aiService: {},
      EmbedBuilderCtor: class {},
      resolveGuildSettings: () => ({ channels: {}, verification: { enabled: true } }),
      getGuildRecord: () => ({}),
      getGuildStorage: () => ({
        addCommend(payload) {
          calls.commends.push(payload);
        },
        addWarn(payload) {
          calls.warns.push(payload);
        }
      }),
      getApplicationsService: () => ({}),
      getRankService: () => ({}),
      canDebugConfig: () => true,
      canApplications: () => true,
      canManageRanks: () => true,
      canUseSecurity: () => true,
      isPremiumGuild: () => true,
      fetchTextChannel: async () => null,
      fetchMemberFast: async () => targetMember,
      refreshMember: async member => member,
      sendWelcomeInvite: async () => {},
      sendRankDm: async () => {},
      getVerificationRoleId: () => '',
      applyVerificationRole: async () => ({ ok: true }),
      getRoleMenuEntries: () => [],
      findRoleMenu: () => null,
      saveRoleMenu() {},
      removeRoleMenuItem() {},
      getCustomCommands: () => [],
      getReactionRoleEntries: () => [],
      normalizeReactionEmoji: value => value || '',
      buildProfilePayload: (member, allowRankButtons, content) => ({ content, embeds: [{ memberId: member.id, allowRankButtons }] }),
      buildLeaderboardLines: () => [],
      buildLeaderboardSummary: () => '',
      buildVoiceActivityLines: () => [],
      buildVoiceActivitySummary: () => '',
      buildPremiumActivityReportEmbed: () => ({}),
      buildAiAdvisorEmbed: async () => ({}),
      resolveMemberQuery: async () => targetMember,
      formatRankResult: () => '',
      syncAutoRanks: async () => {},
      doPanelUpdate: async () => {},
      sendScheduledReport: async () => false,
      getHelpCatalog: () => ({}),
      supportTicketService: { handleInteraction: async () => false },
      afkLeaveService: { handleInteraction: async () => false },
      reportRequestService: { handleInteraction: async () => false },
      mediaShareService: { handleInteraction: async () => false },
      voiceRoomsService: { handleInteraction: async () => false }
    },
    listenerBox
  };
}

function createModal(customId, guild) {
  const replies = [];
  return {
    guild,
    guildId: guild.id,
    customId,
    member: { guild, permissions: { has: () => true } },
    user: { id: 'mod-1' },
    replied: false,
    deferred: false,
    isRepliable: () => true,
    isModalSubmit: () => true,
    isButton: () => false,
    isChatInputCommand: () => false,
    fields: {
      getTextInputValue: () => 'reason text'
    },
    async reply(payload) {
      this.replied = true;
      replies.push(payload);
    },
    _replies: replies
  };
}

async function main() {
  const calls = { commends: [], warns: [] };
  const { guild, options, listenerBox } = createOptions(calls);
  registerInteractionRuntime(options);

  await listenerBox.interactionCreate(createModal('profile_points_modal:target-1', guild));
  assert.equal(calls.commends.length, 1);
  assert.equal(calls.commends[0].userId, 'target-1');
  assert.equal(calls.commends[0].moderatorId, 'mod-1');

  await listenerBox.interactionCreate(createModal('profile_warn_modal:target-1', guild));
  assert.equal(calls.warns.length, 1);
  assert.equal(calls.warns[0].userId, 'target-1');
  assert.equal(calls.warns[0].moderatorId, 'mod-1');

  console.log('ALL PROFILE MODAL RUNTIME TESTS PASSED');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
