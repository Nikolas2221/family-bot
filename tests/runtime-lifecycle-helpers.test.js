const assert = require('node:assert/strict');

const { createRuntimeLifecycleHelpers } = require('../dist-ts/runtime-lifecycle-helpers');

async function main() {
  const voiceSessions = new Map();
  const panelIds = new Map();
  const sentRankDm = [];
  const sentMessages = [];
  const editedMessages = [];
  const persistedVoice = new Map();
  let nextPanelId = 1;

  const guildStorage = {
    getActivityScore: () => 7,
    addVoiceMinutesInChannel: (memberId, minutes, channelId) => {
      const key = `${memberId}:${channelId}`;
      const total = (persistedVoice.get(key) || 0) + minutes;
      persistedVoice.set(key, total);
      return total;
    }
  };

  const member = {
    id: 'user-1',
    user: { bot: false },
    voice: { channelId: 'voice-1' },
    guild: { id: 'guild-1' }
  };

  const membersCache = new Map([[member.id, member]]);
  const messageStore = new Map();
  const channel = {
    messages: {
      fetch: async (messageId) => {
        if (!messageStore.has(messageId)) {
          throw new Error('not found');
        }
        return messageStore.get(messageId);
      }
    },
    send: async (payload) => {
      const id = `panel-${nextPanelId++}`;
      sentMessages.push({ id, payload });
      const message = {
        id,
        edit: async (nextPayload) => {
          editedMessages.push({ id, payload: nextPayload });
          return true;
        }
      };
      messageStore.set(id, message);
      return { id };
    }
  };

  const guild = {
    id: 'guild-1',
    members: {
      cache: {
        values: function* values() {
          yield* membersCache.values();
        },
        get: (id) => membersCache.get(id)
      },
      fetch: async (id) => membersCache.get(id) || null
    }
  };

  const helper = createRuntimeLifecycleHelpers({
    client: {
      guilds: {
        cache: {
          get: (id) => (id === guild.id ? guild : undefined),
          values: function* values() {
            yield guild;
          }
        }
      }
    },
    storage: {
      getGuildPanelMessageId: (guildId, fixedMessageId = '') => panelIds.get(guildId) || fixedMessageId || '',
      setGuildPanelMessageId: (guildId, messageId) => {
        panelIds.set(guildId, messageId);
      }
    },
    embeds: {
      buildFamilyEmbeds: async (_guild, options) => [{ title: 'panel', summary: options.summary }],
      panelButtons: () => ['buttons']
    },
    voiceSessions,
    autoRanks: {
      enabled: true,
      intervalMs: 60000,
      memberMinScore: 50,
      elderMinScore: 150
    },
    fixedGuildId: 'guild-1',
    fixedMessageId: '',
    updateIntervalMs: 60000,
    memberSessionKey: (guildId, memberId) => `${guildId}:${memberId}`,
    getGuildStorage: () => guildStorage,
    getRankService: () => ({
      syncAutoRanks: async () => ({
        changes: [{ memberId: 'user-1', fromRole: { name: 'A' }, toRole: { name: 'B' }, score: 55 }],
        failures: []
      })
    }),
    isPremiumGuild: () => true,
    resolveGuildSettings: () => ({
      channels: { panel: 'panel-channel-1' },
      roles: [{ id: 'role-1' }],
      familyTitle: 'Phoenix',
      visuals: { familyBanner: 'https://example.com/banner.png' }
    }),
    fetchTextChannel: async () => channel,
    buildFamilyDashboardStats: () => ({ topMemberLine: '<@user-1>' }),
    sendRankDm: async (_guild, targetMember, result) => {
      sentRankDm.push({ memberId: targetMember.id, result });
      return true;
    }
  });

  const originalNow = Date.now;
  Date.now = () => 1_000_000;
  helper.startVoiceSession(member);
  assert.equal(voiceSessions.size, 1);
  Date.now = () => 1_000_000 + 61 * 60 * 1000;
  assert.equal(helper.stopVoiceSession(member), 61);
  assert.equal(voiceSessions.size, 0);
  assert.equal(persistedVoice.get('user-1:voice-1'), 61);
  Date.now = originalNow;

  await helper.doPanelUpdate('guild-1', true);
  assert.equal(sentMessages.length, 1);
  assert.equal(panelIds.get('guild-1'), 'panel-1');

  await helper.doPanelUpdate('guild-1', true);
  assert.equal(editedMessages.length, 1);

  await helper.syncAutoRanks('guild-1', 'test');
  assert.equal(sentRankDm.length, 1);
  assert.equal(sentRankDm[0].memberId, 'user-1');
  assert.equal(editedMessages.length, 2);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
