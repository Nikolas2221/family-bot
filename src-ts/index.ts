// @ts-nocheck
import 'dotenv/config';

const path = require('path');
const { ChannelType, Client, EmbedBuilder, GatewayIntentBits, MessageFlags, Partials, PermissionFlagsBits } = require('discord.js');
const { createAIService } = require('./ai');
const { evaluateAutomodMessage, evaluateSpamActivity, normalizeAutomodConfig } = require('./automod');
const { createApplicationsService } = require('./applications');
const { buildCommands, getCommandsSignature, registerCommands } = require('./commands');
const { createConfig, printStartupDiagnostics, summarizeConfig, validateConfig } = require('./config');
const copy = require('./copy').default || require('./copy');
const { createDatabase, defaultModulesForMode } = require('./database');
const embeds = require('./embeds').default || require('./embeds');
const { createRankService } = require('./ranks');
const { getReleaseNotes } = require('./release-notes');
const ROLES = require('./roles').default || require('./roles');
const { containsDiscordInvite, explainKickFailure, fetchDeletedChannelExecutor, restoreDeletedChannel } = require('./security');
const { createStorage } = require('./storage');
const { createAccessApi } = require('./access');
const { registerClientReadyRuntime } = require('./client-ready-runtime');
const { registerEventRuntime } = require('./event-runtime');
const { registerInteractionRuntime } = require('./interaction-runtime');
const { handleCommandRuntime } = require('./command-runtime');
const {
  buildAiCommandsOverview: buildAiCommandsOverviewHelper,
  buildAutomodRulePatch,
  getAutomodStateKey,
  getAutomodTargetLimits,
  getUpdateChangeGroups,
  isAiCommandOverviewQuery,
  isAiNicknameRequest,
  isPremiumAutomodRule,
  isPremiumAutomodTarget
} = require('./runtime-command-helpers');
const { createGuildRuntimeApi, memberSessionKey: buildMemberSessionKey } = require('./guild-runtime');
const {
  editReplyAndAutoDelete: editReplyAndAutoDeleteHelper,
  ephemeral: makeEphemeral,
  replyAndAutoDelete: replyAndAutoDeleteHelper,
  scheduleDeleteReply: scheduleDeleteReplyHelper
} = require('./interaction-helpers');
const {
  PRODUCT_VERSION_LABEL,
  PRODUCT_VERSION_SEMVER,
  buildCurrentBuildSignature,
  getCurrentReleaseChangeGroups
} = require('./runtime-meta');

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
const REPORT_SCHEDULE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DEPLOY_COMMIT_SHA = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '').trim();
const DEPLOY_COMMIT_MESSAGE = (process.env.RAILWAY_GIT_COMMIT_MESSAGE || process.env.GIT_COMMIT_MESSAGE || '').trim();
const DEPLOY_BUILD_ID = (DEPLOY_COMMIT_SHA ? DEPLOY_COMMIT_SHA.slice(0, 7) : (process.env.RAILWAY_DEPLOYMENT_ID || PRODUCT_VERSION_SEMVER));
const CURRENT_BUILD_SIGNATURE = buildCurrentBuildSignature(DEPLOY_BUILD_ID);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const storage = createStorage({ dataFile: DATA_FILE });
const database = createDatabase({ dataFile: DATABASE_FILE });
const aiService = createAIService({ enabled: AI_ENABLED });
const ROLE_TEMPLATES = ROLES.map(role => ({ ...role }));
const automodState = new Map();
const guildRuntime = createGuildRuntimeApi({
  database,
  storage,
  roleTemplates: ROLE_TEMPLATES,
  defaults: {
    channelId: CHANNEL_ID,
    applicationsChannelId: APPLICATIONS_CHANNEL_ID,
    logChannelId: LOG_CHANNEL_ID,
    disciplineLogChannelId: DISCIPLINE_LOG_CHANNEL_ID,
    familyTitle: FAMILY_TITLE,
    accessApplications: ACCESS_APPLICATIONS,
    accessDiscipline: ACCESS_DISCIPLINE,
    accessRanks: ACCESS_RANKS,
    applicationDefaultRole: APPLICATION_DEFAULT_ROLE,
    features: {
      aiEnabled: AI_ENABLED,
      autoRanksEnabled: AUTO_RANKS.enabled,
      leakGuardEnabled: LEAK_GUARD.enabled,
      channelGuardEnabled: CHANNEL_GUARD.enabled
    },
    normalizeAutomodConfig
  }
});
const accessApi = createAccessApi({
  ownerIds: config.ownerIds,
  leakGuard: LEAK_GUARD,
  channelGuard: CHANNEL_GUARD,
  resolveGuildSettings: guildRuntime.resolveGuildSettings
});

function ephemeral(payload = {}) {
  return makeEphemeral(payload);
}

function scheduleDeleteReply(interaction, delayMs = 5000) {
  return scheduleDeleteReplyHelper(interaction, delayMs);
}

async function replyAndAutoDelete(interaction, payload, delayMs = 5000) {
  return replyAndAutoDeleteHelper(interaction, payload, delayMs);
}

async function editReplyAndAutoDelete(interaction, payload, delayMs = 5000) {
  return editReplyAndAutoDeleteHelper(interaction, payload, delayMs);
}

function memberSessionKey(guildId, memberId) {
  return buildMemberSessionKey(guildId, memberId);
}

function resolveGuildSettings(guildId) {
  return guildRuntime.resolveGuildSettings(guildId);
}

function getRoleIds(guildId) {
  return guildRuntime.getRoleIds(guildId);
}

function getGuildStorage(guildId) {
  return guildRuntime.getGuildStorage(guildId);
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
  return accessApi.hasPermission(member, permission);
}

function hasAnyRole(member, roleIds) {
  return accessApi.hasAnyRole(member, roleIds);
}

function isOwner(userId) {
  return accessApi.isOwner(userId);
}

function getGuildPlan(guildId) {
  return guildRuntime.getGuildPlan(guildId);
}

function isPremiumGuild(guildId) {
  return guildRuntime.isPremiumGuild(guildId);
}

function buildGuildSettingsSnapshot(guild) {
  return guildRuntime.buildGuildSettingsSnapshot(guild);
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
  const storedMinutes = guildStorage.getVoiceMinutes(member.id);
  const session = voiceSessions.get(memberSessionKey(member.guild.id, member.id));
  if (!session?.startedAt) return storedMinutes;

  return storedMinutes + Math.floor((Date.now() - session.startedAt) / 60000);
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
    const data = guildStorage.ensureMemberRecord(member.id);
    return Date.now() - Number(data.lastSeenAt || 0) >= AFK_WARNING_THRESHOLD_MS;
  }).length;

  const topEntry = familyMembers
    .map(member => ({
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

function buildLeaderboardLines(guild, limit = 10) {
  const guildStorage = getGuildStorage(guild.id);

  return getFamilyMembers(guild)
    .map(member => ({
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
    .map((entry, index) => copy.stats.leaderboardLine(index, entry.member, entry.roleName, entry.points, entry.voiceHours));
}

function buildVoiceActivityLines(guild, limit = 10) {
  const guildStorage = getGuildStorage(guild.id);

  return getFamilyMembers(guild)
    .map(member => ({
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

function buildLeaderboardSummary(guild) {
  const guildStorage = getGuildStorage(guild.id);
  const settings = resolveGuildSettings(guild.id);
  const members = getFamilyMembers(guild);
  const ranked = members
    .map(member => ({
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
    imageUrl: settings.visuals.familyBanner || ''
  };
}

function buildActivityReportEmbed(guild, targetMember = null) {
  const guildStorage = getGuildStorage(guild.id);

  if (targetMember) {
    const data = guildStorage.ensureMemberRecord(targetMember.id);
    return new EmbedBuilder()
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
    .map(member => {
      const data = guildStorage.ensureMemberRecord(member.id);
      return {
        member,
        line: `${getDisplayRankName(member)} - <@${member.id}> - ${guildStorage.getPointsScore(member.id)}/100 - ${formatVoiceHours(getLiveVoiceMinutes(member))} ч - ${formatTimeAgo(data.lastSeenAt)}`
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
    .setFooter({ text: 'BRHD - Phoenix - Activity Report' })
    .setTimestamp();
}

function buildPremiumActivityReportEmbed(guild, targetMember = null) {
  const guildStorage = getGuildStorage(guild.id);
  const settings = resolveGuildSettings(guild.id);

  if (targetMember) {
    const data = guildStorage.ensureMemberRecord(targetMember.id);
    const reputation = guildStorage.getPointsScore(targetMember.id);
    const voiceHours = formatVoiceHours(getLiveVoiceMinutes(targetMember));

    return new EmbedBuilder()
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
  }

  const members = getFamilyMembers(guild);
  const lines = members
    .map(member => {
      const data = guildStorage.ensureMemberRecord(member.id);
      return `${getDisplayRankName(member)} - <@${member.id}> - ${guildStorage.getPointsScore(member.id)}/100 - ${formatVoiceHours(getLiveVoiceMinutes(member))} ч - ${formatTimeAgo(data.lastSeenAt)}`;
    })
    .sort((left, right) => left.localeCompare(right, 'ru'))
    .slice(0, 25);

  const totalPoints = members.reduce((sum, member) => sum + guildStorage.getPointsScore(member.id), 0);
  const totalVoiceHours = members.reduce((sum, member) => sum + Number(formatVoiceHours(getLiveVoiceMinutes(member))), 0);
  const afkRiskCount = members.filter(member => {
    const data = guildStorage.ensureMemberRecord(member.id);
    return Date.now() - Number(data.lastSeenAt || 0) >= AFK_WARNING_THRESHOLD_MS;
  }).length;

  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('Отчёт по активности семьи - Phoenix')
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
    .setFooter({ text: 'BRHD - Phoenix - Premium Activity' })
    .setTimestamp();
}

function formatPeriodLabel(period) {
  return period === 'monthly' ? 'Ежемесячный статистический отчёт' : 'Еженедельный статистический отчёт';
}

function formatPeriodRangeLabel(analytics) {
  return analytics.dayCount >= 30
    ? `Отчёт за период с ${analytics.fromDayKey}`
    : `Отчёт за период: ${analytics.fromDayKey} - ${analytics.toDayKey}`;
}

function medal(index) {
  return `${index + 1}.`;
}

function formatMinutesLong(totalMinutes) {
  const safe = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}ч ${minutes}м`;
}

function normalizeReactionEmoji(emojiValue = '') {
  const raw = String(emojiValue || '').trim();
  if (!raw) return '';

  const customMatch = raw.match(/^<?a?:[\w~]+:(\d+)>?$/i);
  if (customMatch) {
    return customMatch[1];
  }

  return raw;
}

function getReactionEmojiKey(emoji) {
  if (!emoji) return '';
  return String(emoji.id || emoji.name || '').trim();
}

function getReactionRoleEntries(guildId) {
  return resolveGuildSettings(guildId).reactionRoles || [];
}

function findReactionRoleEntry(guildId, messageId, emojiKey) {
  const normalizedEmoji = normalizeReactionEmoji(emojiKey);
  return getReactionRoleEntries(guildId).find(
    entry => entry.messageId === String(messageId) && normalizeReactionEmoji(entry.emoji) === normalizedEmoji
  ) || null;
}

function getWeeklyReportKey(date = new Date()) {
  const value = new Date(date);
  const weekday = value.getDay() || 7;
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - weekday + 1);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-W-${month}-${day}`;
}

function getMonthlyReportKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function isScheduledReportDue(period, now = new Date()) {
  if (now.getHours() !== 2) return false;

  if (period === 'monthly') {
    return now.getDate() === 1;
  }

  return (now.getDay() || 7) === 1;
}

function getMemberLabel(guild, memberId) {
  const member = guild.members.cache.get(memberId);
  if (member) {
    return `<@${memberId}> | ${member.displayName}`;
  }

  return `<@${memberId}>`;
}

function getChannelLabel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `<#${channelId}>` : `#${channelId}`;
}

function buildRankedLines(entries, formatter, limit = 5) {
  return entries.slice(0, limit).map((entry, index) => `${medal(index)} ${formatter(entry)}`);
}

function buildServerStatsReportEmbed(guild, period = 'weekly') {
  const guildStorage = getGuildStorage(guild.id);
  const settings = resolveGuildSettings(guild.id);
  const analytics = guildStorage.getPeriodAnalytics(period === 'monthly' ? 30 : 7);
  const memberEntries = Object.entries(analytics.members || {});

  const topMessages = buildRankedLines(
    memberEntries
      .map(([memberId, stats]) => ({ memberId, value: stats.messages || 0 }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    item => `${getMemberLabel(guild, item.memberId)} - ${item.value} сообщений`
  );

  const topVoice = buildRankedLines(
    memberEntries
      .map(([memberId, stats]) => ({ memberId, value: stats.voiceMinutes || 0 }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    item => `${getMemberLabel(guild, item.memberId)} - ${formatMinutesLong(item.value)}`
  );

  const topReactions = buildRankedLines(
    memberEntries
      .map(([memberId, stats]) => ({ memberId, value: stats.reactions || 0 }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    item => `${getMemberLabel(guild, item.memberId)} - ${item.value} реакций`
  );

  const topChannels = buildRankedLines(
    Object.entries(analytics.channels || {})
      .map(([channelId, value]) => ({ channelId, value }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    item => `${getChannelLabel(guild, item.channelId)} - ${item.value} сообщений`
  );

  const topVoiceChannels = buildRankedLines(
    Object.entries(analytics.voiceChannels || {})
      .map(([channelId, value]) => ({ channelId, value }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    item => `${getChannelLabel(guild, item.channelId)} - ${formatMinutesLong(item.value)}`
  );

  return new EmbedBuilder()
    .setColor(period === 'monthly' ? 0xf59e0b : 0x2563eb)
    .setTitle(`📊 ${formatPeriodLabel(period)}`)
    .setDescription(formatPeriodRangeLabel(analytics))
    .setThumbnail(client.user?.displayAvatarURL?.() || null)
    .setImage(settings.visuals.familyBanner || null)
    .addFields(
      {
        name: '💬 Топ по сообщениям',
        value: topMessages.length ? topMessages.join('\n').slice(0, 1024) : 'Нет данных за период.'
      },
      {
        name: '🎤 Топ по голосовой активности',
        value: topVoice.length ? topVoice.join('\n').slice(0, 1024) : 'Нет данных за период.'
      },
      {
        name: '✨ Топ по реакциям',
        value: topReactions.length ? topReactions.join('\n').slice(0, 1024) : 'Нет данных за период.'
      },
      {
        name: '📌 Самые активные каналы',
        value: topChannels.length ? topChannels.join('\n').slice(0, 1024) : 'Нет данных за период.'
      },
      {
        name: '🔊 Топ по голосовым каналам',
        value: topVoiceChannels.length ? topVoiceChannels.join('\n').slice(0, 1024) : 'Нет данных за период.'
      },
      {
        name: '👋 Участники',
        value: [`Новые участники: **${analytics.joins}**`, `Ушедшие участники: **${analytics.leaves}**`].join('\n'),
        inline: true
      },
      {
        name: '📈 Общая статистика',
        value: [
          `Всего сообщений: **${analytics.messagesTotal}**`,
          `Время в войсе: **${formatMinutesLong(analytics.voiceMinutesTotal)}**`,
          `Всего реакций: **${analytics.reactionsTotal}**`
        ].join('\n'),
        inline: true
      }
    )
    .setFooter({ text: `BRHD - Phoenix - ${period === 'monthly' ? 'Monthly Stats' : 'Weekly Stats'}` })
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
  const memberData = guildStorage.ensureMemberRecord(member.id);
  const rankInfo = getRankService(guild.id).describeMember(member);
  const analysis = await aiService.analyzeMember({
    displayName: member.displayName,
    currentRoleName: rankInfo.currentRole?.name || copy.profile.noRoles,
    autoTargetRoleName: rankInfo.autoTargetRole?.name || '',
    activityScore: guildStorage.getActivityScore(member.id),
    points: guildStorage.getPointsScore(member.id),
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

function getCommandModule(commandName) {
  switch (commandName) {
    case 'family':
    case 'profile':
      return 'family';
    case 'apply':
    case 'applypanel':
    case 'applications':
      return 'applications';
    case 'warn':
    case 'commend':
    case 'purge':
    case 'purgeuser':
    case 'clearallchannel':
    case 'kickroless':
    case 'mute':
    case 'unmute':
    case 'lockchannel':
    case 'unlockchannel':
    case 'slowmode':
    case 'warnhistory':
    case 'clearwarns':
      return 'moderation';
    case 'blacklistadd':
    case 'blacklistremove':
    case 'blacklistlist':
    case 'banlist':
    case 'unbanid':
      return 'security';
    case 'leaderboard':
    case 'voiceactivity':
    case 'activityreport':
    case 'serverreport':
    case 'reportschedule':
      return 'analytics';
    case 'ai':
    case 'aiadvisor':
      return 'ai';
    case 'welcome':
    case 'autorole':
    case 'reactionrole':
    case 'verification':
    case 'rolemenu':
      return 'welcome';
    case 'automod':
      return 'automod';
    case 'customcommand':
      return 'customCommands';
    default:
      return null;
  }
}

function isModuleEnabled(guildId, moduleName) {
  return guildRuntime.isModuleEnabled(guildId, moduleName);
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
    { name: 'welcome', description: copy.commands.welcomeDescription },
    { name: 'autorole', description: copy.commands.autoroleDescription },
    { name: 'setmode', description: copy.commands.setModeDescription },
    { name: 'setmodule', description: copy.commands.setModuleDescription },
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
    { name: 'serverreport', description: copy.commands.serverReportDescription },
    { name: 'automod', description: copy.commands.automodDescription },
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
    { name: 'clearwarns', description: copy.commands.clearWarnsDescription },
    { name: 'reactionrole', description: copy.commands.reactionRoleDescription },
    { name: 'reportschedule', description: copy.commands.reportScheduleDescription }
  ];

  if (isOwner(userId)) {
    adminFree.push({ name: 'subscription', description: copy.commands.subscriptionDescription });
  }

  const premium = isPremiumGuild(guildId);
  const availableRegularBase = premium ? [...regularFree, ...regularPremium] : regularFree;
  const availableRegular = availableRegularBase.filter(command => canUseCommandInContext(command.name, interaction));
  const availableAdminBase = premium ? [...adminFree, ...adminPremium] : adminFree;
  const availableAdmin = availableAdminBase.filter(command => canUseCommandInContext(command.name, interaction));
  const lockedPremiumRegular = premium ? [] : regularPremium.filter(command => isModuleEnabled(guildId, getCommandModule(command.name)));
  const lockedPremiumAdmin = premium ? [] : adminPremium.filter(command => isModuleEnabled(guildId, getCommandModule(command.name)));

  return {
    plan: getGuildPlan(guildId),
    regularCommands: availableRegular,
    adminCommands: availableAdmin,
    premiumRegularCommands: lockedPremiumRegular,
    premiumAdminCommands: lockedPremiumAdmin
  };
}

function canUseCommandInContext(commandName, interaction) {
  if (!isModuleEnabled(interaction.guild.id, getCommandModule(commandName))) {
    return false;
  }

  switch (commandName) {
    case 'applypanel':
      return canApplications(interaction.member);
    case 'setup':
    case 'adminpanel':
    case 'setrole':
    case 'setchannel':
    case 'setfamilytitle':
    case 'welcome':
    case 'autorole':
    case 'reactionrole':
    case 'setmode':
    case 'setmodule':
    case 'setart':
    case 'debugconfig':
    case 'aiadvisor':
    case 'testaccept':
    case 'automod':
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
    case 'serverreport':
    case 'activityreport':
    case 'reportschedule':
      return canDebugConfig(interaction);
    default:
      return true;
  }
}

function buildAiCommandsOverview(interaction) {
  return buildAiCommandsOverviewHelper({
    catalog: getHelpCatalog(interaction),
    isPremium: isPremiumGuild(interaction.guild.id),
    userId: interaction.user.id,
    copy
  });
}

function canBypassAutomod(member) {
  return Boolean(member?.user?.bot);
}

function canApplications(member) {
  return accessApi.canApplications(member);
}

function canDiscipline(member) {
  return accessApi.canDiscipline(member);
}

function canManageRanks(member) {
  return accessApi.canManageRanks(member);
}

function canModerate(member) {
  return accessApi.canModerate(member);
}

function canManageNicknames(member) {
  return accessApi.canManageNicknames(member);
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
  return accessApi.canUseSecurity(member);
}

function canBypassLeakGuard(member) {
  return accessApi.canBypassLeakGuard(member);
}

function canBypassChannelGuard(member) {
  return accessApi.canBypassChannelGuard(member);
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
  return accessApi.canManageTargetChannel(member, channel);
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

async function sendDirectNotification(user, { title, description, color = 0x7c3aed, footer = 'BRHD - Phoenix - Notify' }) {
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
    footer: 'BRHD - Phoenix - Family',
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
    footer: 'BRHD - Phoenix - Discipline',
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
    footer: 'BRHD - Phoenix - Ranks',
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
    footer: 'BRHD - Phoenix - Security',
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
    footer: 'BRHD - Phoenix - Activity',
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

async function sendServerLogEmbed(guild, embed) {
  const { channels } = resolveGuildSettings(guild.id);
  if (!channels.logs) return;
  const channel = await fetchTextChannel(guild, channels.logs);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function announceBuildUpdate(guild) {
  const record = database.getGuild(guild.id);
  if (record.maintenance?.lastUpdateAnnouncementId === CURRENT_BUILD_SIGNATURE) {
    return;
  }

  const settings = resolveGuildSettings(guild.id);
  const channelId = settings.channels.updates || settings.channels.logs;
  if (!channelId) return;

  const channel = await fetchTextChannel(guild, channelId);
  if (!channel) return;

  const sent = await channel.send({
    embeds: [
      embeds.buildUpdateAnnouncementEmbed({
        versionLabel: PRODUCT_VERSION_LABEL,
        semver: PRODUCT_VERSION_SEMVER,
        buildId: DEPLOY_BUILD_ID,
        commitMessage: DEPLOY_COMMIT_MESSAGE,
        changeLines: getUpdateChangeGroups(DEPLOY_COMMIT_MESSAGE, getCurrentReleaseChangeGroups)
      })
    ]
  }).catch(() => null);

  if (sent) {
    database.updateGuildMaintenance(guild.id, { lastUpdateAnnouncementId: CURRENT_BUILD_SIGNATURE });
  }
}

async function sendAutomodLog(guild, payload) {
  const embed = embeds.buildAutomodActionEmbed(payload);
  const settings = resolveGuildSettings(guild.id);
  const channelId = settings.channels.automod || settings.channels.logs;
  if (!channelId) return;
  const channel = await fetchTextChannel(guild, channelId);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function sendWelcomeInvite(member) {
  const settings = resolveGuildSettings(member.guild.id);
  if (!settings.welcome.enabled) return;

  const channel = (await fetchTextChannel(member.guild, settings.channels.welcome))
    || (await fetchTextChannel(member.guild, settings.channels.applications))
    || (await fetchTextChannel(member.guild, settings.channels.panel));

  if (channel) {
    await channel.send({
      content: [`<@${member.id}>`, settings.welcome.message || ''].filter(Boolean).join('\n'),
      embeds: [embeds.buildWelcomeEmbed(member, settings.familyTitle, settings.visuals.applicationsBanner, settings.welcome.message, {
        rulesChannelId: settings.channels.rules,
        panelChannelId: settings.channels.panel,
        applicationsChannelId: settings.channels.applications,
        verificationEnabled: settings.verification.enabled
      })],
      components: embeds.buildWelcomeButtons()
    }).catch(() => {});
  }

  if (settings.welcome.dmEnabled) {
    await member.send({
      embeds: [embeds.buildWelcomeEmbed(member, settings.familyTitle, settings.visuals.applicationsBanner, settings.welcome.message, {
        rulesChannelId: settings.channels.rules,
        panelChannelId: settings.channels.panel,
        applicationsChannelId: settings.channels.applications,
        verificationEnabled: settings.verification.enabled
      })]
    }).catch(() => {});
  }
}

async function applyAutorole(member) {
  const settings = resolveGuildSettings(member.guild.id);
  if (!settings.autoroleRoleId) return false;

  const role = member.guild.roles.cache.get(settings.autoroleRoleId)
    || await member.guild.roles.fetch(settings.autoroleRoleId).catch(() => null);
  if (!role) return false;

  return member.roles.add(role, `Autorole via bot for ${member.id}`).then(() => true).catch(() => false);
}

function getVerificationRoleId(guildId) {
  const settings = resolveGuildSettings(guildId);
  return settings.verification.roleId || settings.verificationRoleId || settings.autoroleRoleId || '';
}

async function applyVerificationRole(member) {
  const roleId = getVerificationRoleId(member.guild.id);
  if (!roleId) return { ok: false, roleId: '' };

  const role = member.guild.roles.cache.get(roleId)
    || await member.guild.roles.fetch(roleId).catch(() => null);
  if (!role) return { ok: false, roleId };

  const hasRole = member.roles.cache.has(role.id);
  if (hasRole) return { ok: true, roleId: role.id, already: true };

  const ok = await member.roles.add(role, `Verification via bot for ${member.id}`).then(() => true).catch(() => false);
  return { ok, roleId: role.id };
}

function getRoleMenuEntries(guildId) {
  return resolveGuildSettings(guildId).roleMenus || [];
}

function findRoleMenu(guildId, menuId) {
  const normalized = String(menuId || '').trim().toLowerCase();
  return getRoleMenuEntries(guildId).find(menu => menu.menuId === normalized) || null;
}

function saveRoleMenu(guildId, nextMenu) {
  const current = getRoleMenuEntries(guildId).filter(menu => menu.menuId !== nextMenu.menuId);
  database.updateGuildSettings(guildId, { roleMenus: [...current, nextMenu] });
  return findRoleMenu(guildId, nextMenu.menuId);
}

function removeRoleMenuItem(guildId, menuId, roleId) {
  const menu = findRoleMenu(guildId, menuId);
  if (!menu) return null;
  const nextMenu = {
    ...menu,
    items: (menu.items || []).filter(item => item.roleId !== roleId)
  };
  saveRoleMenu(guildId, nextMenu);
  return nextMenu;
}

function getCustomCommands(guildId) {
  return resolveGuildSettings(guildId).customCommands || [];
}

function matchCustomCommand(command, content) {
  const haystack = String(content || '').trim().toLowerCase();
  const trigger = String(command?.trigger || '').trim().toLowerCase();
  if (!haystack || !trigger) return false;
  if (command.mode === 'exact') return haystack === trigger;
  if (command.mode === 'startsWith') return haystack.startsWith(trigger);
  return haystack.includes(trigger);
}

async function handleCustomTriggerMessage(message) {
  if (!message.guild || message.author?.bot) return false;
  const guildId = message.guild.id;
  if (!isModuleEnabled(guildId, 'customCommands')) return false;
  if (!isPremiumGuild(guildId)) return false;

  const match = getCustomCommands(guildId).find(command => matchCustomCommand(command, message.content));
  if (!match) return false;

  await message.channel.send({ content: match.response }).catch(() => {});
  return true;
}

async function sendScheduledReport(guild, period, channelId = '') {
  const targetChannelId = channelId || resolveGuildSettings(guild.id).reportSchedule?.[period]?.channelId || resolveGuildSettings(guild.id).channels.reports;
  if (!targetChannelId) return false;

  const channel = await fetchTextChannel(guild, targetChannelId);
  if (!channel) return false;

  await channel.send({ embeds: [buildServerStatsReportEmbed(guild, period)] }).catch(() => null);
  return true;
}

async function runScheduledReports(guildId, now = new Date()) {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  if (!isModuleEnabled(guildId, 'analytics') || !isPremiumGuild(guildId)) {
    return;
  }

  const settings = resolveGuildSettings(guildId);
  const schedule = settings.reportSchedule || {};
  const plans = [
    { period: 'weekly', key: getWeeklyReportKey(now), enabled: schedule.weekly?.enabled, channelId: schedule.weekly?.channelId },
    { period: 'monthly', key: getMonthlyReportKey(now), enabled: schedule.monthly?.enabled, channelId: schedule.monthly?.channelId }
  ];

  for (const plan of plans) {
    if (!plan.enabled || !isScheduledReportDue(plan.period, now)) continue;
    if (getGuildStorage(guildId).getReportMarker(`scheduled:${plan.period}`) === plan.key) continue;

    const sent = await sendScheduledReport(guild, plan.period, plan.channelId);
    if (sent) {
      getGuildStorage(guildId).setReportMarker(`scheduled:${plan.period}`, plan.key);
    }
  }
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

async function handleAutomodMessage(message) {
  const guildId = message.guild.id;
  if (!isModuleEnabled(guildId, 'automod')) return false;
  if (canBypassAutomod(message.member)) return false;

  const settings = resolveGuildSettings(guildId);
  const automod = settings.automod;
  let triggered = evaluateAutomodMessage({
    content: message.content,
    mentionCount: message.mentions?.users?.size || 0,
    config: automod
  });

  if (!triggered && automod.spamEnabled) {
    const stateKey = getAutomodStateKey(guildId, message.author.id);
    const now = Date.now();
    const current = automodState.get(stateKey) || [];
    const spam = evaluateSpamActivity(current, now, automod);
    automodState.set(stateKey, spam.recent);
    if (spam.triggered) {
      triggered = {
        rule: 'spam',
        detail: `${spam.recent.length}/${automod.spamCount}`
      };
    }
  }

  if (!triggered) {
    return false;
  }

  await message.delete().catch(() => {});
  let punishmentLabel = 'soft';
  if (automod.actionMode === 'hard' && message.member?.moderatable) {
    const timeoutMs = Math.max(1, Number(automod.timeoutMinutes) || 10) * 60 * 1000;
    const timedOut = await message.member.timeout(timeoutMs, `Automod: ${triggered.rule}`).then(() => true).catch(() => false);
    if (timedOut) {
      punishmentLabel = `hard/${automod.timeoutMinutes || 10}m`;
    }
  }
  const notice = await message.channel.send({
    content: copy.automod.notice(message.author.id, copy.automod.ruleLabel(triggered.rule), triggered.detail)
  }).catch(() => null);

  if (notice) {
    setTimeout(() => notice.delete().catch(() => {}), 8000);
  }

  await sendAutomodLog(message.guild, {
    member: message.member,
    rule: triggered.rule,
    detail: [triggered.detail, punishmentLabel].filter(Boolean).join(' - '),
    channelId: message.channel.id,
    content: message.content
  }).catch(() => {});

  return true;
}

async function refreshMember(member) {
  if (typeof member.fetch !== 'function') return member;
  return member.fetch().catch(() => member);
}

function buildProfilePayload(member, allowRankButtons, content = '') {
  const guildStorage = getGuildStorage(member.guild.id);
  const rankService = getRankService(member.guild.id);
  const memberData = { ...guildStorage.ensureMemberRecord(member.id), voiceMinutes: getLiveVoiceMinutes(member) };
  const rankInfo = {
    ...rankService.describeMember(member),
    autoEnabled: isPremiumGuild(member.guild.id) && AUTO_RANKS.enabled
  };
  const payload = {
    embeds: [
      embeds.buildProfileEmbed(member, {
        activityScore: guildStorage.getActivityScore,
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
    voiceSessions.set(key, {
      startedAt: Date.now(),
      channelId: member.voice.channelId
    });
  }
}

function stopVoiceSession(member) {
  if (!member?.id) return 0;
  const key = memberSessionKey(member.guild.id, member.id);
  const session = voiceSessions.get(key);
  if (!session?.startedAt) return 0;

  voiceSessions.delete(key);
  const elapsedMs = Date.now() - session.startedAt;
  const minutes = Math.floor(elapsedMs / 60000);
  if (minutes <= 0) return 0;

  return getGuildStorage(member.guild.id).addVoiceMinutesInChannel(member.id, minutes, session.channelId);
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
      activityScore: guildStorage.getActivityScore,
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
      .setFooter({ text: 'BRHD - Phoenix - Maintenance' })
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

    const memberData = guildStorage.ensureMemberRecord(member.id);
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

registerClientReadyRuntime({
  client,
  database,
  updateIntervalMs: UPDATE_INTERVAL_MS,
  autoRanks: AUTO_RANKS,
  afkWarningCheckIntervalMs: AFK_WARNING_CHECK_INTERVAL_MS,
  reportScheduleCheckIntervalMs: REPORT_SCHEDULE_CHECK_INTERVAL_MS,
  syncAutoRanks,
  syncAutoRanksAll,
  doPanelUpdate,
  doPanelUpdateAll,
  announceBuildUpdate,
  runRolelessCleanupDetailed,
  runAfkWarnings,
  runScheduledReports,
  startVoiceSession
});

registerEventRuntime({
  client,
  leakGuard: LEAK_GUARD,
  channelGuard: CHANNEL_GUARD,
  copySecurity: copy.security,
  getGuildStorage,
  isPremiumGuild,
  isModuleEnabled,
  hasFamilyRole,
  containsDiscordInvite,
  canBypassLeakGuard,
  handleAutomodMessage,
  handleCustomTriggerMessage,
  sendSecurityLog,
  startVoiceSession,
  stopVoiceSession,
  enforceBlacklist,
  sendWelcomeInvite,
  applyAutorole,
  resolveGuildSettings,
  findReactionRoleEntry,
  getReactionEmojiKey,
  canBypassChannelGuard,
  fetchDeletedChannelExecutor,
  restoreDeletedChannel,
  doPanelUpdate
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

registerInteractionRuntime({
  client,
  handleCommand: interaction => {
    const guildId = interaction.guild?.id || interaction.guildId || GUILD_ID;
    const guildStorage = getGuildStorage(guildId);
    const applicationsService = getApplicationsService(guildId);
    const rankService = getRankService(guildId);

    return handleCommandRuntime(interaction, {
    APPLICATION_COOLDOWN_MS,
    AUTO_RANKS,
    CHANNEL_ID,
    GUILD_ID,
    LEAK_GUARD,
    MESSAGE_ID,
    accessApi,
    aiService,
    applicationsChannelId: APPLICATIONS_CHANNEL_ID,
    buildAiAdvisorEmbed,
    buildCommands,
    buildGuildSettingsSnapshot,
    buildLeaderboardLines,
    buildLeaderboardSummary,
    buildPremiumActivityReportEmbed,
    buildServerStatsReportEmbed,
    buildVoiceActivityLines,
    buildVoiceActivitySummary,
    canApplications,
    canDebugConfig,
    canDiscipline,
    canManageNicknames,
    canManageRanks,
    canManageTargetChannel,
    canModerate,
    canUseSecurity,
    clearChannelByMessages,
    client,
    config,
    copy,
    createConfig,
    database,
    defaultModulesForMode,
    deleteMessagesFast,
    doPanelUpdate,
    editReplyAndAutoDelete,
    EmbedBuilderCtor: EmbedBuilder,
    embeds,
    ephemeral,
    enforceBlacklist,
    fetchMemberFast,
    fetchMessagesForUser,
    fetchRecentDeletableMessages,
    formatModerationTimestamp,
    formatVoiceHours,
    getHelpCatalog,
    getGuildPlan,
    getGuildRecord: guild => database.getGuild(guild.id),
    getRoleIds,
    guildStorage,
    guildRuntime,
    hasFamilyRole,
    isOwner,
    isAiCommandOverviewQuery,
    isPremiumGuild,
    isPremiumAutomodRule,
    isPremiumAutomodTarget,
    normalizeAutomodConfig,
    printStartupDiagnostics,
    rankService,
    replyAndAutoDelete,
    resolveGuildSettings,
    resolveMemberQuery,
    resolveTargetTextChannel,
    remapConfiguredChannelIds,
    runRolelessCleanupDetailed,
    security: {
      containsDiscordInvite,
      explainKickFailure,
      fetchDeletedChannelExecutor,
      restoreDeletedChannel
    },
    applicationsService,
    sendAcceptLog,
    sendBlacklistDm,
    sendRankDm,
    sendDisciplineDm,
    sendDisciplineLog,
    storage,
    summarizeConfig,
    syncAutoRanks,
    updateAutomodConfig: (guildId, patch) => updateAutomodConfig(guildId, patch),
    validateConfig,
    getAutomodTargetLimits,
    buildAutomodRulePatch,
    buildAiCommandsOverview,
    buildFamilyDashboardStats,
    buildProfilePayload
  });
  },
  applicationCooldownMs: APPLICATION_COOLDOWN_MS,
  ephemeral,
  copy,
  embeds,
  database,
  aiService,
  EmbedBuilderCtor: EmbedBuilder,
  resolveGuildSettings,
  getGuildRecord,
  getGuildStorage,
  getApplicationsService,
  getRankService,
  canDebugConfig,
  canApplications,
  canManageRanks,
  canUseSecurity,
  isPremiumGuild,
  fetchTextChannel,
  fetchMemberFast,
  refreshMember,
  sendWelcomeInvite,
  sendRankDm,
  getVerificationRoleId,
  applyVerificationRole,
  getRoleMenuEntries,
  findRoleMenu,
  saveRoleMenu,
  removeRoleMenuItem,
  getCustomCommands,
  getReactionRoleEntries,
  normalizeReactionEmoji,
  buildProfilePayload,
  buildLeaderboardLines,
  buildLeaderboardSummary,
  buildVoiceActivityLines,
  buildVoiceActivitySummary,
  buildPremiumActivityReportEmbed,
  buildAiAdvisorEmbed,
  getHelpCatalog,
  resolveMemberQuery,
  formatRankResult,
  syncAutoRanks,
  doPanelUpdate,
  sendScheduledReport
});

client.login(config.token);



