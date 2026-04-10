const assert = require('node:assert/strict');

const {
  createFamilyRuntimeHelpers,
  formatTimeAgo,
  formatVoiceHours
} = require('../dist-ts/runtime-family-helpers');

function buildMember(id, displayName, roleIds, status = 'offline', isBot = false) {
  return {
    id,
    displayName,
    user: { bot: isBot },
    presence: { status },
    guild: { id: 'guild-1' },
    roles: {
      cache: roleIds.map((roleId) => ({ id: roleId }))
    }
  };
}

async function main() {
  assert.equal(formatVoiceHours(90), '1.5');
  assert.equal(formatTimeAgo(0), 'нет данных');
  assert.match(formatTimeAgo(Date.now() - 5 * 60 * 1000), /назад/u);

  const leader = buildMember('1', 'Alpha', ['role-leader'], 'online');
  const deputy = buildMember('2', 'Bravo', ['role-deputy'], 'idle');
  const outsider = buildMember('3', 'Charlie', ['other-role'], 'offline');

  const guild = {
    id: 'guild-1',
    name: 'Phoenix',
    members: {
      cache: new Map([
        [leader.id, leader],
        [deputy.id, deputy],
        [outsider.id, outsider]
      ])
    }
  };

  const memberRecords = {
    '1': { messageCount: 10, commends: 1, warns: 0, lastSeenAt: Date.now() - 60_000 },
    '2': { messageCount: 4, commends: 0, warns: 1, lastSeenAt: Date.now() - 4 * 24 * 60 * 60 * 1000 },
    '3': { messageCount: 1, commends: 0, warns: 0, lastSeenAt: Date.now() - 10_000 }
  };

  const guildStorage = {
    listRecentApplications: () => [{ status: 'pending' }, { status: 'review' }, { status: 'accepted' }],
    ensureMemberRecord: (memberId) => memberRecords[memberId],
    getActivityScore: (memberId) => ({ '1': 15, '2': 7, '3': 1 }[memberId] || 0),
    getPointsScore: (memberId) => ({ '1': 5, '2': 3, '3': 1 }[memberId] || 0),
    getVoiceMinutes: (memberId) => ({ '1': 120, '2': 30, '3': 0 }[memberId] || 0)
  };

  const helpers = createFamilyRuntimeHelpers({
    copy: {
      admin: { panelPremium: 'Premium - 5$', panelFree: 'Free - 0$' },
      profile: { noRoles: 'Без ролей' },
      stats: {
        leaderboardLine: (index, member, roleName, points, voiceHours) =>
          `${index + 1}. ${roleName} ${member.displayName} ${points}/${voiceHours}`,
        voiceLine: (index, member, hours, points) =>
          `${index + 1}. ${member.displayName} ${hours}ч ${points}/100`
      }
    },
    voiceSessions: new Map(),
    afkWarningThresholdMs: 3 * 24 * 60 * 60 * 1000,
    getGuildStorage: () => guildStorage,
    getRoleIds: () => ['role-leader', 'role-deputy'],
    getRankService: () => ({
      getCurrentRole: (member) =>
        member.id === '1' ? { name: 'Лидер' } : member.id === '2' ? { name: 'Заместитель' } : null
    }),
    isPremiumGuild: () => true,
    resolveGuildSettings: () => ({ visuals: { familyBanner: 'https://example.com/banner.png' } }),
    memberSessionKey: (guildId, memberId) => `${guildId}:${memberId}`,
    EmbedBuilderCtor: require('discord.js').EmbedBuilder
  });

  const stats = helpers.buildFamilyDashboardStats(guild);
  assert.equal(stats.totalMembers, 3);
  assert.equal(stats.membersWithFamilyRoles, 2);
  assert.equal(stats.membersWithoutFamilyRoles, 1);
  assert.equal(stats.pendingApplications, 2);
  assert.equal(stats.afkRiskCount, 1);
  assert.equal(stats.planLabel, 'Premium - 5$');

  const leaderboard = helpers.buildLeaderboardLines(guild, 5);
  assert.equal(leaderboard.length, 2);
  assert.match(leaderboard[0], /Лидер/u);

  const voiceSummary = helpers.buildVoiceActivitySummary(guild);
  assert.equal(voiceSummary.memberCount, 2);
  assert.equal(voiceSummary.imageUrl, 'https://example.com/banner.png');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
