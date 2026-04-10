import { EmbedBuilder, type Guild, type GuildMember } from 'discord.js';
import type { CopyCatalog, GuildStorageContext, RankService } from './types';

interface VoiceSessionState {
  startedAt?: number;
}

interface FamilyRuntimeSettings {
  visuals?: {
    familyBanner?: string;
  };
}

interface FamilyRuntimeHelpersOptions {
  copy: CopyCatalog;
  voiceSessions: Map<string, VoiceSessionState>;
  afkWarningThresholdMs: number;
  getGuildStorage(guildId: string): GuildStorageContext;
  getRoleIds(guildId: string): string[];
  getRankService(guildId: string): RankService;
  isPremiumGuild(guildId: string): boolean;
  resolveGuildSettings(guildId: string): FamilyRuntimeSettings;
  memberSessionKey(guildId: string, memberId: string): string;
  EmbedBuilderCtor: typeof EmbedBuilder;
}

function getRoleName(rankService: RankService, member: GuildMember): string {
  const currentRole = rankService.getCurrentRole(member) as { name?: string } | null | undefined;
  return currentRole?.name || 'Без ролей';
}

export function formatVoiceHours(minutes: number): string {
  return (Math.max(0, Number(minutes) || 0) / 60).toFixed(1);
}

export function formatTimeAgo(timestamp: number): string {
  const safeTimestamp = Number(timestamp) || 0;
  if (!safeTimestamp) return 'нет данных';

  const diff = Math.max(0, Date.now() - safeTimestamp);
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

  if (days > 0) return `${days}д ${hours}ч назад`;
  if (hours > 0) return `${hours}ч ${minutes}м назад`;
  return `${minutes}м назад`;
}

export function createFamilyRuntimeHelpers(options: FamilyRuntimeHelpersOptions) {
  const {
    copy,
    voiceSessions,
    afkWarningThresholdMs,
    getGuildStorage,
    getRoleIds,
    getRankService,
    isPremiumGuild,
    resolveGuildSettings,
    memberSessionKey,
    EmbedBuilderCtor
  } = options;

  function hasFamilyRole(member: GuildMember): boolean {
    const roleIds = new Set(getRoleIds(member.guild.id));
    return member.roles.cache.some((role) => roleIds.has(role.id));
  }

  function getLiveVoiceMinutes(member: GuildMember): number {
    const guildStorage = getGuildStorage(member.guild.id);
    const storedMinutes = guildStorage.getVoiceMinutes(member.id);
    const session = voiceSessions.get(memberSessionKey(member.guild.id, member.id));
    if (!session?.startedAt) return storedMinutes;

    return storedMinutes + Math.floor((Date.now() - session.startedAt) / 60000);
  }

  function getDisplayRankName(member: GuildMember): string {
    return getRoleName(getRankService(member.guild.id), member) || copy.profile.noRoles;
  }

  function getFamilyMembers(guild: Guild): GuildMember[] {
    return Array.from(guild.members.cache.values()).filter(
      (member) => !member.user?.bot && hasFamilyRole(member)
    );
  }

  function buildFamilyDashboardStats(guild: Guild) {
    const guildStorage = getGuildStorage(guild.id);
    const allMembers = Array.from(guild.members.cache.values()).filter((member) => !member.user?.bot);
    const familyMembers = getFamilyMembers(guild);
    const pendingApplications = guildStorage
      .listRecentApplications(500)
      .filter((application) => application.status === 'pending' || application.status === 'review').length;

    let onlineCount = 0;
    let idleCount = 0;
    let dndCount = 0;
    let offlineCount = 0;

    for (const member of familyMembers) {
      const status = member.presence?.status || 'offline';
      if (status === 'online') {
        onlineCount += 1;
      } else if (status === 'idle') {
        idleCount += 1;
      } else if (status === 'dnd') {
        dndCount += 1;
      } else {
        offlineCount += 1;
      }
    }

    const afkRiskCount = familyMembers.filter((member) => {
      const data = guildStorage.ensureMemberRecord(member.id);
      return Date.now() - Number(data.lastSeenAt || 0) >= afkWarningThresholdMs;
    }).length;

    const topEntry = familyMembers
      .map((member) => ({
        member,
        activity: guildStorage.getActivityScore(member.id),
        points: guildStorage.getPointsScore(member.id)
      }))
      .sort((left, right) => {
        const byActivity = right.activity - left.activity;
        if (byActivity !== 0) return byActivity;

        const byPoints = right.points - left.points;
        if (byPoints !== 0) return byPoints;

        return left.member.displayName.localeCompare(right.member.displayName, 'ru');
      })[0];

    return {
      totalMembers: allMembers.length,
      membersWithFamilyRoles: familyMembers.length,
      membersWithoutFamilyRoles: Math.max(0, allMembers.length - familyMembers.length),
      pendingApplications,
      afkRiskCount,
      planLabel: isPremiumGuild(guild.id) ? copy.admin.panelPremium : copy.admin.panelFree,
      onlineCount,
      idleCount,
      dndCount,
      offlineCount,
      topMemberLine: topEntry
        ? `<@${topEntry.member.id}> - ${getDisplayRankName(topEntry.member)} - ${Math.max(0, topEntry.activity)} очк.`
        : '',
      lastUpdatedLabel: new Date().toLocaleString('ru-RU')
    };
  }

  function buildLeaderboardLines(guild: Guild, limit = 10): string[] {
    const guildStorage = getGuildStorage(guild.id);

    return getFamilyMembers(guild)
      .map((member) => ({
        member,
        points: guildStorage.getPointsScore(member.id),
        voiceHours: Number(formatVoiceHours(getLiveVoiceMinutes(member))),
        roleName: getDisplayRankName(member)
      }))
      .sort((left, right) => {
        const byPoints = right.points - left.points;
        if (byPoints !== 0) return byPoints;

        const byVoice = right.voiceHours - left.voiceHours;
        if (byVoice !== 0) return byVoice;

        return left.member.displayName.localeCompare(right.member.displayName, 'ru');
      })
      .slice(0, limit)
      .map((entry, index) =>
        copy.stats.leaderboardLine(index, entry.member, entry.roleName, entry.points, entry.voiceHours)
      );
  }

  function buildVoiceActivityLines(guild: Guild, limit = 10): string[] {
    const guildStorage = getGuildStorage(guild.id);

    return getFamilyMembers(guild)
      .map((member) => ({
        member,
        hours: Number(formatVoiceHours(getLiveVoiceMinutes(member))),
        points: guildStorage.getPointsScore(member.id)
      }))
      .sort((left, right) => {
        const byHours = right.hours - left.hours;
        if (byHours !== 0) return byHours;

        const byPoints = right.points - left.points;
        if (byPoints !== 0) return byPoints;

        return left.member.displayName.localeCompare(right.member.displayName, 'ru');
      })
      .slice(0, limit)
      .map((entry, index) => copy.stats.voiceLine(index, entry.member, entry.hours, entry.points));
  }

  function buildLeaderboardSummary(guild: Guild) {
    const guildStorage = getGuildStorage(guild.id);
    const settings = resolveGuildSettings(guild.id);
    const members = getFamilyMembers(guild);
    const ranked = members
      .map((member) => ({
        member,
        points: guildStorage.getPointsScore(member.id),
        voiceHours: Number(formatVoiceHours(getLiveVoiceMinutes(member))),
        roleName: getDisplayRankName(member)
      }))
      .sort((left, right) => {
        const byPoints = right.points - left.points;
        if (byPoints !== 0) return byPoints;

        const byVoice = right.voiceHours - left.voiceHours;
        if (byVoice !== 0) return byVoice;

        return left.member.displayName.localeCompare(right.member.displayName, 'ru');
      });

    const totalPoints = ranked.reduce((sum, item) => sum + item.points, 0);
    const totalVoiceHours = ranked.reduce((sum, item) => sum + item.voiceHours, 0);
    const topEntry = ranked[0];

    return {
      memberCount: ranked.length,
      planLabel: isPremiumGuild(guild.id) ? copy.admin.panelPremium : copy.admin.panelFree,
      topLine: topEntry ? `<@${topEntry.member.id}> - ${topEntry.roleName} - ${topEntry.points}/100` : '',
      averagePoints: ranked.length ? (totalPoints / ranked.length).toFixed(1) : '0.0',
      totalPoints,
      totalVoiceHours: totalVoiceHours.toFixed(1),
      imageUrl: settings.visuals?.familyBanner || ''
    };
  }

  function buildVoiceActivitySummary(guild: Guild) {
    const guildStorage = getGuildStorage(guild.id);
    const settings = resolveGuildSettings(guild.id);
    const members = getFamilyMembers(guild);
    const ranked = members
      .map((member) => ({
        member,
        hours: Number(formatVoiceHours(getLiveVoiceMinutes(member))),
        points: guildStorage.getPointsScore(member.id)
      }))
      .sort((left, right) => {
        const byHours = right.hours - left.hours;
        if (byHours !== 0) return byHours;

        const byPoints = right.points - left.points;
        if (byPoints !== 0) return byPoints;

        return left.member.displayName.localeCompare(right.member.displayName, 'ru');
      });

    const totalHours = ranked.reduce((sum, item) => sum + item.hours, 0);
    const totalPoints = ranked.reduce((sum, item) => sum + item.points, 0);
    const topEntry = ranked[0];

    return {
      memberCount: ranked.length,
      planLabel: isPremiumGuild(guild.id) ? copy.admin.panelPremium : copy.admin.panelFree,
      topLine: topEntry ? `<@${topEntry.member.id}> - ${topEntry.hours.toFixed(1)} ч - ${topEntry.points}/100` : '',
      totalHours: totalHours.toFixed(1),
      averageHours: ranked.length ? (totalHours / ranked.length).toFixed(1) : '0.0',
      totalPoints,
      imageUrl: settings.visuals?.familyBanner || ''
    };
  }

  function buildActivityReportEmbed(guild: Guild, targetMember: GuildMember | null = null) {
    const guildStorage = getGuildStorage(guild.id);

    if (targetMember) {
      const data = guildStorage.ensureMemberRecord(targetMember.id);
      return new EmbedBuilderCtor()
        .setColor(0x2563eb)
        .setTitle(`Отчёт по участнику: ${targetMember.displayName}`)
        .setDescription(`Сервер: **${guild.name}**`)
        .addFields(
          { name: 'Ранг', value: getDisplayRankName(targetMember), inline: true },
          { name: 'Репутация', value: `${guildStorage.getPointsScore(targetMember.id)}/100`, inline: true },
          { name: 'Последняя активность', value: formatTimeAgo(data.lastSeenAt), inline: true },
          {
            name: 'Статистика',
            value: [
              `Сообщения: ${data.messageCount || 0}`,
              `Похвалы: ${data.commends || 0}`,
              `Преды: ${data.warns || 0}`,
              `Голос: ${formatVoiceHours(getLiveVoiceMinutes(targetMember))} ч`
            ].join('\n')
          }
        )
        .setFooter({ text: 'BRHD - Phoenix - Activity Report' })
        .setTimestamp();
    }

    const lines = getFamilyMembers(guild)
      .map((member) => {
        const data = guildStorage.ensureMemberRecord(member.id);
        return {
          member,
          line: `${getDisplayRankName(member)} - <@${member.id}> - ${guildStorage.getPointsScore(member.id)}/100 - ${formatVoiceHours(getLiveVoiceMinutes(member))} ч - ${formatTimeAgo(data.lastSeenAt)}`
        };
      })
      .sort((left, right) => left.member.displayName.localeCompare(right.member.displayName, 'ru'))
      .slice(0, 25)
      .map((item) => item.line);

    return new EmbedBuilderCtor()
      .setColor(0x7c3aed)
      .setTitle('Отчёт по активности семьи')
      .setDescription(`Сервер: **${guild.name}**\nУчастников с семейными ролями: ${lines.length}`)
      .addFields({
        name: 'Список',
        value: lines.length ? lines.join('\n').slice(0, 1024) : 'Нет участников с семейными ролями.'
      })
      .setFooter({ text: 'BRHD - Phoenix - Activity Report' })
      .setTimestamp();
  }

  function buildPremiumActivityReportEmbed(guild: Guild, targetMember: GuildMember | null = null) {
    const guildStorage = getGuildStorage(guild.id);
    const settings = resolveGuildSettings(guild.id);
    const familyBanner = settings.visuals?.familyBanner || '';

    if (targetMember) {
      const data = guildStorage.ensureMemberRecord(targetMember.id);
      const reputation = guildStorage.getPointsScore(targetMember.id);
      const voiceHours = formatVoiceHours(getLiveVoiceMinutes(targetMember));
      const embed = new EmbedBuilderCtor()
        .setColor(0x2563eb)
        .setTitle(`Отчёт по участнику - ${targetMember.displayName}`)
        .setDescription(
          [
            `Сервер: **${guild.name}**`,
            `Ранг: **${getDisplayRankName(targetMember)}**`,
            `Статус: ${targetMember.presence?.status || 'offline'}`,
            `Последняя активность: **${formatTimeAgo(data.lastSeenAt)}**`
          ].join('\n')
        )
        .addFields(
          {
            name: 'Сводка',
            value: [
              `Репутация: ${reputation}/100`,
              `Голос: ${voiceHours} ч`,
              `Сообщения: ${data.messageCount || 0}`
            ].join('\n'),
            inline: true
          },
          {
            name: 'Дисциплина',
            value: [
              `Похвалы: ${data.commends || 0}`,
              `Преды: ${data.warns || 0}`,
              `Актив-очки: ${guildStorage.getActivityScore(targetMember.id)}`
            ].join('\n'),
            inline: true
          },
          {
            name: 'Рекомендация',
            value: [
              reputation >= 70 ? 'Участник держит сильную репутацию.' : 'Репутация требует внимания.',
              (data.warns || 0) >= 3 ? 'Есть дисциплинарный риск.' : 'Критичных дисциплинарных рисков нет.',
              Number(voiceHours) >= 3 || (data.messageCount || 0) >= 25 ? 'Активность выше среднего.' : 'Есть запас по активности.'
            ].join('\n')
          }
        )
        .setFooter({ text: 'BRHD - Phoenix - Premium Activity' })
        .setTimestamp();

      if (familyBanner) {
        embed.setImage(familyBanner);
      }

      return embed;
    }

    const members = getFamilyMembers(guild);
    const lines = members
      .map((member) => {
        const data = guildStorage.ensureMemberRecord(member.id);
        return `${getDisplayRankName(member)} - <@${member.id}> - ${guildStorage.getPointsScore(member.id)}/100 - ${formatVoiceHours(getLiveVoiceMinutes(member))} ч - ${formatTimeAgo(data.lastSeenAt)}`;
      })
      .sort((left, right) => left.localeCompare(right, 'ru'))
      .slice(0, 25);

    const totalPoints = members.reduce((sum, member) => sum + guildStorage.getPointsScore(member.id), 0);
    const totalVoiceHours = members.reduce(
      (sum, member) => sum + Number(formatVoiceHours(getLiveVoiceMinutes(member))),
      0
    );
    const afkRiskCount = members.filter((member) => {
      const data = guildStorage.ensureMemberRecord(member.id);
      return Date.now() - Number(data.lastSeenAt || 0) >= afkWarningThresholdMs;
    }).length;

    const embed = new EmbedBuilderCtor()
      .setColor(0x7c3aed)
      .setTitle('Отчёт по активности семьи - Phoenix')
      .setDescription(
        [
          `Сервер: **${guild.name}**`,
          `Участников с семейными ролями: **${members.length}**`,
          `AFK-рисков: **${afkRiskCount}**`
        ].join('\n')
      )
      .addFields(
        {
          name: 'Сводка',
          value: [
            `Средняя репутация: ${members.length ? (totalPoints / members.length).toFixed(1) : '0.0'}/100`,
            `Суммарная репутация: ${totalPoints}`,
            `Суммарный голос: ${totalVoiceHours.toFixed(1)} ч`
          ].join('\n'),
          inline: true
        },
        {
          name: 'Список',
          value: lines.length ? lines.join('\n').slice(0, 1024) : 'Нет участников с семейными ролями.'
        }
      )
      .setFooter({ text: 'BRHD - Phoenix - Premium Activity' })
      .setTimestamp();

    if (familyBanner) {
      embed.setImage(familyBanner);
    }

    return embed;
  }

  return {
    buildActivityReportEmbed,
    buildFamilyDashboardStats,
    buildLeaderboardLines,
    buildLeaderboardSummary,
    buildPremiumActivityReportEmbed,
    buildVoiceActivityLines,
    buildVoiceActivitySummary,
    formatTimeAgo,
    formatVoiceHours,
    getDisplayRankName,
    getFamilyMembers,
    getLiveVoiceMinutes,
    hasFamilyRole
  };
}
