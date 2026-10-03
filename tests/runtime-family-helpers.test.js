const assert = require('node:assert/strict');

const {
  createFamilyRuntimeHelpers,
  isMemberInactive,
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
  const now = 1_800_000_000_000;
  const day = 86_400_000;
  const emptyActivity = { lastSeenAt: 0, lastMessageAt: 0, lastVoiceAt: 0 };
  assert.equal(isMemberInactive(emptyActivity, null, 3 * day, now), false);
  assert.equal(isMemberInactive({ ...emptyActivity, observedSince: now - day }, null, 3 * day, now), false);
  assert.equal(isMemberInactive({ ...emptyActivity, observedSince: now - 4 * day }, null, 3 * day, now), true);
  assert.equal(isMemberInactive({ ...emptyActivity, lastSeenAt: now - 4 * day }, now - day, 3 * day, now), false);
  assert.equal(isMemberInactive({ ...emptyActivity, lastSeenAt: now - 4 * day, lastVoiceAt: now - day }, null, 3 * day, now), false);
  assert.equal(isMemberInactive({ ...emptyActivity, lastSeenAt: now - 3 * day }, null, 3 * day, now), true);
  assert.equal(isMemberInactive({ ...emptyActivity, lastSeenAt: now - 4 * day }, null, NaN, now), false);
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
    resolveGuildSettings: () => ({ visuals: {
      familyBanner: 'https://example.com/banner.png',
      cards: { reports: { discord: { title: 'Custom activity', color: '#123456', footer: 'Custom footer' } } }
    } }),
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
  for (const report of [helpers.buildActivityReportEmbed(guild), helpers.buildActivityReportEmbed(guild, leader), helpers.buildPremiumActivityReportEmbed(guild), helpers.buildPremiumActivityReportEmbed(guild, leader)]) {
    const data = report.toJSON();
    assert.equal(data.title, 'Custom activity');
    assert.equal(data.color, 0x123456);
    assert.equal(data.footer.text, 'Custom footer');
    assert.ok(data.fields.length > 0);
  }
  const oldLeader = memberRecords['1'];
  memberRecords['1'] = { ...oldLeader, lastSeenAt: 0, observedSince: Date.now() };
  assert.equal(helpers.buildFamilyDashboardStats(guild).afkRiskCount, 1);
  memberRecords['1'] = oldLeader;
  for (let i = 4; i <= 30; i += 1) {
    const extra = buildMember(String(i), `Extra ${i}`, ['role-leader']);
    guild.members.cache.set(extra.id, extra);
    memberRecords[extra.id] = { lastSeenAt: Date.now() };
  }
  const largeReport = helpers.buildActivityReportEmbed(guild).toJSON();
  assert.match(largeReport.description, /29$/u);
  for (let i = 4; i <= 30; i += 1) guild.members.cache.delete(String(i));

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
