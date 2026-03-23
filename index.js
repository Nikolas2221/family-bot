require('dotenv').config();

const path = require('path');
const { ChannelType, Client, EmbedBuilder, GatewayIntentBits, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { createAIService } = require('./ai');
const { createApplicationsService } = require('./applications');
const { registerCommands } = require('./commands');
const { createConfig, printStartupDiagnostics, summarizeConfig, validateConfig } = require('./config');
const copy = require('./copy');
const { createDatabase } = require('./database');
const embeds = require('./embeds');
const { createRankService } = require('./ranks');
const ROLES = require('./roles');
const { containsDiscordInvite, explainKickFailure, fetchDeletedChannelExecutor, restoreDeletedChannel } = require('./security');
const { createStorage } = require('./storage');

const config = createConfig(process.env);
const diagnostics = validateConfig(config);
const DATA_FILE = config.storageFile || path.join(__dirname, 'storage.json');
const DATABASE_FILE = config.databaseFile || path.join(__dirname, 'database.json');

printStartupDiagnostics(config, diagnostics);

if (diagnostics.errors.length) {
  process.exit(1);
}

const GUILD_ID = config.guildId;
const CHANNEL_ID = config.channelId;
const APPLICATIONS_CHANNEL_ID = config.applicationsChannelId;
const LOG_CHANNEL_ID = config.logChannelId;
const DISCIPLINE_LOG_CHANNEL_ID = config.disciplineLogChannelId;
const MESSAGE_ID = config.messageId;
const UPDATE_INTERVAL_MS = config.updateIntervalMs;
const APPLICATION_COOLDOWN_MS = config.applicationCooldownMs;
const APPLICATION_DEFAULT_ROLE = config.applicationDefaultRole;
const FAMILY_TITLE = config.familyTitle;
const ACCESS_APPLICATIONS = config.accessApplications;
const ACCESS_DISCIPLINE = config.accessDiscipline;
const ACCESS_RANKS = config.accessRanks;
const AI_ENABLED = config.aiEnabled;
const AUTO_RANKS = config.autoRanks;
const LEAK_GUARD = config.leakGuard;
const CHANNEL_GUARD = config.channelGuard;
const ROLELESS_CLEANUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const AFK_WARNING_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
const AFK_WARNING_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const storage = createStorage({ dataFile: DATA_FILE });
const database = createDatabase({ dataFile: DATABASE_FILE });
const aiService = createAIService({ enabled: AI_ENABLED });
const ROLE_TEMPLATES = ROLES.map(role => ({ ...role }));

function ephemeral(payload = {}) {
  return { ...payload, flags: MessageFlags.Ephemeral };
}

function scheduleDeleteReply(interaction, delayMs = 5000) {
  setTimeout(async () => {
    try {
      await interaction.deleteReply();
      return;
    } catch (_) {
      // Fall through to webhook cleanup.
    }

    try {
      await interaction.webhook?.deleteMessage('@original');
    } catch (_) {
      // Ignore cleanup failures for temporary moderation replies.
    }
  }, delayMs);
}

async function replyAndAutoDelete(interaction, payload, delayMs = 5000) {
  const response = await interaction.reply(ephemeral(payload));
  scheduleDeleteReply(interaction, delayMs);
  return response;
}

async function editReplyAndAutoDelete(interaction, payload, delayMs = 5000) {
  const response = await interaction.editReply(payload);
  scheduleDeleteReply(interaction, delayMs);
  return response;
}

function memberSessionKey(guildId, memberId) {
  return `${guildId}:${memberId}`;
}

function resolveGuildSettings(guildId) {
  const guild = database.getGuild(guildId);
  const settings = guild.settings || {};
  const roles = ROLE_TEMPLATES.map(role => ({
    ...role,
    id: settings.roles?.[role.key] || role.id || ''
  }));
  const panel = settings.channels?.panel || CHANNEL_ID;
  const logs = settings.channels?.logs || LOG_CHANNEL_ID;

  return {
    familyTitle: settings.familyTitle || FAMILY_TITLE,
    channels: {
      panel,
      applications: settings.channels?.applications || APPLICATIONS_CHANNEL_ID || panel,
      logs,
      disciplineLogs: settings.channels?.disciplineLogs || DISCIPLINE_LOG_CHANNEL_ID || logs || ''
    },
    roles,
    access: {
      applications: settings.access?.applications?.length ? settings.access.applications : ACCESS_APPLICATIONS,
      discipline: settings.access?.discipline?.length ? settings.access.discipline : ACCESS_DISCIPLINE,
      ranks: settings.access?.ranks?.length ? settings.access.ranks : ACCESS_RANKS
    },
    muteRoleId: settings.roles?.mute || '',
    visuals: {
      familyBanner: settings.visuals?.familyBanner || '',
      applicationsBanner: settings.visuals?.applicationsBanner || ''
    },
    applicationDefaultRole: settings.roles?.newbie || APPLICATION_DEFAULT_ROLE
  };
}

function getRoleIds(guildId) {
  return resolveGuildSettings(guildId).roles.map(role => role.id).filter(Boolean);
}

function getGuildStorage(guildId) {
  return {
    ensureMember(memberId) {
      return storage.ensureGuildMember(guildId, memberId);
    },
    activityScore(memberId) {
      return storage.guildActivityScore(guildId, memberId);
    },
    pointsScore(memberId) {
      return storage.guildPointsScore(guildId, memberId);
    },
    voiceMinutes(memberId) {
      return storage.guildVoiceMinutes(guildId, memberId);
    },
    addVoiceMinutes(memberId, minutes) {
      return storage.addGuildVoiceMinutes(guildId, memberId, minutes);
    },
    trackMessage(memberId) {
      return storage.trackGuildMessage(guildId, memberId);
    },
    trackPresence(memberId) {
      return storage.trackGuildPresence(guildId, memberId);
    },
    addWarn({ userId, moderatorId, reason }) {
      return storage.addGuildWarn({ guildId, userId, moderatorId, reason });
    },
    listWarns(userId, limit = 10) {
      return storage.listGuildWarnsForUser(guildId, userId, limit);
    },
    clearWarns(userId) {
      return storage.clearGuildWarnsForUser(guildId, userId);
    },
    addCommend({ userId, moderatorId, reason }) {
      return storage.addGuildCommend({ guildId, userId, moderatorId, reason });
    },
    getCooldown(userId) {
      return storage.getGuildCooldown(guildId, userId);
    },
    setCooldown(userId, value) {
      return storage.setGuildCooldown(guildId, userId, value);
    },
    createApplication({ userId, nickname, level, inviter, discovery, about, age, text }) {
      return storage.createGuildApplication({
        guildId,
        userId,
        nickname,
        level,
        inviter,
        discovery,
        about,
        age,
        text
      });
    },
    findApplication(applicationId) {
      return storage.findGuildApplication(guildId, applicationId);
    },
    setApplicationTicketInfo(application, ticketInfo) {
      return storage.setApplicationTicketInfo(application, ticketInfo);
    },
    listRecentApplications(limit) {
      return storage.listGuildRecentApplications(guildId, limit);
    },
    listBlacklist() {
      return storage.listGuildBlacklist(guildId);
    },
    getBlacklistEntry(userId) {
      return storage.getGuildBlacklistEntry(guildId, userId);
    },
    isBlacklisted(userId) {
      return storage.isGuildBlacklisted(guildId, userId);
    },
    addBlacklistEntry({ userId, moderatorId, reason }) {
      return storage.addGuildBlacklistEntry({ guildId, userId, moderatorId, reason });
    },
    removeBlacklistEntry(userId) {
      return storage.removeGuildBlacklistEntry(guildId, userId);
    },
    markAfkWarningSent(memberId, value) {
      return storage.markGuildAfkWarningSent(guildId, memberId, value);
    },
    clearAfkWarningSent(memberId) {
      return storage.clearGuildAfkWarningSent(guildId, memberId);
    },
    sanitizeApplicationInput: storage.sanitizeApplicationInput,
    setApplicationStatus: storage.setApplicationStatus
  };
}

function getRankService(guildId) {
  return createRankService({
    roles: resolveGuildSettings(guildId).roles,
    storage: getGuildStorage(guildId),
    autoRanks: AUTO_RANKS
  });
}

function hasFamilyRole(member) {
  const roleIds = new Set(getRoleIds(member.guild.id));
  return member.roles.cache.some(role => roleIds.has(role.id));
}

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission));
}

function hasAnyRole(member, roleIds) {
  return Boolean(member?.roles?.cache?.some(role => roleIds.includes(role.id)));
}

function isOwner(userId) {
  return config.ownerIds.includes(userId);
}

function getGuildPlan(guildId) {
  return database.getSubscription(guildId);
}

function isPremiumGuild(guildId) {
  return database.isPremium(guildId);
}

function buildGuildSettingsSnapshot(guild) {
  const settings = resolveGuildSettings(guild.id);

  return {
    guildName: guild.name,
    ownerId: guild.ownerId || '',
    settings: {
      familyTitle: settings.familyTitle,
      channels: {
        panel: settings.channels.panel,
        applications: settings.channels.applications,
        logs: settings.channels.logs,
        disciplineLogs: settings.channels.disciplineLogs
      },
      roles: {
        leader: settings.roles.find(role => role.key === 'leader')?.id || '',
        deputy: settings.roles.find(role => role.key === 'deputy')?.id || '',
        elder: settings.roles.find(role => role.key === 'elder')?.id || '',
        member: settings.roles.find(role => role.key === 'member')?.id || '',
        newbie: settings.roles.find(role => role.key === 'newbie')?.id || '',
        mute: settings.muteRoleId || ''
      },
      access: {
        applications: settings.access.applications,
        discipline: settings.access.discipline,
        ranks: settings.access.ranks
      },
      visuals: {
        familyBanner: settings.visuals.familyBanner,
        applicationsBanner: settings.visuals.applicationsBanner
      },
      features: {
        aiEnabled: AI_ENABLED,
        autoRanksEnabled: AUTO_RANKS.enabled,
        leakGuardEnabled: LEAK_GUARD.enabled,
        channelGuardEnabled: CHANNEL_GUARD.enabled
      }
    }
  };
}

function formatVoiceHours(minutes) {
  return (Math.max(0, Number(minutes) || 0) / 60).toFixed(1);
}

function formatTimeAgo(timestamp) {
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

function getLiveVoiceMinutes(member) {
  const guildStorage = getGuildStorage(member.guild.id);
  const storedMinutes = guildStorage.voiceMinutes(member.id);
  const startedAt = voiceSessions.get(memberSessionKey(member.guild.id, member.id));
  if (!startedAt) return storedMinutes;

  return storedMinutes + Math.floor((Date.now() - startedAt) / 60000);
}

function getDisplayRankName(member) {
  return getRankService(member.guild.id).getCurrentRole(member)?.name || copy.profile.noRoles;
}

function getFamilyMembers(guild) {
  return Array.from(guild.members.cache.values()).filter(member => !member.user?.bot && hasFamilyRole(member));
}

function buildFamilyDashboardStats(guild) {
  const guildStorage = getGuildStorage(guild.id);
  const allMembers = Array.from(guild.members.cache.values()).filter(member => !member.user?.bot);
  const familyMembers = getFamilyMembers(guild);
  const pendingApplications = guildStorage
    .listRecentApplications(500)
    .filter(application => application.status === 'pending' || application.status === 'review').length;

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

  const afkRiskCount = familyMembers.filter(member => {
    const data = guildStorage.ensureMember(member.id);
    return Date.now() - Number(data.lastSeenAt || 0) >= AFK_WARNING_THRESHOLD_MS;
  }).length;

  const topEntry = familyMembers
    .map(member => ({
      member,
      activity: guildStorage.activityScore(member.id),
      points: guildStorage.pointsScore(member.id)
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
      ? `<@${topEntry.member.id}> • ${getDisplayRankName(topEntry.member)} • ${Math.max(0, topEntry.activity)} очк.`
      : '',
    lastUpdatedLabel: new Date().toLocaleString('ru-RU')
  };
}

function buildLeaderboardLines(guild, limit = 10) {
  const guildStorage = getGuildStorage(guild.id);

  return getFamilyMembers(guild)
    .map(member => ({
      member,
      points: guildStorage.pointsScore(member.id),
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
    .map((entry, index) => copy.stats.leaderboardLine(index, entry.member, entry.roleName, entry.points, entry.voiceHours));
}

function buildVoiceActivityLines(guild, limit = 10) {
  const guildStorage = getGuildStorage(guild.id);

  return getFamilyMembers(guild)
    .map(member => ({
      member,
      hours: Number(formatVoiceHours(getLiveVoiceMinutes(member))),
      points: guildStorage.pointsScore(member.id)
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

function buildLeaderboardSummary(guild) {
  const guildStorage = getGuildStorage(guild.id);
  const settings = resolveGuildSettings(guild.id);
  const members = getFamilyMembers(guild);
  const ranked = members
    .map(member => ({
      member,
      points: guildStorage.pointsScore(member.id),
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
    topLine: topEntry ? `<@${topEntry.member.id}> • ${topEntry.roleName} • ${topEntry.points}/100` : '',
    averagePoints: ranked.length ? (totalPoints / ranked.length).toFixed(1) : '0.0',
    totalPoints,
    totalVoiceHours: totalVoiceHours.toFixed(1),
    imageUrl: settings.visuals.familyBanner || ''
  };
}

function buildVoiceActivitySummary(guild) {
  const guildStorage = getGuildStorage(guild.id);
  const settings = resolveGuildSettings(guild.id);
  const members = getFamilyMembers(guild);
  const ranked = members
    .map(member => ({
      member,
      hours: Number(formatVoiceHours(getLiveVoiceMinutes(member))),
      points: guildStorage.pointsScore(member.id)
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
    topLine: topEntry ? `<@${topEntry.member.id}> • ${topEntry.hours.toFixed(1)} ч • ${topEntry.points}/100` : '',
    totalHours: totalHours.toFixed(1),
    averageHours: ranked.length ? (totalHours / ranked.length).toFixed(1) : '0.0',
    totalPoints,
    imageUrl: settings.visuals.familyBanner || ''
  };
}

function buildActivityReportEmbed(guild, targetMember = null) {
  const guildStorage = getGuildStorage(guild.id);

  if (targetMember) {
    const data = guildStorage.ensureMember(targetMember.id);
    return new EmbedBuilder()
      .setColor(0x2563eb)
      .setTitle(`Отчёт по участнику: ${targetMember.displayName}`)
      .setDescription(`Сервер: **${guild.name}**`)
      .addFields(
        { name: 'Ранг', value: getDisplayRankName(targetMember), inline: true },
        { name: 'Репутация', value: `${guildStorage.pointsScore(targetMember.id)}/100`, inline: true },
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
      .setFooter({ text: 'BRHD • Phoenix • Activity Report' })
      .setTimestamp();
  }

  const lines = getFamilyMembers(guild)
    .map(member => {
      const data = guildStorage.ensureMember(member.id);
      return {
        member,
        line: `${getDisplayRankName(member)} • <@${member.id}> • ${guildStorage.pointsScore(member.id)}/100 • ${formatVoiceHours(getLiveVoiceMinutes(member))} ч • ${formatTimeAgo(data.lastSeenAt)}`
      };
    })
    .sort((left, right) => left.member.displayName.localeCompare(right.member.displayName, 'ru'))
    .slice(0, 25)
    .map(item => item.line);

  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('Отчёт по активности семьи')
    .setDescription(`Сервер: **${guild.name}**\nУчастников с семейными ролями: ${lines.length}`)
    .addFields({
      name: 'Список',
      value: lines.length ? lines.join('\n').slice(0, 1024) : 'Нет участников с семейными ролями.'
    })
    .setFooter({ text: 'BRHD • Phoenix • Activity Report' })
    .setTimestamp();
}

function buildPremiumActivityReportEmbed(guild, targetMember = null) {
  const guildStorage = getGuildStorage(guild.id);
  const settings = resolveGuildSettings(guild.id);

  if (targetMember) {
    const data = guildStorage.ensureMember(targetMember.id);
    const reputation = guildStorage.pointsScore(targetMember.id);
    const voiceHours = formatVoiceHours(getLiveVoiceMinutes(targetMember));

    return new EmbedBuilder()
      .setColor(0x2563eb)
      .setTitle(`Отчёт по участнику • ${targetMember.displayName}`)
      .setDescription(
        [
          `Сервер: **${guild.name}**`,
          `Ранг: **${getDisplayRankName(targetMember)}**`,
          `Статус: ${targetMember.presence?.status || 'offline'}`,
          `Последняя активность: **${formatTimeAgo(data.lastSeenAt)}**`
        ].join('\n')
      )
      .setImage(settings.visuals.familyBanner || null)
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
            `Актив-очки: ${guildStorage.activityScore(targetMember.id)}`
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
      .setFooter({ text: 'BRHD • Phoenix • Premium Activity' })
      .setTimestamp();
  }

  const members = getFamilyMembers(guild);
  const lines = members
    .map(member => {
      const data = guildStorage.ensureMember(member.id);
      return `${getDisplayRankName(member)} • <@${member.id}> • ${guildStorage.pointsScore(member.id)}/100 • ${formatVoiceHours(getLiveVoiceMinutes(member))} ч • ${formatTimeAgo(data.lastSeenAt)}`;
    })
    .sort((left, right) => left.localeCompare(right, 'ru'))
    .slice(0, 25);

  const totalPoints = members.reduce((sum, member) => sum + guildStorage.pointsScore(member.id), 0);
  const totalVoiceHours = members.reduce((sum, member) => sum + Number(formatVoiceHours(getLiveVoiceMinutes(member))), 0);
  const afkRiskCount = members.filter(member => {
    const data = guildStorage.ensureMember(member.id);
    return Date.now() - Number(data.lastSeenAt || 0) >= AFK_WARNING_THRESHOLD_MS;
  }).length;

  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('Отчёт по активности семьи • Phoenix')
    .setDescription(
      [
        `Сервер: **${guild.name}**`,
        `Участников с семейными ролями: **${members.length}**`,
        `AFK-рисков: **${afkRiskCount}**`
      ].join('\n')
    )
    .setImage(settings.visuals.familyBanner || null)
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
    .setFooter({ text: 'BRHD • Phoenix • Premium Activity' })
    .setTimestamp();
}

function normalizeMemberQuery(value) {
  return String(value || '').trim().toLowerCase();
}

async function resolveMemberQuery(guild, query, fallbackUserId = '') {
  const rawQuery = String(query || '').trim();
  if (!rawQuery) {
    return fallbackUserId ? fetchMemberFast(guild, fallbackUserId) : null;
  }

  const mentionMatch = rawQuery.match(/^<@!?(\d+)>$/);
  const directId = mentionMatch?.[1] || (/^\d{5,25}$/.test(rawQuery) ? rawQuery : '');
  if (directId) {
    return fetchMemberFast(guild, directId);
  }

  const lookup = normalizeMemberQuery(rawQuery);
  const findIn = members =>
    members.find(member => normalizeMemberQuery(member.displayName) === lookup) ||
    members.find(member => normalizeMemberQuery(member.user.username) === lookup) ||
    members.find(member => normalizeMemberQuery(member.displayName).includes(lookup)) ||
    members.find(member => normalizeMemberQuery(member.user.username).includes(lookup)) ||
    null;

  const cachedMembers = Array.from(guild.members.cache.values()).filter(member => !member.user?.bot);
  const cachedMatch = findIn(cachedMembers);
  if (cachedMatch) return cachedMatch;

  await guild.members.fetch().catch(() => {});
  const fetchedMembers = Array.from(guild.members.cache.values()).filter(member => !member.user?.bot);
  return findIn(fetchedMembers);
}

async function buildAiAdvisorEmbed(guild, member) {
  const guildStorage = getGuildStorage(guild.id);
  const memberData = guildStorage.ensureMember(member.id);
  const rankInfo = getRankService(guild.id).describeMember(member);
  const analysis = await aiService.analyzeMember({
    displayName: member.displayName,
    currentRoleName: rankInfo.currentRole?.name || copy.profile.noRoles,
    autoTargetRoleName: rankInfo.autoTargetRole?.name || '',
    activityScore: guildStorage.activityScore(member.id),
    points: guildStorage.pointsScore(member.id),
    warns: memberData.warns || 0,
    commends: memberData.commends || 0,
    messageCount: memberData.messageCount || 0,
    voiceMinutes: getLiveVoiceMinutes(member),
    lastSeenAt: memberData.lastSeenAt || 0
  });

  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle(copy.ai.advisorTitle(member.displayName))
    .setDescription(analysis.slice(0, 3900))
    .setFooter({ text: copy.ai.advisorFooter })
    .setTimestamp();
}

function getGuildRecord(guild) {
  return database.ensureGuild(guild.id, {
    guildName: guild.name,
    ownerId: guild.ownerId || ''
  });
}

function getRoleLimit(guildId) {
  return isPremiumGuild(guildId) ? Number.MAX_SAFE_INTEGER : 6;
}

function getHelpCatalog(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const regularFree = [
    { name: 'family', description: copy.commands.familyDescription },
    { name: 'apply', description: copy.commands.applyDescription },
    { name: 'applications', description: copy.commands.applicationsDescription },
    { name: 'profile', description: copy.commands.profileDescription },
    { name: 'help', description: copy.commands.helpDescription }
  ];

  const adminFree = [
    { name: 'applypanel', description: copy.commands.applyPanelDescription },
    { name: 'setrole', description: copy.commands.setRoleDescription },
    { name: 'setchannel', description: copy.commands.setChannelDescription },
    { name: 'setfamilytitle', description: copy.commands.setFamilyTitleDescription },
    { name: 'setart', description: copy.commands.setArtDescription },
    { name: 'setup', description: copy.commands.setupDescription },
    { name: 'adminpanel', description: copy.commands.adminPanelDescription },
    { name: 'warn', description: copy.commands.warnDescription },
    { name: 'commend', description: copy.commands.commendDescription },
    { name: 'purge', description: copy.commands.purgeDescription },
    { name: 'mute', description: copy.commands.muteDescription },
    { name: 'unmute', description: copy.commands.unmuteDescription },
    { name: 'lockchannel', description: copy.commands.lockChannelDescription },
    { name: 'unlockchannel', description: copy.commands.unlockChannelDescription },
    { name: 'slowmode', description: copy.commands.slowmodeDescription },
    { name: 'warnhistory', description: copy.commands.warnHistoryDescription },
    { name: 'debugconfig', description: copy.commands.debugConfigDescription }
  ];

  const regularPremium = [
    { name: 'leaderboard', description: copy.commands.leaderboardDescription },
    { name: 'voiceactivity', description: copy.commands.voiceActivityDescription },
    { name: 'ai', description: copy.commands.aiDescription }
  ];

  const adminPremium = [
    { name: 'activityreport', description: copy.commands.activityReportDescription },
    { name: 'aiadvisor', description: copy.commands.aiAdvisorDescription },
    { name: 'blacklistadd', description: copy.commands.blacklistAddDescription },
    { name: 'blacklistremove', description: copy.commands.blacklistRemoveDescription },
    { name: 'blacklistlist', description: copy.commands.blacklistListDescription },
    { name: 'banlist', description: copy.commands.banListDescription },
    { name: 'unbanid', description: copy.commands.unbanIdDescription },
    { name: 'testaccept', description: copy.commands.testAcceptDescription },
    { name: 'purgeuser', description: copy.commands.purgeUserDescription },
    { name: 'clearallchannel', description: copy.commands.clearAllChannelDescription },
    { name: 'kickroless', description: copy.commands.kickRolessDescription },
    { name: 'clearwarns', description: copy.commands.clearWarnsDescription }
  ];

  if (isOwner(userId)) {
    adminFree.push({ name: 'subscription', description: copy.commands.subscriptionDescription });
  }

  const premium = isPremiumGuild(guildId);
  const availableRegular = premium ? [...regularFree, ...regularPremium] : regularFree;
  const availableAdminBase = premium ? [...adminFree, ...adminPremium] : adminFree;
  const availableAdmin = availableAdminBase.filter(command => canUseCommandInContext(command.name, interaction));

  return {
    plan: getGuildPlan(guildId),
    regularCommands: availableRegular,
    adminCommands: availableAdmin,
    premiumRegularCommands: premium ? [] : regularPremium,
    premiumAdminCommands: premium ? [] : adminPremium
  };
}

function canUseCommandInContext(commandName, interaction) {
  switch (commandName) {
    case 'applypanel':
      return canApplications(interaction.member);
    case 'setup':
    case 'adminpanel':
    case 'setrole':
    case 'setchannel':
    case 'setfamilytitle':
    case 'setart':
    case 'debugconfig':
    case 'aiadvisor':
    case 'testaccept':
      return canDebugConfig(interaction);
    case 'warn':
    case 'commend':
      return canDiscipline(interaction.member);
    case 'warnhistory':
    case 'clearwarns':
      return canDiscipline(interaction.member) || canModerate(interaction.member);
    case 'purge':
    case 'purgeuser':
    case 'clearallchannel':
    case 'mute':
    case 'unmute':
    case 'lockchannel':
    case 'unlockchannel':
    case 'slowmode':
    case 'kickroless':
      return canModerate(interaction.member);
    case 'blacklistadd':
    case 'blacklistremove':
    case 'blacklistlist':
    case 'banlist':
    case 'unbanid':
      return canUseSecurity(interaction.member);
    case 'subscription':
      return isOwner(interaction.user.id);
    case 'activityreport':
      return canDebugConfig(interaction);
    default:
      return true;
  }
}

function isAiCommandOverviewQuery(query) {
  const value = String(query || '').toLowerCase();
  return (
    value.includes('что я умею') ||
    value.includes('что мне доступно') ||
    value.includes('какие команды') ||
    value.includes('что я могу') ||
    value.includes('мои команды')
  );
}

function isAiNicknameRequest(query, targetUser, newNickname) {
  if (!targetUser || !newNickname) return false;
  const value = String(query || '').toLowerCase();
  return (
    value.includes('смени ник') ||
    value.includes('смени ник') ||
    value.includes('измени ник') ||
    value.includes('переименуй') ||
    value.includes('rename nick')
  );
}

function buildAiCommandsOverview(interaction) {
  const catalog = getHelpCatalog(interaction);
  const available = [...catalog.regularCommands, ...catalog.adminCommands];

  if (!available.length) {
    return copy.ai.commandsOverviewEmpty;
  }

  const planLabel = isPremiumGuild(interaction.guild.id) ? 'Premium' : 'Free';
  return [
    `${copy.ai.commandsOverviewTitle}:`,
    `План: **${planLabel}**`,
    `Пользователь: <@${interaction.user.id}>`,
    '',
    ...available.map(command => `/${command.name} — ${command.description}`)
  ].join('\n').slice(0, 1900);
}

function canApplications(member) {
  if (!member) return false;
  if (hasPermission(member, PermissionFlagsBits.Administrator)) return true;
  const accessRoles = resolveGuildSettings(member.guild.id).access.applications;
  if (!accessRoles.length) return hasPermission(member, PermissionFlagsBits.ManageRoles);
  return hasAnyRole(member, accessRoles) || hasPermission(member, PermissionFlagsBits.ManageRoles);
}

function canDiscipline(member) {
  if (!member) return false;
  if (hasPermission(member, PermissionFlagsBits.Administrator)) return true;
  const accessRoles = resolveGuildSettings(member.guild.id).access.discipline;
  if (!accessRoles.length) return hasPermission(member, PermissionFlagsBits.ManageRoles);
  return hasAnyRole(member, accessRoles) || hasPermission(member, PermissionFlagsBits.ManageRoles);
}

function canManageRanks(member) {
  if (!member) return false;
  if (hasPermission(member, PermissionFlagsBits.Administrator)) return true;
  const accessRoles = resolveGuildSettings(member.guild.id).access.ranks;
  if (!accessRoles.length) return hasPermission(member, PermissionFlagsBits.ManageRoles);
  return hasAnyRole(member, accessRoles) || hasPermission(member, PermissionFlagsBits.ManageRoles);
}

function canModerate(member) {
  if (!member) return false;
  return (
    hasPermission(member, PermissionFlagsBits.Administrator) ||
    hasPermission(member, PermissionFlagsBits.ManageMessages) ||
    hasPermission(member, PermissionFlagsBits.ManageChannels) ||
    hasPermission(member, PermissionFlagsBits.ManageRoles) ||
    hasPermission(member, PermissionFlagsBits.ModerateMembers)
  );
}

function canManageNicknames(member) {
  if (!member) return false;
  return (
    hasPermission(member, PermissionFlagsBits.Administrator) ||
    hasPermission(member, PermissionFlagsBits.ManageNicknames) ||
    hasPermission(member, PermissionFlagsBits.ManageGuild)
  );
}

function canDebugConfig(interaction) {
  const memberPermissions = interaction.memberPermissions || interaction.member?.permissions;
  if (!memberPermissions) return false;

  return (
    memberPermissions.has(PermissionFlagsBits.Administrator) ||
    memberPermissions.has(PermissionFlagsBits.ManageGuild) ||
    memberPermissions.has(PermissionFlagsBits.ManageRoles)
  );
}

function canUseSecurity(member) {
  if (!member) return false;
  return hasPermission(member, PermissionFlagsBits.Administrator);
}

function canBypassLeakGuard(member) {
  if (!LEAK_GUARD.enabled) return true;
  if (!member) return false;
  if (!LEAK_GUARD.allowedRoles.length) {
    return hasPermission(member, PermissionFlagsBits.ManageGuild) || hasPermission(member, PermissionFlagsBits.ManageMessages);
  }

  return (
    hasAnyRole(member, LEAK_GUARD.allowedRoles) ||
    hasPermission(member, PermissionFlagsBits.ManageGuild) ||
    hasPermission(member, PermissionFlagsBits.ManageMessages)
  );
}

function canBypassChannelGuard(member) {
  if (!CHANNEL_GUARD.enabled) return true;
  if (!member) return false;
  if (!CHANNEL_GUARD.allowedRoles.length) {
    return hasPermission(member, PermissionFlagsBits.ManageGuild) || hasPermission(member, PermissionFlagsBits.ManageChannels);
  }

  return (
    hasAnyRole(member, CHANNEL_GUARD.allowedRoles) ||
    hasPermission(member, PermissionFlagsBits.ManageGuild) ||
    hasPermission(member, PermissionFlagsBits.ManageChannels)
  );
}

async function fetchTextChannel(guild, id) {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

function resolveTargetTextChannel(interaction) {
  const channel = interaction.options.getChannel(copy.commands.channelOptionName) || interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    return null;
  }

  return channel;
}

function canManageTargetChannel(member, channel) {
  if (!member || !channel) return false;
  if (hasPermission(member, PermissionFlagsBits.Administrator)) return true;

  const permissions = channel.permissionsFor(member);
  return Boolean(
    permissions?.has(PermissionFlagsBits.ManageMessages) ||
    permissions?.has(PermissionFlagsBits.ManageChannels)
  );
}

function formatModerationTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'неизвестно';
  }

  return date.toLocaleString('ru-RU');
}

async function deleteMessagesFast(messages) {
  if (!messages.length) return 0;

  const now = Date.now();
  const fresh = messages.filter(message => now - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
  const stale = messages.filter(message => now - message.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);
  let deleted = 0;

  for (let index = 0; index < fresh.length; index += 100) {
    const batch = fresh.slice(index, index + 100);
    if (!batch.length) continue;
    const result = await batch[0].channel.bulkDelete(batch.map(message => message.id), true).catch(() => null);
    if (result?.size) {
      deleted += result.size;
      continue;
    }

    for (const message of batch) {
      const ok = await message.delete().then(() => true).catch(() => false);
      if (ok) {
        deleted += 1;
      }
    }
  }

  for (const message of stale) {
    const ok = await message.delete().then(() => true).catch(() => false);
    if (ok) {
      deleted += 1;
    }
  }

  return deleted;
}

async function fetchRecentDeletableMessages(channel, count) {
  const collected = [];
  let before;

  while (collected.length < count) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;

    for (const message of batch.values()) {
      if (message.pinned) continue;
      if (message.deletable === false) continue;
      collected.push(message);
      if (collected.length >= count) {
        break;
      }
    }

    before = batch.last()?.id;
  }

  return collected;
}

async function fetchAllDeletableMessages(channel, { includePinned = true } = {}) {
  const collected = [];
  let skippedSystem = 0;
  let skippedBlocked = 0;
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;

    for (const message of batch.values()) {
      if (!includePinned && message.pinned) continue;
      if (message.deletable === false) {
        if (message.system || message.type !== 0) {
          skippedSystem += 1;
        } else {
          skippedBlocked += 1;
        }
        continue;
      }
      collected.push(message);
    }

    before = batch.last()?.id;
  }

  return { messages: collected, skippedSystem, skippedBlocked };
}

function messageBelongsToUser(message, userId) {
  if (message.author?.id === userId) {
    return true;
  }

  if (message.interactionMetadata?.user?.id === userId) {
    return true;
  }

  if (message.interaction?.user?.id === userId) {
    return true;
  }

  if (message.mentions?.users?.has?.(userId) && message.type !== 0) {
    return true;
  }

  return false;
}

async function fetchMessagesForUser(channel, userId, count) {
  const collected = [];
  let matched = 0;
  let blocked = 0;
  let system = 0;
  let before;

  while (collected.length < count) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;

    for (const message of batch.values()) {
      if (!messageBelongsToUser(message, userId)) continue;

      matched += 1;

      if (message.pinned) continue;

      if (message.deletable === false) {
        if (message.system || message.type !== 0) {
          system += 1;
        } else {
          blocked += 1;
        }
        continue;
      }

      collected.push(message);
      if (collected.length >= count) {
        break;
      }
    }

    before = batch.last()?.id;
  }

  return { messages: collected, matched, blocked, system };
}

async function clearChannelByMessages(channel) {
  const { messages, skippedSystem, skippedBlocked } = await fetchAllDeletableMessages(channel);
  const deleted = await deleteMessagesFast(messages);

  return {
    deleted,
    requested: messages.length,
    skippedSystem,
    skippedBlocked
  };
}

function remapConfiguredChannelIds(guildId, oldChannelId, newChannelId) {
  const settings = resolveGuildSettings(guildId);
  const channelPatch = {};

  for (const [key, value] of Object.entries(settings.channels || {})) {
    if (value === oldChannelId) {
      channelPatch[key] = newChannelId;
    }
  }

  if (Object.keys(channelPatch).length) {
    database.updateGuildSettings(guildId, { channels: channelPatch });
  }

  return channelPatch;
}

async function fetchMemberFast(guild, userId) {
  return guild.members.cache.get(userId) || guild.members.fetch(userId).catch(() => null);
}

async function sendDirectNotification(user, { title, description, color = 0x7c3aed, footer = 'BRHD • Phoenix • Notify' }) {
  if (!user) return false;

  const channel = await user.createDM().catch(() => null);
  if (!channel) return false;

  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: footer }).setTimestamp();
  const sent = await channel.send({ embeds: [embed] }).then(() => true).catch(() => false);
  return sent;
}

async function sendAcceptanceDm({ guild, member, moderatorUser, reason, rankName }) {
  return sendDirectNotification(member.user, {
    title: 'Заявка принята',
    color: 0x10b981,
    footer: 'BRHD • Phoenix • Family',
    description: [
      `Ты принят в семью **${resolveGuildSettings(guild.id).familyTitle}** на сервере **${guild.name}**.`,
      '',
      `Модератор: <@${moderatorUser.id}>`,
      `Причина: ${reason}`,
      `Выданный ранг: ${rankName}`
    ].join('\n')
  });
}

async function sendDisciplineDm(type, guild, targetUser, moderatorUser, reason) {
  const isWarn = type === 'warn';
  return sendDirectNotification(targetUser, {
    title: isWarn ? 'Получен выговор' : 'Получена похвала',
    color: isWarn ? 0xf97316 : 0x2563eb,
    footer: 'BRHD • Phoenix • Discipline',
    description: [
      `Сервер: **${guild.name}**`,
      `Модератор: <@${moderatorUser.id}>`,
      `Причина: ${reason}`,
      '',
      isWarn ? 'Следи за активностью и дисциплиной, чтобы не получить дополнительные санкции.' : 'Так держать. Активность и вклад в семью замечены.'
    ].join('\n')
  });
}

async function sendRankDm(guild, member, result) {
  if (!result?.ok) return false;

  const isPromotion = result.code === 'promoted' || result.code === 'auto_applied';
  const title = isPromotion ? 'Ранг повышен' : 'Ранг понижен';

  return sendDirectNotification(member.user, {
    title,
    color: isPromotion ? 0x10b981 : 0xe11d48,
    footer: 'BRHD • Phoenix • Ranks',
    description: [
      `Сервер: **${guild.name}**`,
      `Было: ${result.fromRole?.name || '—'}`,
      `Стало: ${result.toRole?.name || '—'}`,
      result.score !== undefined ? `Текущие очки активности: ${result.score}` : null
    ]
      .filter(Boolean)
      .join('\n')
  });
}

async function sendBlacklistDm(user, guild, reason) {
  return sendDirectNotification(user, {
    title: 'Чёрный список',
    color: 0xe11d48,
    footer: 'BRHD • Phoenix • Security',
    description: [
      `Твой доступ на сервер **${guild.name}** ограничен.`,
      `Причина: ${reason}`,
      '',
      'Если это ошибка, свяжись с администрацией сервера.'
    ].join('\n')
  });
}

async function sendAfkWarningDm(member) {
  return sendDirectNotification(member.user, {
    title: 'Предупреждение об AFK',
    color: 0xf59e0b,
    footer: 'BRHD • Phoenix • Activity',
    description: [
      `На сервере **${member.guild.name}** от тебя не было активности уже 3 дня.`,
      'Если не проявишь активность, администрация может кикнуть тебя за AFK.',
      '',
      'Отправь сообщение, зайди в голосовой канал или просто прояви активность в Discord.'
    ].join('\n')
  });
}

async function sendAcceptLog(
  guild,
  member,
  moderatorUser,
  reason = copy.applications.acceptReason,
  rankName = copy.applications.acceptRank
) {
  if (!isPremiumGuild(guild.id)) return;
  const { channels } = resolveGuildSettings(guild.id);
  if (!channels.logs) return;
  const channel = await fetchTextChannel(guild, channels.logs);
  if (!channel) return;

  await channel.send({
    embeds: [embeds.buildAcceptLogEmbed({ member, moderatorUser, reason, rankName })]
  });
}

async function sendDisciplineLog(guild, embed) {
  if (!isPremiumGuild(guild.id)) return;
  const { channels } = resolveGuildSettings(guild.id);
  if (!channels.disciplineLogs) return;
  const channel = await fetchTextChannel(guild, channels.disciplineLogs);
  if (!channel) return;
  await channel.send({ embeds: [embed] });
}

async function sendSecurityLog(guild, content) {
  if (!isPremiumGuild(guild.id)) return;
  const { channels } = resolveGuildSettings(guild.id);
  if (!channels.logs) return;
  const channel = await fetchTextChannel(guild, channels.logs);
  if (!channel) return;
  await channel.send({ content }).catch(() => {});
}

async function sendWelcomeInvite(member) {
  const { channels, familyTitle, visuals } = resolveGuildSettings(member.guild.id);
  const channel = (await fetchTextChannel(member.guild, channels.applications)) || (await fetchTextChannel(member.guild, channels.panel));
  if (!channel) return;

  await channel.send({
    content: `<@${member.id}>`,
    embeds: [embeds.buildWelcomeEmbed(member, familyTitle, visuals.applicationsBanner)],
    components: embeds.buildApplicationsPanelButtons()
  }).catch(() => {});
}

function getApplicationsService(guildId) {
  const settings = resolveGuildSettings(guildId);

  return createApplicationsService({
    storage: getGuildStorage(guildId),
    fetchTextChannel,
    applicationsChannelId: settings.channels.applications,
    applicationDefaultRole: settings.applicationDefaultRole,
    logChannelId: settings.channels.logs,
    applicationsBanner: settings.visuals.applicationsBanner,
    familyRoles: settings.roles,
    applicationAccessRoleIds: settings.access.applications,
    client,
    embeds,
    sendAcceptLog,
    sendAcceptanceDm
  });
}

async function refreshMember(member) {
  if (typeof member.fetch !== 'function') return member;
  return member.fetch().catch(() => member);
}

function buildProfilePayload(member, allowRankButtons, content = '') {
  const guildStorage = getGuildStorage(member.guild.id);
  const rankService = getRankService(member.guild.id);
  const memberData = { ...guildStorage.ensureMember(member.id), voiceMinutes: getLiveVoiceMinutes(member) };
  const rankInfo = {
    ...rankService.describeMember(member),
    autoEnabled: isPremiumGuild(member.guild.id) && AUTO_RANKS.enabled
  };
  const payload = {
    embeds: [
      embeds.buildProfileEmbed(member, {
        activityScore: guildStorage.activityScore,
        memberData,
        familyRoleIds: getRoleIds(member.guild.id),
        rankInfo
      })
    ],
    components: allowRankButtons
      ? embeds.buildRankButtons({
          userId: member.id,
          canPromote: rankInfo.canPromote,
          canDemote: rankInfo.canDemote,
          canAutoSync: rankInfo.canAutoSync && rankInfo.autoEnabled
        })
      : []
  };

  if (content) {
    payload.content = content;
  }

  return payload;
}

function formatRankResult(userId, result) {
  switch (result.code) {
    case 'promoted':
      return copy.ranks.promoted(userId, result.fromRole.name, result.toRole.name);
    case 'demoted':
      return copy.ranks.demoted(userId, result.fromRole.name, result.toRole.name);
    case 'auto_applied':
      return copy.ranks.autoApplied(userId, result.fromRole.name, result.toRole.name, result.score);
    case 'top_rank':
      return copy.ranks.topRank(result.currentRole.name);
    case 'bottom_rank':
      return copy.ranks.bottomRank(result.currentRole.name);
    case 'manual_only':
      return copy.ranks.manualOnly(result.currentRole.name);
    case 'already_synced':
      return copy.ranks.alreadySynced(result.currentRole.name, result.score);
    case 'auto_keep_current':
      return typeof copy.ranks.autoKeepCurrent === 'function'
        ? copy.ranks.autoKeepCurrent(result.currentRole.name, result.score)
        : `Авто-ранг сохранил текущую роль ${result.currentRole.name}. Понижение вниз автоматически не применяется (${result.score} очк.).`;
    case 'auto_disabled':
      return copy.ranks.autoDisabled;
    case 'auto_unavailable':
      return copy.ranks.autoUnavailable;
    case 'no_family_role':
    default:
      return copy.ranks.noFamilyRole;
  }
}

async function enforceBlacklist(member) {
  const guildStorage = getGuildStorage(member.guild.id);
  const entry = guildStorage.getBlacklistEntry(member.id);
  if (!entry) return false;

  const reason = copy.security.blacklistBanReason(entry.reason);
  await sendBlacklistDm(member.user, member.guild, entry.reason).catch(() => {});
  const banned = await member.ban({ reason }).then(() => true).catch(() => false);
  if (banned) {
    await sendSecurityLog(member.guild, copy.security.blacklistAdded(member.id, entry.reason));
    return true;
  }

  const kicked = await member.kick(reason).then(() => true).catch(() => false);
  if (kicked) {
    await sendSecurityLog(member.guild, copy.security.blacklistAdded(member.id, entry.reason));
  }
  return kicked;
}

const panelUpdateStates = new Map();
const autoRankSyncInProgress = new Set();
const voiceSessions = new Map();

function getPanelUpdateState(guildId) {
  if (!panelUpdateStates.has(guildId)) {
    panelUpdateStates.set(guildId, {
      inProgress: false,
      pending: false,
      lastUpdate: 0
    });
  }

  return panelUpdateStates.get(guildId);
}

function startVoiceSession(member) {
  if (!member?.id || !member.voice?.channelId || member.user?.bot) return;
  const key = memberSessionKey(member.guild.id, member.id);
  if (!voiceSessions.has(key)) {
    voiceSessions.set(key, Date.now());
  }
}

function stopVoiceSession(member) {
  if (!member?.id) return 0;
  const key = memberSessionKey(member.guild.id, member.id);
  const startedAt = voiceSessions.get(key);
  if (!startedAt) return 0;

  voiceSessions.delete(key);
  const elapsedMs = Date.now() - startedAt;
  const minutes = Math.floor(elapsedMs / 60000);
  if (minutes <= 0) return 0;

  return getGuildStorage(member.guild.id).addVoiceMinutes(member.id, minutes);
}

function flushVoiceSessions() {
  for (const guild of client.guilds.cache.values()) {
    for (const member of guild.members.cache.values()) {
      if (voiceSessions.has(memberSessionKey(guild.id, member.id))) {
        stopVoiceSession(member);
      }
    }
  }
}

async function doPanelUpdate(guildId, force = false) {
  const state = getPanelUpdateState(guildId);
  if (state.inProgress) {
    state.pending = true;
    return;
  }

  const now = Date.now();
  if (!force && now - state.lastUpdate < 15000) return;

  state.inProgress = true;
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const settings = resolveGuildSettings(guild.id);
    const guildStorage = getGuildStorage(guild.id);
    const channel = await fetchTextChannel(guild, settings.channels.panel);
    if (!channel) return;
    const summary = buildFamilyDashboardStats(guild);

    const familyEmbeds = await embeds.buildFamilyEmbeds(guild, {
      roles: settings.roles,
      familyTitle: settings.familyTitle,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      activityScore: guildStorage.activityScore,
      summary,
      imageUrl: settings.visuals.familyBanner
    });

    const fixedMessageId = guild.id === GUILD_ID ? MESSAGE_ID : '';
    const panelMessageId = storage.getGuildPanelMessageId(guild.id, fixedMessageId);
    if (panelMessageId) {
      try {
        const message = await channel.messages.fetch(panelMessageId);
        await message.edit({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
      } catch {
        const message = await channel.send({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
        storage.setGuildPanelMessageId(guild.id, message.id, fixedMessageId);
        console.log('Скопируй MESSAGE_ID:', message.id);
      }
    } else {
      const message = await channel.send({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
      storage.setGuildPanelMessageId(guild.id, message.id, fixedMessageId);
      console.log('Скопируй MESSAGE_ID:', message.id);
    }

    state.lastUpdate = Date.now();
  } catch (error) {
    console.error('Ошибка обновления панели:', error);
  } finally {
    state.inProgress = false;
    if (state.pending) {
      state.pending = false;
      setTimeout(() => doPanelUpdate(guildId, false), 3000);
    }
  }
}

async function doPanelUpdateAll(force = false) {
  for (const guild of client.guilds.cache.values()) {
    await doPanelUpdate(guild.id, force);
  }
}

async function syncAutoRanks(guildId, reason = 'interval') {
  if (!AUTO_RANKS.enabled || !isPremiumGuild(guildId) || autoRankSyncInProgress.has(guildId)) return;

  autoRankSyncInProgress.add(guildId);
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const rankService = getRankService(guild.id);
    const result = await rankService.syncAutoRanks(guild);
    if (result.changes.length) {
      console.log(`[auto-ranks:${reason}] ${result.changes.length} change(s)`);
      for (const change of result.changes) {
        const member = guild.members.cache.get(change.memberId) || (await guild.members.fetch(change.memberId).catch(() => null));
        if (member) {
          await sendRankDm(guild, member, {
            ok: true,
            code: 'auto_applied',
            fromRole: change.fromRole,
            toRole: change.toRole,
            score: change.score
          }).catch(() => {});
        }
      }
      await doPanelUpdate(guild.id, false);
    }

    for (const failure of result.failures) {
      console.error(`Ошибка авто-ранга для ${failure.memberId}:`, failure.error);
    }
  } catch (error) {
    console.error('Ошибка авто-рангов:', error);
  } finally {
    autoRankSyncInProgress.delete(guildId);
  }
}

async function syncAutoRanksAll(reason = 'interval') {
  for (const guild of client.guilds.cache.values()) {
    await syncAutoRanks(guild.id, reason);
  }
}

function buildMaintenanceEmbed({ title, description, color, fieldName, lines }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'BRHD • Phoenix • Maintenance' })
    .setTimestamp();

  if (lines?.length) {
    embed.addFields({
      name: fieldName,
      value: lines.join('\n').slice(0, 1024)
    });
  }

  return embed;
}

async function runRolelessCleanup(guildId, reason = 'interval') {
  if (!isPremiumGuild(guildId)) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const record = database.getGuild(guildId);
  const lastRunAt = record.maintenance?.lastRolelessCleanupAt ? Date.parse(record.maintenance.lastRolelessCleanupAt) : 0;
  if (lastRunAt && Date.now() - lastRunAt < ROLELESS_CLEANUP_INTERVAL_MS) {
    return;
  }

  await guild.members.fetch().catch(() => {});

  const kicked = [];
  const failed = [];

  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    if (member.id === guild.ownerId) continue;
    if (hasPermission(member, PermissionFlagsBits.Administrator)) continue;

    const nonEveryoneRoles = member.roles.cache.filter(role => role.id !== guild.id);
    if (nonEveryoneRoles.size > 0) continue;

    const ok = await member.kick('Еженедельная очистка участников без ролей').then(() => true).catch(() => false);
    if (ok) {
      kicked.push(member.user.username);
    } else {
      failed.push(`${member.user.username} (\`${member.id}\`)`);
    }
  }

  database.updateGuildMaintenance(guildId, { lastRolelessCleanupAt: new Date().toISOString() });

  const { channels } = resolveGuildSettings(guildId);
  const logChannel = await fetchTextChannel(guild, channels.logs);
  if (!logChannel) return { skipped: false, kicked, failed };

  await logChannel.send({
    embeds: [
      buildMaintenanceEmbed({
        title: 'Еженедельная очистка без ролей',
        description: [`Режим: ${reason}`, `Кикнуто: ${kicked.length}`, `Ошибок: ${failed.length}`].join('\n'),
        color: 0xe11d48,
        fieldName: 'Отчёт',
        lines: [...kicked.slice(0, 15), ...failed.slice(0, 10)].length ? [...kicked.slice(0, 15), ...failed.slice(0, 10)] : ['Никого не пришлось кикать.']
      })
    ]
  }).catch(() => {});

  return { skipped: false, kicked, failed };
}

async function runRolelessCleanupDetailed(guildId, reason = 'interval', options = {}) {
  const { force = false, notify = true } = options;
  if (!isPremiumGuild(guildId)) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const record = database.getGuild(guildId);
  const lastRunAt = record.maintenance?.lastRolelessCleanupAt ? Date.parse(record.maintenance.lastRolelessCleanupAt) : 0;
  if (!force && lastRunAt && Date.now() - lastRunAt < ROLELESS_CLEANUP_INTERVAL_MS) {
    return { skipped: true, kicked: [], failed: [] };
  }

  await guild.members.fetch().catch(() => {});

  const kicked = [];
  const failed = [];
  const botMember = guild.members.me || guild.members.cache.get(client.user.id);

  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    if (member.id === guild.ownerId) continue;
    if (hasPermission(member, PermissionFlagsBits.Administrator)) continue;

    const nonEveryoneRoles = member.roles.cache.filter(role => role.id !== guild.id);
    if (nonEveryoneRoles.size > 0) continue;

    const blockedReason = explainKickFailure(member, botMember);
    if (blockedReason) {
      failed.push(`${member.user.username} (\`${member.id}\`) - ${blockedReason}`);
      continue;
    }

    try {
      await member.kick('Еженедельная очистка участников без ролей');
      kicked.push(member.user.username);
    } catch (error) {
      const fallbackReason = error?.code === 50013
        ? 'у бота не хватает прав Discord для кика'
        : (error?.message || 'неизвестная ошибка кика');
      failed.push(`${member.user.username} (\`${member.id}\`) - ${fallbackReason}`);
    }
  }

  database.updateGuildMaintenance(guildId, { lastRolelessCleanupAt: new Date().toISOString() });

  const { channels } = resolveGuildSettings(guildId);
  const logChannel = await fetchTextChannel(guild, channels.logs);
  if (!logChannel) return;

  await logChannel.send({
    embeds: [
      buildMaintenanceEmbed({
        title: 'Еженедельная очистка без ролей',
        description: [`Режим: ${reason}`, `Кикнуто: ${kicked.length}`, `Ошибок: ${failed.length}`].join('\n'),
        color: 0xe11d48,
        fieldName: 'Отчёт',
        lines: [...kicked.slice(0, 15), ...failed.slice(0, 10)].length ? [...kicked.slice(0, 15), ...failed.slice(0, 10)] : ['Никого не пришлось кикать.']
      })
    ]
  }).catch(() => {});
}

async function runAfkWarnings(guildId) {
  if (!isPremiumGuild(guildId)) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  await guild.members.fetch().catch(() => {});
  const guildStorage = getGuildStorage(guildId);
  const warned = [];

  for (const member of guild.members.cache.values()) {
    if (member.user?.bot || !hasFamilyRole(member)) continue;

    const memberData = guildStorage.ensureMember(member.id);
    const inactiveMs = Date.now() - Number(memberData.lastSeenAt || 0);

    if (inactiveMs < AFK_WARNING_THRESHOLD_MS) {
      guildStorage.clearAfkWarningSent(member.id);
      continue;
    }

    if (memberData.afkWarningSentAt) {
      continue;
    }

    await sendAfkWarningDm(member).catch(() => {});
    guildStorage.markAfkWarningSent(member.id);
    warned.push(`<@${member.id}>`);
  }

  if (!warned.length) return;

  const { channels } = resolveGuildSettings(guildId);
  const logChannel = await fetchTextChannel(guild, channels.logs);
  if (!logChannel) return;

  await logChannel.send({
    embeds: [
      buildMaintenanceEmbed({
        title: 'AFK-предупреждения',
        description: `Отправлены предупреждения за неактивность 3+ дня: ${warned.length}`,
        color: 0xf59e0b,
        fieldName: 'Участники',
        lines: warned
      })
    ]
  }).catch(() => {});
}

client.on('clientReady', async () => {
  try {
    console.log(`Бот запущен как ${client.user.tag}`);

    const guilds = await client.guilds.fetch();
    for (const guildData of guilds.values()) {
      try {
        const guild = await guildData.fetch();
        database.ensureGuild(guild.id, {
          guildName: guild.name,
          ownerId: guild.ownerId || ''
        });
        await registerCommands(guild);
      } catch (error) {
        console.error(`Ошибка инициализации guild ${guildData.id}:`, error);
      }
    }

    for (const guild of client.guilds.cache.values()) {
      await guild.roles.fetch().catch(error => {
        console.error(`Не удалось получить роли guild ${guild.id}:`, error);
      });

      await guild.members.fetch().catch(error => {
        console.error(`Не удалось получить участников guild ${guild.id}:`, error);
      });

      for (const member of guild.members.cache.values()) {
        if (member.voice?.channelId) {
          startVoiceSession(member);
        }
      }

      await syncAutoRanks(guild.id, 'startup').catch(error => {
        console.error(`Ошибка стартовой синхронизации авто-рангов ${guild.id}:`, error);
      });

      await doPanelUpdate(guild.id, true).catch(error => {
        console.error(`Ошибка стартового обновления панели ${guild.id}:`, error);
      });

      await runRolelessCleanupDetailed(guild.id, 'startup').catch(error => {
        console.error(`Ошибка стартовой чистки ${guild.id}:`, error);
      });

      await runAfkWarnings(guild.id).catch(error => {
        console.error(`Ошибка AFK-проверки ${guild.id}:`, error);
      });
    }

    setInterval(() => {
      doPanelUpdateAll(false).catch(error => {
        console.error('Ошибка interval обновления панели:', error);
      });
    }, UPDATE_INTERVAL_MS);

    if (AUTO_RANKS.enabled) {
      setInterval(() => {
        syncAutoRanksAll('interval').catch(error => {
          console.error('Ошибка interval авто-рангов:', error);
        });
      }, AUTO_RANKS.intervalMs);
    }

    setInterval(() => {
      for (const guild of client.guilds.cache.values()) {
        runRolelessCleanupDetailed(guild.id, 'interval').catch(error => {
          console.error(`Ошибка interval очистки ${guild.id}:`, error);
        });
        runAfkWarnings(guild.id).catch(error => {
          console.error(`Ошибка interval AFK-проверки ${guild.id}:`, error);
        });
      }
    }, AFK_WARNING_CHECK_INTERVAL_MS);

    return;

    const guild = await client.guilds.fetch(GUILD_ID).catch(error => {
      console.error(`Не удалось получить основной guild ${GUILD_ID}:`, error);
      return null;
    });

    if (!guild) {
      return;
    }

    await guild.roles.fetch().catch(error => {
      console.error('Не удалось получить роли guild:', error);
    });

    await guild.members.fetch().catch(error => {
      console.error('Не удалось получить участников guild:', error);
    });

    for (const member of guild.members.cache.values()) {
      if (member.voice?.channelId) {
        startVoiceSession(member);
      }
    }

    await syncAutoRanks('startup').catch(error => {
      console.error('Ошибка стартовой синхронизации авто-рангов:', error);
    });

    await doPanelUpdate(true).catch(error => {
      console.error('Ошибка стартового обновления панели:', error);
    });

    setInterval(() => {
      doPanelUpdate(false).catch(error => {
        console.error('Ошибка interval обновления панели:', error);
      });
    }, UPDATE_INTERVAL_MS);

    if (AUTO_RANKS.enabled) {
      setInterval(() => {
        syncAutoRanks('interval').catch(error => {
          console.error('Ошибка interval авто-рангов:', error);
        });
      }, AUTO_RANKS.intervalMs);
    }
  } catch (error) {
    console.error('Критическая ошибка clientReady:', error);
  }
});

client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot || !message.member) return;

  if (isPremiumGuild(message.guild.id) && LEAK_GUARD.enabled && containsDiscordInvite(message.content) && !canBypassLeakGuard(message.member)) {
    await message.delete().catch(() => {});
    const notice = await message.channel.send({ content: copy.security.inviteGuardNotice(message.author.id) }).catch(() => null);
    if (notice) {
      setTimeout(() => notice.delete().catch(() => {}), 10000);
    }
    await sendSecurityLog(message.guild, copy.security.inviteBlocked);
    return;
  }

  if (!hasFamilyRole(message.member)) return;
  getGuildStorage(message.guild.id).trackMessage(message.member.id);
});

client.on('presenceUpdate', (_, presence) => {
  const member = presence?.member;
  if (!member || !hasFamilyRole(member)) return;
  getGuildStorage(member.guild.id).trackPresence(member.id);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user?.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  if (!oldChannelId && newChannelId) {
    startVoiceSession(member);
    return;
  }

  if (oldChannelId && !newChannelId) {
    stopVoiceSession(member);
    return;
  }

  if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    stopVoiceSession(member);
    startVoiceSession(member);
  }
});

client.on('guildMemberAdd', async member => {
  if (member.user?.bot) return;
  const blocked = await enforceBlacklist(member);
  if (!blocked) {
    await sendWelcomeInvite(member);
  }
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
  const before = hasFamilyRole(oldMember);
  const after = hasFamilyRole(newMember);
  if (before !== after) setTimeout(() => doPanelUpdate(newMember.guild.id, false), 2000);
});

client.on('channelDelete', async channel => {
  if (!CHANNEL_GUARD.enabled || !channel?.guild || !isPremiumGuild(channel.guild.id)) return;

  try {
    const executor = await fetchDeletedChannelExecutor(channel.guild, channel.id);
    if (executor) {
      const executorMember = await channel.guild.members.fetch(executor.id).catch(() => null);
      if (canBypassChannelGuard(executorMember)) {
        return;
      }
    }

    const restored = await restoreDeletedChannel(channel, copy.security.channelGuardReason);
    if (restored) {
      await sendSecurityLog(channel.guild, copy.security.channelRestored(channel.name));
    }
  } catch (error) {
    console.error('Ошибка защиты каналов:', error);
  }
});

process.on('SIGINT', () => {
  flushVoiceSessions();
  database.flush();
  storage.flush();
  process.exit(0);
});

process.on('SIGTERM', () => {
  flushVoiceSessions();
  database.flush();
  storage.flush();
  process.exit(0);
});

process.on('beforeExit', () => {
  flushVoiceSessions();
  database.flush();
  storage.flush();
});

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const guildId = interaction.guild.id;
      const guildStorage = getGuildStorage(guildId);
      const applicationsService = getApplicationsService(guildId);
      const rankService = getRankService(guildId);

      if (interaction.commandName === 'family') {
        const settings = resolveGuildSettings(guildId);
        const summary = buildFamilyDashboardStats(interaction.guild);
        return interaction.reply(ephemeral({
          embeds: [embeds.buildFamilyMenuEmbed({ imageUrl: settings.visuals.familyBanner, summary })],
          components: embeds.panelButtons()
        }));
      }

      if (interaction.commandName === 'apply') {
        const secondsLeft = applicationsService.getCooldownSecondsLeft(interaction.user.id, APPLICATION_COOLDOWN_MS);
        if (secondsLeft > 0) {
          return interaction.reply(ephemeral({ content: copy.common.cooldown(secondsLeft) }));
        }

        return interaction.showModal(embeds.buildApplyModal());
      }

      if (interaction.commandName === 'applypanel') {
        if (!canApplications(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        return applicationsService.sendApplyPanel(interaction);
      }

      if (interaction.commandName === 'applications') {
        return interaction.reply(ephemeral({
          embeds: [embeds.buildApplicationsListEmbed(guildStorage.listRecentApplications(10))]
        }));
      }

      if (interaction.commandName === 'setup') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const record = database.markSetupComplete(interaction.guild.id, buildGuildSettingsSnapshot(interaction.guild));
        return interaction.reply(ephemeral({
          content: copy.admin.setupSaved,
          embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
        }));
      }

      if (interaction.commandName === 'adminpanel') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const record = getGuildRecord(interaction.guild);
        return interaction.reply(ephemeral({
          embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
        }));
      }

      if (interaction.commandName === 'help') {
          const catalog = getHelpCatalog(interaction);
          return interaction.reply(ephemeral({
            embeds: [embeds.buildHelpEmbed(catalog)]
          }));
        }

      if (interaction.commandName === 'setrole') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const key = interaction.options.getString(copy.commands.roleTargetOptionName, true);
        const role = interaction.options.getRole(copy.commands.roleValueOptionName, true);
        database.updateGuildSettings(guildId, { roles: { [key]: role.id } });
        const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
        await doPanelUpdate(guildId, true);
        return interaction.reply(
          ephemeral({
            content: `Роль **${key}** сохранена: <@&${role.id}>`,
            embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
          })
        );
      }

      if (interaction.commandName === 'setchannel') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const key = interaction.options.getString(copy.commands.channelTargetOptionName, true);
        const channel = interaction.options.getChannel(copy.commands.channelValueOptionName, true);
        database.updateGuildSettings(guildId, { channels: { [key]: channel.id } });
        const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
        if (key === 'panel') {
          await doPanelUpdate(guildId, true);
        }
        return interaction.reply(
          ephemeral({
            content: `Канал **${key}** сохранён: <#${channel.id}>`,
            embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
          })
        );
      }

      if (interaction.commandName === 'setfamilytitle') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const familyTitle = interaction.options.getString(copy.commands.familyTitleOptionName, true).trim().slice(0, 80);
        database.updateGuildSettings(guildId, { familyTitle });
        const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
        await doPanelUpdate(guildId, true);
        return interaction.reply(
          ephemeral({
            content: `Название семьи обновлено: **${familyTitle}**`,
            embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
          })
        );
      }

      if (interaction.commandName === 'setart') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const key = interaction.options.getString(copy.commands.artTargetOptionName, true);
        const rawValue = interaction.options.getString(copy.commands.artUrlOptionName, true).trim();
        const clearValues = new Set(['off', 'none', 'clear', 'remove']);
        const value = clearValues.has(rawValue.toLowerCase()) ? '' : rawValue;

        if (value && !/^https?:\/\/\S+/i.test(value)) {
          return interaction.reply(ephemeral({ content: 'Укажи прямую ссылку на изображение через http/https или напиши `off`.' }));
        }

        database.updateGuildSettings(guildId, { visuals: { [key]: value } });
        const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
        await doPanelUpdate(guildId, true);
        return interaction.reply(
          ephemeral({
            content: value ? `Баннер **${key}** сохранён.` : `Баннер **${key}** отключён.`,
            embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
          })
        );
      }

      if (interaction.commandName === 'purge') {
        if (!canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const count = interaction.options.getInteger(copy.commands.countOptionName, true);
        if (count < 1 || count > 500) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.invalidCount });
        }

        const channel = resolveTargetTextChannel(interaction);
        if (!channel) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
        }

        if (!canManageTargetChannel(interaction.member, channel)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const messages = await fetchRecentDeletableMessages(channel, count);
        const deleted = await deleteMessagesFast(messages);

        return editReplyAndAutoDelete(interaction, { content: copy.moderation.purgeDone(deleted, channel.id) });
      }

      if (interaction.commandName === 'purgeuser') {
        if (!isPremiumGuild(guildId)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.premiumOnly });
        }

        if (!canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const count = interaction.options.getInteger(copy.commands.countOptionName, true);
        if (count < 1 || count > 500) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.invalidCount });
        }

        const channel = resolveTargetTextChannel(interaction);
        if (!channel) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
        }

        if (!canManageTargetChannel(interaction.member, channel)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { messages, matched, blocked, system } = await fetchMessagesForUser(channel, user.id, count);
        const deleted = await deleteMessagesFast(messages);
        return editReplyAndAutoDelete(interaction, {
          content: copy.moderation.purgeUserDetailed(deleted, matched, blocked, system, user.id, channel.id)
        });
      }

      if (interaction.commandName === 'clearallchannel') {
        if (!isPremiumGuild(guildId)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.premiumOnly });
        }

        if (!canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const confirmation = interaction.options.getString(copy.commands.confirmOptionName, true).trim().toUpperCase();
        if (confirmation !== 'CLEAR') {
          return replyAndAutoDelete(interaction, { content: copy.moderation.invalidConfirmation });
        }

        const channel = resolveTargetTextChannel(interaction);
        if (!channel) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
        }

        if (!canManageTargetChannel(interaction.member, channel)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        {
          const clearClone = await channel.clone({ reason: `Full clear by ${interaction.user.id}` }).catch(() => null);
          if (clearClone) {
            await clearClone.setPosition(channel.rawPosition).catch(() => {});

            const wasPanelChannel = resolveGuildSettings(guildId).channels.panel === channel.id;
            const removedOld = await channel.delete(`Full clear by ${interaction.user.id}`).then(() => true).catch(() => false);

            if (removedOld) {
              remapConfiguredChannelIds(guildId, channel.id, clearClone.id);

              if (wasPanelChannel) {
                storage.setGuildPanelMessageId(guildId, '');
                await doPanelUpdate(guildId, true);
              }

              return editReplyAndAutoDelete(interaction, {
                content: copy.moderation.clearChannelDone(channel.id, clearClone.id)
              });
            }

            await clearClone.delete(`Rollback failed clear by ${interaction.user.id}`).catch(() => {});
          }

          const { deleted, requested, skippedSystem, skippedBlocked } = await clearChannelByMessages(channel);
          const skippedTotal = skippedSystem + skippedBlocked + Math.max(0, requested - deleted);

          if (deleted > 0 && skippedTotal > 0) {
            return editReplyAndAutoDelete(interaction, {
              content: copy.moderation.clearChannelPartial(channel.id, deleted, skippedTotal)
            });
          }

          if (deleted > 0) {
            return editReplyAndAutoDelete(interaction, {
              content: `РљР°РЅР°Р» <#${channel.id}> РѕС‡РёС‰РµРЅ РїРѕ СЃРѕРѕР±С‰РµРЅРёСЏРј. РЈРґР°Р»РµРЅРѕ: **${deleted}**.`
            });
          }

          return editReplyAndAutoDelete(interaction, {
            content: copy.moderation.actionFailed('clearallchannel')
          });
        }

        const cloned = await channel.clone({ reason: `Full clear by ${interaction.user.id}` }).catch(() => null);
        if (!cloned) {
          const { messages, skippedSystem } = await fetchAllDeletableMessages(channel);
          const deleted = await deleteMessagesFast(messages);
          if (deleted > 0) {
            const content = skippedSystem > 0
              ? copy.moderation.clearChannelPartial(channel.id, deleted, skippedSystem)
              : `Канал <#${channel.id}> очищен по сообщениям. Удалено: **${deleted}**.`;
            return editReplyAndAutoDelete(interaction, { content });
          }

          return editReplyAndAutoDelete(interaction, { content: copy.moderation.actionFailed('clearallchannel') });
        }

        await cloned.setPosition(channel.rawPosition).catch(() => {});
        remapConfiguredChannelIds(guildId, channel.id, cloned.id);

        if (resolveGuildSettings(guildId).channels.panel === cloned.id) {
          storage.setGuildPanelMessageId(guildId, '');
        }

        await channel.delete(`Full clear by ${interaction.user.id}`).catch(() => {});
        if (resolveGuildSettings(guildId).channels.panel === cloned.id) {
          await doPanelUpdate(guildId, true);
        }

        return editReplyAndAutoDelete(interaction, { content: copy.moderation.clearChannelDone(channel.id, cloned.id) });
      }

      if (interaction.commandName === 'kickroless') {
        if (!isPremiumGuild(guildId)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.premiumOnly });
        }

        if (!canUseSecurity(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await runRolelessCleanupDetailed(guildId, `manual:${interaction.user.id}`, { force: true });

        if (!result) {
          return editReplyAndAutoDelete(interaction, { content: copy.moderation.actionFailed('kickroless') });
        }

        return editReplyAndAutoDelete(interaction, {
          content: copy.moderation.kickRolessDone(result.kicked.length, result.failed.length)
        });
      }

      if (interaction.commandName === 'mute') {
        if (!canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const settings = resolveGuildSettings(guildId);
        if (!settings.muteRoleId) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.muteRoleMissing });
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const member = await fetchMemberFast(interaction.guild, user.id);
        if (!member) {
          return replyAndAutoDelete(interaction, { content: copy.profile.notFound });
        }

        const muteRole = interaction.guild.roles.cache.get(settings.muteRoleId)
          || await interaction.guild.roles.fetch(settings.muteRoleId).catch(() => null);
        if (!muteRole) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.muteRoleMissing });
        }

        const reason = interaction.options.getString(copy.commands.reasonOptionName) || 'Mute via bot';
        const ok = await member.roles.add(muteRole, reason).then(() => true).catch(() => false);
        if (!ok) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.actionFailed('mute') });
        }

        return replyAndAutoDelete(interaction, { content: copy.moderation.muteDone(user.id, muteRole.id) });
      }

      if (interaction.commandName === 'unmute') {
        if (!canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const settings = resolveGuildSettings(guildId);
        if (!settings.muteRoleId) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.muteRoleMissing });
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const member = await fetchMemberFast(interaction.guild, user.id);
        if (!member) {
          return replyAndAutoDelete(interaction, { content: copy.profile.notFound });
        }

        const ok = await member.roles.remove(settings.muteRoleId, 'Unmute via bot').then(() => true).catch(() => false);
        if (!ok) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.actionFailed('unmute') });
        }

        return replyAndAutoDelete(interaction, { content: copy.moderation.unmuteDone(user.id) });
      }

      if (interaction.commandName === 'lockchannel') {
        if (!canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const channel = resolveTargetTextChannel(interaction);
        if (!channel) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
        }

        if (!canManageTargetChannel(interaction.member, channel)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const ok = await channel.permissionOverwrites
          .edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason: `Locked by ${interaction.user.id}` })
          .then(() => true)
          .catch(() => false);
        if (!ok) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.actionFailed('lockchannel') });
        }

        return replyAndAutoDelete(interaction, { content: copy.moderation.lockDone(channel.id) });
      }

      if (interaction.commandName === 'unlockchannel') {
        if (!canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const channel = resolveTargetTextChannel(interaction);
        if (!channel) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
        }

        if (!canManageTargetChannel(interaction.member, channel)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const ok = await channel.permissionOverwrites
          .edit(interaction.guild.roles.everyone, { SendMessages: null }, { reason: `Unlocked by ${interaction.user.id}` })
          .then(() => true)
          .catch(() => false);
        if (!ok) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.actionFailed('unlockchannel') });
        }

        return replyAndAutoDelete(interaction, { content: copy.moderation.unlockDone(channel.id) });
      }

      if (interaction.commandName === 'slowmode') {
        if (!canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const seconds = interaction.options.getInteger(copy.commands.secondsOptionName, true);
        if (seconds < 0 || seconds > 21600) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.invalidSeconds });
        }

        const channel = resolveTargetTextChannel(interaction);
        if (!channel) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.notTextChannel });
        }

        if (!canManageTargetChannel(interaction.member, channel)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const ok = await channel.setRateLimitPerUser(seconds, `Slowmode by ${interaction.user.id}`).then(() => true).catch(() => false);
        if (!ok) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.actionFailed('slowmode') });
        }

        return replyAndAutoDelete(interaction, { content: copy.moderation.slowmodeDone(channel.id, seconds) });
      }

      if (interaction.commandName === 'warnhistory') {
        if (!canDiscipline(interaction.member) && !canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const entries = guildStorage.listWarns(user.id, 10);
        const embed = new EmbedBuilder()
          .setColor(0xf97316)
          .setTitle(copy.moderation.warnHistoryTitle(user.tag || user.username))
          .setDescription(
            entries.length
              ? entries
                .map((entry, index) => copy.moderation.warnHistoryLine(index, {
                  ...entry,
                  createdAt: formatModerationTimestamp(entry.createdAt)
                }))
                .join('\n')
                .slice(0, 4000)
              : copy.moderation.warnHistoryEmpty
          )
          .setFooter({ text: 'BRHD • Phoenix • Moderation' });

        return replyAndAutoDelete(interaction, { embeds: [embed] });
      }

      if (interaction.commandName === 'clearwarns') {
        if (!isPremiumGuild(guildId)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.premiumOnly });
        }

        if (!canDiscipline(interaction.member) && !canModerate(interaction.member)) {
          return replyAndAutoDelete(interaction, { content: copy.moderation.noAccess });
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const cleared = guildStorage.clearWarns(user.id);
        await doPanelUpdate(guildId, false);
        return replyAndAutoDelete(interaction, { content: copy.moderation.clearWarnsDone(user.id, cleared) });
      }

      if (interaction.commandName === 'leaderboard') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        return interaction.reply(ephemeral({
          embeds: [embeds.buildLeaderboardEmbed(buildLeaderboardLines(interaction.guild, 15), buildLeaderboardSummary(interaction.guild))]
        }));
      }

      if (interaction.commandName === 'voiceactivity') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        return interaction.reply(ephemeral({
          embeds: [embeds.buildVoiceActivityEmbed(buildVoiceActivityLines(interaction.guild, 15), buildVoiceActivitySummary(interaction.guild))]
        }));
      }

      if (interaction.commandName === 'activityreport') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const user = interaction.options.getUser(copy.commands.userOptionName);
        if (user) {
          const member = await fetchMemberFast(interaction.guild, user.id);
          if (!member) {
            return interaction.reply(ephemeral({ content: copy.profile.notFound }));
          }

          return interaction.reply(ephemeral({ embeds: [buildPremiumActivityReportEmbed(interaction.guild, member)] }));
        }

        return interaction.reply(ephemeral({ embeds: [buildPremiumActivityReportEmbed(interaction.guild)] }));
      }

      if (interaction.commandName === 'aiadvisor') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const user = interaction.options.getUser(copy.commands.userOptionName) || interaction.user;
        const member = await fetchMemberFast(interaction.guild, user.id);
        if (!member) {
          return interaction.reply(ephemeral({ content: copy.profile.notFound }));
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
          const embed = await buildAiAdvisorEmbed(interaction.guild, member);
          return interaction.editReply({ embeds: [embed] });
        } catch (error) {
          return interaction.editReply({ content: copy.ai.unavailable(error?.message || copy.ai.advisorUnavailable) });
        }
      }

      if (interaction.commandName === 'subscription') {
        if (!isOwner(interaction.user.id)) {
          return interaction.reply(ephemeral({ content: copy.admin.noOwnerAccess }));
        }

        const plan = interaction.options.getString(copy.commands.planOptionName, true);
        const record = database.setSubscription(interaction.guild.id, {
          plan,
          assignedBy: interaction.user.id
        });

        return interaction.reply(ephemeral({
          content: copy.admin.subscriptionUpdated(plan),
          embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
        }));
      }

      if (interaction.commandName === 'blacklistadd') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canUseSecurity(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const reason = interaction.options.getString(copy.commands.reasonOptionName, true);
        const existed = guildStorage.isBlacklisted(user.id);
        guildStorage.addBlacklistEntry({
          userId: user.id,
          moderatorId: interaction.user.id,
          reason
        });

        const member = await fetchMemberFast(interaction.guild, user.id);
        if (member) {
          await enforceBlacklist(member);
        } else {
          await sendBlacklistDm(user, interaction.guild, reason).catch(() => {});
          await interaction.guild.bans.create(user.id, { reason: copy.security.blacklistBanReason(reason) }).catch(() => {});
        }

        return interaction.reply(
          ephemeral({
            content: existed ? copy.security.blacklistUpdated(user.id, reason) : copy.security.blacklistAdded(user.id, reason)
          })
        );
      }

      if (interaction.commandName === 'blacklistremove') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canUseSecurity(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const removed = guildStorage.removeBlacklistEntry(user.id);
        if (!removed) {
          return interaction.reply(ephemeral({ content: copy.security.blacklistNotFound }));
        }

        await interaction.guild.bans.remove(user.id).catch(() => {});
        return interaction.reply(ephemeral({ content: copy.security.blacklistRemoved(user.id) }));
      }

      if (interaction.commandName === 'blacklistlist') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canUseSecurity(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
        }

        return interaction.reply(ephemeral({
          embeds: [embeds.buildBlacklistEmbed(guildStorage.listBlacklist().slice(0, 25))]
        }));
      }

      if (interaction.commandName === 'banlist') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canUseSecurity(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
        }

        const bans = await interaction.guild.bans.fetch().catch(() => null);
        const entries = bans ? [...bans.values()].slice(0, 25) : [];

        return interaction.reply(ephemeral({
          embeds: [embeds.buildBanListEmbed(entries)]
        }));
      }

      if (interaction.commandName === 'unbanid') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canUseSecurity(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
        }

        const userId = interaction.options.getString(copy.commands.userIdOptionName, true).trim();
        if (!/^\d{5,25}$/.test(userId)) {
          return interaction.reply(ephemeral({ content: copy.security.unbanFailed(userId) }));
        }

        const removedFromBlacklist = guildStorage.removeBlacklistEntry(userId);
        const unbanned = await interaction.guild.bans.remove(userId).then(() => true).catch(() => false);

        if (!unbanned && !removedFromBlacklist) {
          return interaction.reply(ephemeral({ content: copy.security.unbanFailed(userId) }));
        }

        return interaction.reply(ephemeral({ content: copy.security.unbanSuccess(userId) }));
      }

      if (interaction.commandName === 'debugconfig') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noDebugAccess }));
        }

        const liveConfig = createConfig(process.env);
        const liveDiagnostics = validateConfig(liveConfig);

        return interaction.reply(ephemeral({
          embeds: [
            embeds.buildDebugConfigEmbed({
              summaryLines: summarizeConfig(liveConfig),
              validation: liveDiagnostics
            })
          ]
        }));
      }

      if (interaction.commandName === 'testaccept') {
        if (!resolveGuildSettings(guildId).channels.logs) {
          return interaction.reply(ephemeral({ content: copy.logs.missingLogChannel }));
        }

        await sendAcceptLog(interaction.guild, interaction.member, interaction.user);
        return interaction.reply(ephemeral({ content: copy.logs.testAcceptSent }));
      }

      if (interaction.commandName === 'profile') {
        const user = interaction.options.getUser(copy.commands.userOptionName) || interaction.user;
        const member = await fetchMemberFast(interaction.guild, user.id);
        if (!member) {
          return interaction.reply(ephemeral({ content: copy.profile.notFound }));
        }

        return interaction.reply(ephemeral(buildProfilePayload(member, canManageRanks(interaction.member))));
      }

      if (interaction.commandName === 'warn') {
        if (!canDiscipline(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const reason = interaction.options.getString(copy.commands.reasonOptionName, true);
        guildStorage.addWarn({ userId: user.id, moderatorId: interaction.user.id, reason });

        await sendDisciplineLog(
          interaction.guild,
          embeds.buildWarnLogEmbed({
            targetUser: user,
            moderatorUser: interaction.user,
            reason
          })
        );
        await sendDisciplineDm('warn', interaction.guild, user, interaction.user, reason).catch(() => {});

        const member = await fetchMemberFast(interaction.guild, user.id);
        if (member && AUTO_RANKS.enabled && isPremiumGuild(interaction.guild.id)) {
          const autoRankResult = await rankService.applyAutoRank(member).catch(() => null);
          if (autoRankResult?.ok) {
            await sendRankDm(interaction.guild, member, autoRankResult).catch(() => {});
          }
          await doPanelUpdate(guildId, false);
        }

        return interaction.reply(ephemeral({ content: copy.discipline.warnReply(user.id) }));
      }

      if (interaction.commandName === 'commend') {
        if (!canDiscipline(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const user = interaction.options.getUser(copy.commands.userOptionName, true);
        const reason = interaction.options.getString(copy.commands.reasonOptionName, true);
        guildStorage.addCommend({ userId: user.id, moderatorId: interaction.user.id, reason });

        await sendDisciplineLog(
          interaction.guild,
          embeds.buildCommendLogEmbed({
            targetUser: user,
            moderatorUser: interaction.user,
            reason
          })
        );
        await sendDisciplineDm('commend', interaction.guild, user, interaction.user, reason).catch(() => {});

        const member = await fetchMemberFast(interaction.guild, user.id);
        if (member && AUTO_RANKS.enabled && isPremiumGuild(interaction.guild.id)) {
          const autoRankResult = await rankService.applyAutoRank(member).catch(() => null);
          if (autoRankResult?.ok) {
            await sendRankDm(interaction.guild, member, autoRankResult).catch(() => {});
          }
          await doPanelUpdate(guildId, false);
        }

        return interaction.reply(ephemeral({ content: copy.discipline.commendReply(user.id) }));
      }

      if (interaction.commandName === 'ai') {
        if (!isPremiumGuild(interaction.guild.id)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        const query = interaction.options.getString(copy.commands.queryOptionName, true);
        const targetUser = interaction.options.getUser(copy.commands.userOptionName);
        const desiredNickname = (interaction.options.getString(copy.commands.nicknameOptionName) || '').trim();
        const queryLower = query.toLowerCase();
        const wantsNicknameChange = queryLower.includes('смени ник')
          || queryLower.includes('измени ник')
          || queryLower.includes('переименуй')
          || queryLower.includes('rename nick');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        if (isAiCommandOverviewQuery(query)) {
          return interaction.editReply({ content: buildAiCommandsOverview(interaction) });
        }

        if (wantsNicknameChange) {
          if (!targetUser || !desiredNickname) {
            return interaction.editReply({ content: copy.ai.nicknameMissingTarget });
          }

          if (!canManageNicknames(interaction.member)) {
            return interaction.editReply({ content: copy.ai.nicknameNoAccess });
          }

          if (desiredNickname.length < 1 || desiredNickname.length > 32) {
            return interaction.editReply({ content: copy.ai.nicknameTooLong });
          }

          const targetMember = await fetchMemberFast(interaction.guild, targetUser.id);
          if (!targetMember) {
            return interaction.editReply({ content: copy.profile.notFound });
          }

          const ok = await targetMember.setNickname(desiredNickname, `AI request by ${interaction.user.id}`)
            .then(() => true)
            .catch(() => false);

          return interaction.editReply({
            content: ok ? copy.ai.nicknameDone(targetUser.id, desiredNickname) : copy.ai.nicknameFailed
          });
        }

        try {
          const answer = await aiService.aiText(copy.ai.assistantPrompt, query);
          return interaction.editReply({ content: answer.slice(0, 1900) });
        } catch (error) {
          return interaction.editReply({ content: copy.ai.unavailable(error.message) });
        }
      }
    }

    if (interaction.isButton()) {
      const guildId = interaction.guild.id;
      const guildStorage = getGuildStorage(guildId);
      const applicationsService = getApplicationsService(guildId);
      const rankService = getRankService(guildId);

      if (interaction.customId === 'family_refresh') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await syncAutoRanks(guildId, 'manual-refresh');
        await doPanelUpdate(guildId, true);
        await interaction.editReply({ content: copy.family.panelUpdated });
        setTimeout(() => {
          interaction.deleteReply().catch(() => {});
        }, 3000);
        return;
      }

      if (interaction.customId === 'family_profile') {
        return interaction.reply(ephemeral(buildProfilePayload(interaction.member, canManageRanks(interaction.member))));
      }

      if (interaction.customId === 'family_leaderboard') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        return interaction.reply(ephemeral({
          embeds: [embeds.buildLeaderboardEmbed(buildLeaderboardLines(interaction.guild, 15), buildLeaderboardSummary(interaction.guild))]
        }));
      }

      if (interaction.customId === 'family_voice') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        return interaction.reply(ephemeral({
          embeds: [embeds.buildVoiceActivityEmbed(buildVoiceActivityLines(interaction.guild, 15), buildVoiceActivitySummary(interaction.guild))]
        }));
      }

      if (interaction.customId === 'family_apply') {
        const secondsLeft = applicationsService.getCooldownSecondsLeft(interaction.user.id, APPLICATION_COOLDOWN_MS);
        if (secondsLeft > 0) {
          return interaction.reply(ephemeral({ content: copy.common.cooldown(secondsLeft) }));
        }

        return interaction.showModal(embeds.buildApplyModal());
      }

      if (interaction.customId === 'admin_applications') {
        if (!canApplications(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        return interaction.reply(ephemeral({
          embeds: [embeds.buildApplicationsListEmbed(guildStorage.listRecentApplications(10))]
        }));
      }

      if (interaction.customId === 'admin_aiadvisor') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        return interaction.showModal(embeds.buildAiAdvisorModal());
      }

      if (interaction.customId === 'admin_panel') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        return interaction.reply(ephemeral({
          embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record: getGuildRecord(interaction.guild) })]
        }));
      }

      if (interaction.customId === 'admin_blacklist') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canUseSecurity(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.security.noSecurityAccess }));
        }

        return interaction.reply(ephemeral({
          embeds: [embeds.buildBlacklistEmbed(guildStorage.listBlacklist().slice(0, 25))]
        }));
      }

      if (interaction.customId === 'admin_activityreport') {
        if (!isPremiumGuild(guildId)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        return interaction.reply(ephemeral({
          embeds: [buildPremiumActivityReportEmbed(interaction.guild)]
        }));
      }

      if (interaction.customId.startsWith('rank_')) {
        if (!canManageRanks(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const [action, userId] = interaction.customId.split(':');
        const member = await fetchMemberFast(interaction.guild, userId);
        if (!member) {
          return interaction.reply(ephemeral({ content: copy.profile.notFound }));
        }

        let result;
        try {
          if (action === 'rank_promote') {
            result = await rankService.promote(member);
          } else if (action === 'rank_demote') {
            result = await rankService.demote(member);
          } else {
            if (!isPremiumGuild(interaction.guild.id)) {
              return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
            }
            result = await rankService.applyAutoRank(member);
          }
        } catch (error) {
          console.error('Ошибка изменения ранга:', error);
          return interaction.reply(ephemeral({ content: copy.ranks.permissionFailed }));
        }

        const refreshedMember = await refreshMember(member);
        await sendRankDm(interaction.guild, refreshedMember, result).catch(() => {});
        await interaction.update(buildProfilePayload(refreshedMember, true, formatRankResult(userId, result)));
        await doPanelUpdate(guildId, false);
        return;
      }

      if (interaction.customId.startsWith('app_accept:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const [, applicationId, userId] = interaction.customId.split(':');
        return interaction.showModal(embeds.buildAcceptModal(applicationId, userId, interaction.message.id));
      }

      if (interaction.customId.startsWith('app_ai:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        if (!isPremiumGuild(interaction.guild.id)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        const [, applicationId] = interaction.customId.split(':');
        const application = guildStorage.findApplication(applicationId);
        if (!application) {
          return interaction.reply(ephemeral({ content: copy.applications.notFound }));
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const analysis = await aiService.analyzeApplication(application);
          const embed = new EmbedBuilder()
            .setColor(0x3b82f6)
            .setTitle(copy.ai.buttonTitle)
            .setDescription(analysis.slice(0, 3900))
            .setFooter({ text: copy.ai.buttonFooter(applicationId) })
            .setTimestamp();

          return interaction.editReply({ embeds: [embed] });
        } catch (error) {
          return interaction.editReply({ content: copy.ai.unavailable(error.message) });
        }
      }

      if (interaction.customId.startsWith('app_review:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const [, applicationId, userId] = interaction.customId.split(':');
        return applicationsService.moveToReview(interaction, applicationId, userId);
      }

      if (interaction.customId.startsWith('app_reject:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const [, applicationId, userId] = interaction.customId.split(':');
        return applicationsService.reject(interaction, applicationId, userId);
      }

      if (interaction.customId.startsWith('app_close:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const [, applicationId] = interaction.customId.split(':');
        return applicationsService.closeTicket(interaction, applicationId);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'family_apply_modal') {
        return getApplicationsService(interaction.guild.id).submitApplication(interaction);
      }

      if (interaction.customId === 'family_aiadvisor_modal') {
        if (!isPremiumGuild(interaction.guild.id)) {
          return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
        }

        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const member = await resolveMemberQuery(
          interaction.guild,
          interaction.fields.getTextInputValue('aiadvisor_member'),
          interaction.user.id
        );
        if (!member) {
          return interaction.reply(ephemeral({ content: copy.profile.notFound }));
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const embed = await buildAiAdvisorEmbed(interaction.guild, member);
          return interaction.editReply({ embeds: [embed] });
        } catch (error) {
          return interaction.editReply({ content: copy.ai.unavailable(error?.message || copy.ai.advisorUnavailable) });
        }
      }

      if (interaction.customId.startsWith('app_accept_modal:')) {
        if (!canApplications(interaction.member)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const [, applicationId, userId, messageId] = interaction.customId.split(':');
        const response = await getApplicationsService(interaction.guild.id).accept(interaction, applicationId, userId, {
          reason: interaction.fields.getTextInputValue('accept_reason'),
          rankName: interaction.fields.getTextInputValue('accept_rank'),
          messageId
        });
        await doPanelUpdate(interaction.guild.id, false);
        return response;
      }
    }
  } catch (error) {
    console.error('Ошибка interactionCreate:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply(ephemeral({ content: copy.common.unknownError })).catch(() => {});
    }
  }
});

client.login(config.token);
