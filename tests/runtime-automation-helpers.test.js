const assert = require('node:assert/strict');

const { createAutomationRuntimeHelpers } = require('../dist-ts/runtime-automation-helpers');

async function main() {
  const sentPayloads = [];
  const automodLogs = [];
  const reportMarkers = new Map();
  const settingsState = {
    roleMenus: [],
    customCommands: [
      { trigger: 'привет', response: 'И тебе привет', mode: 'contains' }
    ],
    reportSchedule: {
      weekly: { enabled: true, channelId: 'reports-1' },
      monthly: { enabled: false, channelId: 'reports-1' }
    },
    channels: {
      reports: 'reports-1'
    },
    automod: {
      spamEnabled: false,
      actionMode: 'soft',
      timeoutMinutes: 10,
      spamCount: 3
    }
  };

  const database = {
    updateGuildSettings: (_guildId, patch) => {
      if (Array.isArray(patch.roleMenus)) {
        settingsState.roleMenus = patch.roleMenus;
      }
    }
  };

  const helper = createAutomationRuntimeHelpers({
    database,
    automodState: new Map(),
    copy: {
      automod: {
        notice: (userId, ruleLabel, detail = '') => `${userId}:${ruleLabel}:${detail}`,
        ruleLabel: (rule) => `rule:${rule}`
      }
    },
    resolveGuildSettings: () => settingsState,
    isModuleEnabled: () => true,
    isPremiumGuild: () => true,
    getGuildStorage: () => ({
      getReportMarker: (key) => reportMarkers.get(key) || '',
      setReportMarker: (key, value) => reportMarkers.set(key, value)
    }),
    fetchTextChannel: async (_guild, channelId) => ({
      id: channelId,
      send: async (payload) => {
        sentPayloads.push({ channelId, payload });
        return { id: `message-${sentPayloads.length}` };
      }
    }),
    buildServerStatsReportEmbed: (_guild, period) => ({ title: `report:${period}` }),
    getWeeklyReportKey: () => 'weekly-key',
    getMonthlyReportKey: () => 'monthly-key',
    isScheduledReportDue: (period) => period === 'weekly',
    fetchGuild: async (guildId) => ({
      id: guildId,
      name: 'Phoenix'
    }),
    evaluateAutomodMessage: ({ content }) =>
      String(content || '').includes('bad') ? { rule: 'badWords', detail: 'bad' } : null,
    evaluateSpamActivity: (current) => ({ recent: current, triggered: false }),
    getAutomodStateKey: (guildId, memberId) => `${guildId}:${memberId}`,
    canBypassAutomod: () => false,
    sendAutomodLog: async (_guild, payload) => {
      automodLogs.push(payload);
    }
  });

  assert.equal(helper.findRoleMenu('guild-1', 'main'), null);
  helper.saveRoleMenu('guild-1', { menuId: 'main', items: [{ roleId: 'role-a' }, { roleId: 'role-b' }] });
  assert.equal(helper.getRoleMenuEntries('guild-1').length, 1);
  assert.equal(helper.findRoleMenu('guild-1', 'main').items.length, 2);
  helper.removeRoleMenuItem('guild-1', 'main', 'role-a');
  assert.equal(helper.findRoleMenu('guild-1', 'main').items.length, 1);

  const triggerMessage = {
    guild: { id: 'guild-1' },
    author: { bot: false },
    content: 'ну привет всем',
    channel: {
      send: async (payload) => {
        sentPayloads.push({ channelId: 'custom-1', payload });
        return { id: `message-${sentPayloads.length}` };
      }
    }
  };
  assert.equal(await helper.handleCustomTriggerMessage(triggerMessage), true);
  assert.equal(sentPayloads.at(-1).payload.content, 'И тебе привет');

  const guild = { id: 'guild-1', name: 'Phoenix' };
  assert.equal(await helper.sendScheduledReport(guild, 'weekly', 'reports-1'), true);
  assert.equal(sentPayloads.at(-1).payload.embeds[0].title, 'report:weekly');

  await helper.runScheduledReports('guild-1', new Date('2026-04-25T12:00:00Z'));
  assert.equal(reportMarkers.get('scheduled:weekly'), 'weekly-key');
  const reportCountAfterFirstRun = sentPayloads.filter((entry) => entry.payload.embeds).length;
  await helper.runScheduledReports('guild-1', new Date('2026-04-25T12:00:00Z'));
  const reportCountAfterSecondRun = sentPayloads.filter((entry) => entry.payload.embeds).length;
  assert.equal(reportCountAfterSecondRun, reportCountAfterFirstRun);

  const automodMessage = {
    guild: { id: 'guild-1', name: 'Phoenix' },
    member: {
      moderatable: false
    },
    author: { id: 'user-1' },
    content: 'this contains bad word',
    mentions: { users: { size: 0 } },
    channel: {
      id: 'channel-1',
      send: async (payload) => {
        sentPayloads.push({ channelId: 'channel-1', payload });
        return { delete: async () => true };
      }
    },
    delete: async () => true
  };

  assert.equal(await helper.handleAutomodMessage(automodMessage), true);
  assert.equal(automodLogs.length, 1);
  assert.match(automodLogs[0].detail, /soft/u);
  assert.match(sentPayloads.at(-1).payload.content, /rule:badWords/u);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
