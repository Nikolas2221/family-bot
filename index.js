require('dotenv').config();

const path = require('path');
const { ChannelType, Client, EmbedBuilder, GatewayIntentBits, MessageFlags, Partials, PermissionFlagsBits } = require('discord.js');
const { createAIService } = require('./ai');
const { evaluateAutomodMessage, evaluateSpamActivity, normalizeAutomodConfig } = require('./automod');
const { createApplicationsService } = require('./applications');
const { buildCommands, getCommandsSignature, registerCommands } = require('./commands');
const { createConfig, printStartupDiagnostics, summarizeConfig, validateConfig } = require('./config');
const copy = require('./copy');
const { createDatabase, defaultModulesForMode } = require('./database');
const embeds = require('./embeds');
const { createRankService } = require('./ranks');
const { getReleaseNotes } = require('./release-notes');
const ROLES = require('./roles');
const { containsDiscordInvite, explainKickFailure, fetchDeletedChannelExecutor, restoreDeletedChannel } = require('./security');
const { createStorage } = require('./storage');
const { createAccessApi } = require('./dist-ts/access');
const { registerClientReadyRuntime } = require('./dist-ts/client-ready-runtime');
const { registerEventRuntime } = require('./dist-ts/event-runtime');
const { registerInteractionRuntime } = require('./dist-ts/interaction-runtime');
const { handleCommandRuntime } = require('./dist-ts/command-runtime');
const { createGuildRuntimeApi, memberSessionKey: buildMemberSessionKey } = require('./dist-ts/guild-runtime');
const {
  editReplyAndAutoDelete: editReplyAndAutoDeleteHelper,
  ephemeral: makeEphemeral,
  replyAndAutoDelete: replyAndAutoDeleteHelper,
  scheduleDeleteReply: scheduleDeleteReplyHelper
} = require('./dist-ts/interaction-helpers');
const {
  PRODUCT_VERSION_LABEL,
  PRODUCT_VERSION_SEMVER,
  buildCurrentBuildSignature,
  getCurrentReleaseChangeGroups
} = require('./dist-ts/runtime-meta');

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
  if (!safeTimestamp) return 'РЅРµС‚ РґР°РЅРЅС‹С…';

  const diff = Math.max(0, Date.now() - safeTimestamp);
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

  if (days > 0) return `${days}Рґ ${hours}С‡ РЅР°Р·Р°Рґ`;
  if (hours > 0) return `${hours}С‡ ${minutes}Рј РЅР°Р·Р°Рґ`;
  return `${minutes}Рј РЅР°Р·Р°Рґ`;
}

function getLiveVoiceMinutes(member) {
  const guildStorage = getGuildStorage(member.guild.id);
  const storedMinutes = guildStorage.voiceMinutes(member.id);
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
      ? `<@${topEntry.member.id}> вЂў ${getDisplayRankName(topEntry.member)} вЂў ${Math.max(0, topEntry.activity)} РѕС‡Рє.`
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
    topLine: topEntry ? `<@${topEntry.member.id}> вЂў ${topEntry.roleName} вЂў ${topEntry.points}/100` : '',
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
    topLine: topEntry ? `<@${topEntry.member.id}> вЂў ${topEntry.hours.toFixed(1)} С‡ вЂў ${topEntry.points}/100` : '',
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
      .setTitle(`РћС‚С‡С‘С‚ РїРѕ СѓС‡Р°СЃС‚РЅРёРєСѓ: ${targetMember.displayName}`)
      .setDescription(`РЎРµСЂРІРµСЂ: **${guild.name}**`)
      .addFields(
        { name: 'Р Р°РЅРі', value: getDisplayRankName(targetMember), inline: true },
        { name: 'Р РµРїСѓС‚Р°С†РёСЏ', value: `${guildStorage.pointsScore(targetMember.id)}/100`, inline: true },
        { name: 'РџРѕСЃР»РµРґРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ', value: formatTimeAgo(data.lastSeenAt), inline: true },
        {
          name: 'РЎС‚Р°С‚РёСЃС‚РёРєР°',
          value: [
            `РЎРѕРѕР±С‰РµРЅРёСЏ: ${data.messageCount || 0}`,
            `РџРѕС…РІР°Р»С‹: ${data.commends || 0}`,
            `РџСЂРµРґС‹: ${data.warns || 0}`,
            `Р“РѕР»РѕСЃ: ${formatVoiceHours(getLiveVoiceMinutes(targetMember))} С‡`
          ].join('\n')
        }
      )
      .setFooter({ text: 'BRHD вЂў Phoenix вЂў Activity Report' })
      .setTimestamp();
  }

  const lines = getFamilyMembers(guild)
    .map(member => {
      const data = guildStorage.ensureMember(member.id);
      return {
        member,
        line: `${getDisplayRankName(member)} вЂў <@${member.id}> вЂў ${guildStorage.pointsScore(member.id)}/100 вЂў ${formatVoiceHours(getLiveVoiceMinutes(member))} С‡ вЂў ${formatTimeAgo(data.lastSeenAt)}`
      };
    })
    .sort((left, right) => left.member.displayName.localeCompare(right.member.displayName, 'ru'))
    .slice(0, 25)
    .map(item => item.line);

  return new EmbedBuilder()
    .setColor(0x7c3aed)
    .setTitle('РћС‚С‡С‘С‚ РїРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё СЃРµРјСЊРё')
    .setDescription(`РЎРµСЂРІРµСЂ: **${guild.name}**\nРЈС‡Р°СЃС‚РЅРёРєРѕРІ СЃ СЃРµРјРµР№РЅС‹РјРё СЂРѕР»СЏРјРё: ${lines.length}`)
    .addFields({
      name: 'РЎРїРёСЃРѕРє',
      value: lines.length ? lines.join('\n').slice(0, 1024) : 'РќРµС‚ СѓС‡Р°СЃС‚РЅРёРєРѕРІ СЃ СЃРµРјРµР№РЅС‹РјРё СЂРѕР»СЏРјРё.'
    })
    .setFooter({ text: 'BRHD вЂў Phoenix вЂў Activity Report' })
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
      .setTitle(`РћС‚С‡С‘С‚ РїРѕ СѓС‡Р°СЃС‚РЅРёРєСѓ вЂў ${targetMember.displayName}`)
      .setDescription(
        [
          `РЎРµСЂРІРµСЂ: **${guild.name}**`,
          `Р Р°РЅРі: **${getDisplayRankName(targetMember)}**`,
          `РЎС‚Р°С‚СѓСЃ: ${targetMember.presence?.status || 'offline'}`,
          `РџРѕСЃР»РµРґРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ: **${formatTimeAgo(data.lastSeenAt)}**`
        ].join('\n')
      )
      .setImage(settings.visuals.familyBanner || null)
      .addFields(
        {
          name: 'РЎРІРѕРґРєР°',
          value: [
            `Р РµРїСѓС‚Р°С†РёСЏ: ${reputation}/100`,
            `Р“РѕР»РѕСЃ: ${voiceHours} С‡`,
            `РЎРѕРѕР±С‰РµРЅРёСЏ: ${data.messageCount || 0}`
          ].join('\n'),
          inline: true
        },
        {
          name: 'Р”РёСЃС†РёРїР»РёРЅР°',
          value: [
            `РџРѕС…РІР°Р»С‹: ${data.commends || 0}`,
            `РџСЂРµРґС‹: ${data.warns || 0}`,
            `РђРєС‚РёРІ-РѕС‡РєРё: ${guildStorage.activityScore(targetMember.id)}`
          ].join('\n'),
          inline: true
        },
        {
          name: 'Р РµРєРѕРјРµРЅРґР°С†РёСЏ',
          value: [
            reputation >= 70 ? 'РЈС‡Р°СЃС‚РЅРёРє РґРµСЂР¶РёС‚ СЃРёР»СЊРЅСѓСЋ СЂРµРїСѓС‚Р°С†РёСЋ.' : 'Р РµРїСѓС‚Р°С†РёСЏ С‚СЂРµР±СѓРµС‚ РІРЅРёРјР°РЅРёСЏ.',
            (data.warns || 0) >= 3 ? 'Р•СЃС‚СЊ РґРёСЃС†РёРїР»РёРЅР°СЂРЅС‹Р№ СЂРёСЃРє.' : 'РљСЂРёС‚РёС‡РЅС‹С… РґРёСЃС†РёРїР»РёРЅР°СЂРЅС‹С… СЂРёСЃРєРѕРІ РЅРµС‚.',
            Number(voiceHours) >= 3 || (data.messageCount || 0) >= 25 ? 'РђРєС‚РёРІРЅРѕСЃС‚СЊ РІС‹С€Рµ СЃСЂРµРґРЅРµРіРѕ.' : 'Р•СЃС‚СЊ Р·Р°РїР°СЃ РїРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё.'
          ].join('\n')
        }
      )
      .setFooter({ text: 'BRHD вЂў Phoenix вЂў Premium Activity' })
      .setTimestamp();
  }

  const members = getFamilyMembers(guild);
  const lines = members
    .map(member => {
      const data = guildStorage.ensureMember(member.id);
      return `${getDisplayRankName(member)} вЂў <@${member.id}> вЂў ${guildStorage.pointsScore(member.id)}/100 вЂў ${formatVoiceHours(getLiveVoiceMinutes(member))} С‡ вЂў ${formatTimeAgo(data.lastSeenAt)}`;
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
    .setTitle('РћС‚С‡С‘С‚ РїРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё СЃРµРјСЊРё вЂў Phoenix')
    .setDescription(
      [
        `РЎРµСЂРІРµСЂ: **${guild.name}**`,
        `РЈС‡Р°СЃС‚РЅРёРєРѕРІ СЃ СЃРµРјРµР№РЅС‹РјРё СЂРѕР»СЏРјРё: **${members.length}**`,
        `AFK-СЂРёСЃРєРѕРІ: **${afkRiskCount}**`
      ].join('\n')
    )
    .setImage(settings.visuals.familyBanner || null)
    .addFields(
      {
        name: 'РЎРІРѕРґРєР°',
        value: [
          `РЎСЂРµРґРЅСЏСЏ СЂРµРїСѓС‚Р°С†РёСЏ: ${members.length ? (totalPoints / members.length).toFixed(1) : '0.0'}/100`,
          `РЎСѓРјРјР°СЂРЅР°СЏ СЂРµРїСѓС‚Р°С†РёСЏ: ${totalPoints}`,
          `РЎСѓРјРјР°СЂРЅС‹Р№ РіРѕР»РѕСЃ: ${totalVoiceHours.toFixed(1)} С‡`
        ].join('\n'),
        inline: true
      },
      {
        name: 'РЎРїРёСЃРѕРє',
        value: lines.length ? lines.join('\n').slice(0, 1024) : 'РќРµС‚ СѓС‡Р°СЃС‚РЅРёРєРѕРІ СЃ СЃРµРјРµР№РЅС‹РјРё СЂРѕР»СЏРјРё.'
      }
    )
    .setFooter({ text: 'BRHD вЂў Phoenix вЂў Premium Activity' })
    .setTimestamp();
}

function formatPeriodLabel(period) {
  return period === 'monthly' ? 'Р•Р¶РµРјРµСЃСЏС‡РЅС‹Р№ СЃС‚Р°С‚РёСЃС‚РёС‡РµСЃРєРёР№ РѕС‚С‡С‘С‚' : 'Р•Р¶РµРЅРµРґРµР»СЊРЅС‹Р№ СЃС‚Р°С‚РёСЃС‚РёС‡РµСЃРєРёР№ РѕС‚С‡С‘С‚';
}

function formatPeriodRangeLabel(analytics) {
  return analytics.dayCount >= 30
    ? `РћС‚С‡С‘С‚ Р·Р° РїРµСЂРёРѕРґ СЃ ${analytics.fromDayKey}`
    : `РћС‚С‡С‘С‚ Р·Р° РїРµСЂРёРѕРґ: ${analytics.fromDayKey} вЂ” ${analytics.toDayKey}`;
}

function medal(index) {
  if (index === 0) return 'рџҐ‡';
  if (index === 1) return 'рџҐ€';
  if (index === 2) return 'рџҐ‰';
  return `${index + 1}.`;
}

function formatMinutesLong(totalMinutes) {
  const safe = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${hours}С‡ ${minutes}Рј`;
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
    item => `${getMemberLabel(guild, item.memberId)} вЂ” ${item.value} СЃРѕРѕР±С‰РµРЅРёР№`
  );

  const topVoice = buildRankedLines(
    memberEntries
      .map(([memberId, stats]) => ({ memberId, value: stats.voiceMinutes || 0 }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    item => `${getMemberLabel(guild, item.memberId)} вЂ” ${formatMinutesLong(item.value)}`
  );

  const topReactions = buildRankedLines(
    memberEntries
      .map(([memberId, stats]) => ({ memberId, value: stats.reactions || 0 }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    item => `${getMemberLabel(guild, item.memberId)} вЂ” ${item.value} СЂРµР°РєС†РёР№`
  );

  const topChannels = buildRankedLines(
    Object.entries(analytics.channels || {})
      .map(([channelId, value]) => ({ channelId, value }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    item => `${getChannelLabel(guild, item.channelId)} вЂ” ${item.value} СЃРѕРѕР±С‰РµРЅРёР№`
  );

  const topVoiceChannels = buildRankedLines(
    Object.entries(analytics.voiceChannels || {})
      .map(([channelId, value]) => ({ channelId, value }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    item => `${getChannelLabel(guild, item.channelId)} вЂ” ${formatMinutesLong(item.value)}`
  );

  return new EmbedBuilder()
    .setColor(period === 'monthly' ? 0xf59e0b : 0x2563eb)
    .setTitle(`рџ“… ${formatPeriodLabel(period)}`)
    .setDescription(formatPeriodRangeLabel(analytics))
    .setThumbnail(client.user?.displayAvatarURL?.() || null)
    .setImage(settings.visuals.familyBanner || null)
    .addFields(
      {
        name: 'рџ’¬ РўРѕРї РїРѕ СЃРѕРѕР±С‰РµРЅРёСЏРј',
        value: topMessages.length ? topMessages.join('\n').slice(0, 1024) : 'РќРµС‚ РґР°РЅРЅС‹С… Р·Р° РїРµСЂРёРѕРґ.'
      },
      {
        name: 'рџЋ¤ РўРѕРї РїРѕ РіРѕР»РѕСЃРѕРІРѕР№ Р°РєС‚РёРІРЅРѕСЃС‚Рё',
        value: topVoice.length ? topVoice.join('\n').slice(0, 1024) : 'РќРµС‚ РґР°РЅРЅС‹С… Р·Р° РїРµСЂРёРѕРґ.'
      },
      {
        name: 'вњЁ РўРѕРї РїРѕ СЂРµР°РєС†РёСЏРј',
        value: topReactions.length ? topReactions.join('\n').slice(0, 1024) : 'РќРµС‚ РґР°РЅРЅС‹С… Р·Р° РїРµСЂРёРѕРґ.'
      },
      {
        name: 'рџ“Ќ РЎР°РјС‹Рµ Р°РєС‚РёРІРЅС‹Рµ РєР°РЅР°Р»С‹',
        value: topChannels.length ? topChannels.join('\n').slice(0, 1024) : 'РќРµС‚ РґР°РЅРЅС‹С… Р·Р° РїРµСЂРёРѕРґ.'
      },
      {
        name: 'рџ”Љ РўРѕРї РїРѕ РіРѕР»РѕСЃРѕРІС‹Рј РєР°РЅР°Р»Р°Рј',
        value: topVoiceChannels.length ? topVoiceChannels.join('\n').slice(0, 1024) : 'РќРµС‚ РґР°РЅРЅС‹С… Р·Р° РїРµСЂРёРѕРґ.'
      },
      {
        name: 'рџ‘‹ РЈС‡Р°СЃС‚РЅРёРєРё',
        value: [`РќРѕРІС‹Рµ СѓС‡Р°СЃС‚РЅРёРєРё: **${analytics.joins}**`, `РЈС€РµРґС€РёРµ СѓС‡Р°СЃС‚РЅРёРєРё: **${analytics.leaves}**`].join('\n'),
        inline: true
      },
      {
        name: 'рџ“Љ РћР±С‰Р°СЏ СЃС‚Р°С‚РёСЃС‚РёРєР°',
        value: [
          `Р’СЃРµРіРѕ СЃРѕРѕР±С‰РµРЅРёР№: **${analytics.messagesTotal}**`,
          `Р’СЂРµРјСЏ РІ РІРѕР№СЃРµ: **${formatMinutesLong(analytics.voiceMinutesTotal)}**`,
          `Р’СЃРµРіРѕ СЂРµР°РєС†РёР№: **${analytics.reactionsTotal}**`
        ].join('\n'),
        inline: true
      }
    )
    .setFooter({ text: `BRHD вЂў Phoenix вЂў ${period === 'monthly' ? 'Monthly Stats' : 'Weekly Stats'}` })
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

function isAiCommandOverviewQuery(query) {
  const value = String(query || '').toLowerCase();
  return (
    value.includes('С‡С‚Рѕ СЏ СѓРјРµСЋ') ||
    value.includes('С‡С‚Рѕ РјРЅРµ РґРѕСЃС‚СѓРїРЅРѕ') ||
    value.includes('РєР°РєРёРµ РєРѕРјР°РЅРґС‹') ||
    value.includes('С‡С‚Рѕ СЏ РјРѕРіСѓ') ||
    value.includes('РјРѕРё РєРѕРјР°РЅРґС‹')
  );
}

function isAiNicknameRequest(query, targetUser, newNickname) {
  if (!targetUser || !newNickname) return false;
  const value = String(query || '').toLowerCase();
  return (
    value.includes('СЃРјРµРЅРё РЅРёРє') ||
    value.includes('СЃРјРµРЅРё РЅРёРє') ||
    value.includes('РёР·РјРµРЅРё РЅРёРє') ||
    value.includes('РїРµСЂРµРёРјРµРЅСѓР№') ||
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
    `РџР»Р°РЅ: **${planLabel}**`,
    `РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ: <@${interaction.user.id}>`,
    '',
    ...available.map(command => `/${command.name} вЂ” ${command.description}`)
  ].join('\n').slice(0, 1900);
}

function splitUpdateChangeLines() {
  const raw = DEPLOY_COMMIT_MESSAGE
    .split(/\r?\n|;|,(?=\s*[a-zР°-СЏ0-9])/i)
    .map(item => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

  if (!raw.length) {
    return [
      'РќРѕРІР°СЏ СЃР±РѕСЂРєР° СЂР°Р·РІС‘СЂРЅСѓС‚Р° Рё РіРѕС‚РѕРІР° Рє СЂР°Р±РѕС‚Рµ.',
      'РљРѕРјР°РЅРґС‹ Рё РјРѕРґСѓР»Рё СЃРµСЂРІРµСЂР° СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°РЅС‹.',
      `РўРµРєСѓС‰Р°СЏ РІРµСЂСЃРёСЏ: ${PRODUCT_VERSION_LABEL}.`
    ];
  }

  return raw.slice(0, 6);
}

function canBypassAutomod(member) {
  return canModerate(member) || canDebugConfig({ memberPermissions: member?.permissions, member });
}

function detectUpdateBucket(line) {
  const normalized = String(line || '').trim().toLowerCase();
  if (!normalized) return 'updated';
  if (/^(add|added|feat|feature|introduce|introduced|implement|implemented)\b/.test(normalized)) return 'added';
  if (/^(fix|fixed|bugfix|hotfix|patch|patched|resolve|resolved|correct|corrected)\b/.test(normalized)) return 'fixed';
  return 'updated';
}

function stripUpdatePrefix(line) {
  return String(line || '')
    .trim()
    .replace(
      /^(add|added|feat|feature|introduce|introduced|implement|implemented|fix|fixed|bugfix|hotfix|patch|patched|resolve|resolved|correct|corrected|update|updated|upgrade|upgraded|improve|improved|optimize|optimized|optimise|optimised|refactor|refactored|polish|polished|adjust|adjusted|change|changed|rework|reworked|move|moved|cleanup|clean up|remove|removed)\s*:?\s*/i,
      ''
    )
    .replace(/^[-*]\s*/, '')
    .trim();
}

function humanizeUpdatePart(part) {
  const text = String(part || '').trim();
  if (!text) return '';

  const normalized = text
    .toLowerCase()
    .replace(/\bthe\b/g, '')
    .replace(/\ba\b/g, '')
    .replace(/\ban\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const mapped = [
    [/embed updates?/i, 'РѕРєРЅРѕ РѕР±РЅРѕРІР»РµРЅРёР№'],
    [/embed(?:s| message| messages| card| cards| panel| panels)?/i, 'embed-РєР°СЂС‚РѕС‡РєРё'],
    [/welcome messages?/i, 'welcome-СЃРѕРѕР±С‰РµРЅРёСЏ'],
    [/welcome/i, 'welcome-РјРѕРґСѓР»СЊ'],
    [/autoroles?/i, 'СЃРёСЃС‚РµРјР° Р°РІС‚РѕСЂРѕР»Рё'],
    [/reaction roles?/i, 'РјРµРЅСЋ СѓРїСЂР°РІР»РµРЅРёСЏ СЂРѕР»СЏРјРё'],
    [/report schedule/i, 'СЂР°СЃРїРёСЃР°РЅРёРµ РѕС‚С‡С‘С‚РѕРІ'],
    [/scheduled reports?/i, 'Р°РІС‚РѕРѕС‚РїСЂР°РІРєР° РѕС‚С‡С‘С‚РѕРІ'],
    [/server reports?/i, 'СЃРµСЂРІРµСЂРЅС‹Рµ РѕС‚С‡С‘С‚С‹'],
    [/activity reports?/i, 'РѕС‚С‡С‘С‚С‹ РїРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё'],
    [/automod/i, 'automod'],
    [/command sync/i, 'СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РєРѕРјР°РЅРґ'],
    [/guild warmup/i, 'РѕРїС‚РёРјРёР·Р°С†РёСЏ Р·Р°РїСѓСЃРєР° guild'],
    [/startup/i, 'РѕРїС‚РёРјРёР·Р°С†РёСЏ СЃС‚Р°СЂС‚Р°'],
    [/ticket(?:s)?/i, 'С‚РёРєРµС‚С‹'],
    [/application(?:s)?/i, 'Р·Р°СЏРІРєРё'],
    [/leaderboard/i, 'Р»РёРґРµСЂР±РѕСЂРґ'],
    [/voice activity/i, 'РіРѕР»РѕСЃРѕРІР°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ'],
    [/\bvoice\b/i, 'РіРѕР»РѕСЃРѕРІР°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ'],
    [/ai advisor/i, 'AI-СЃРѕРІРµС‚РЅРёРє'],
    [/\bai\b/i, 'AI-РјРѕРґСѓР»СЊ'],
    [/security/i, 'РјРѕРґСѓР»СЊ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё'],
    [/moderation/i, 'РјРѕРґРµСЂР°С†РёСЏ'],
    [/logs?/i, 'Р»РѕРіРё'],
    [/nickname(?:s)?/i, 'СЃРјРµРЅР° РЅРёРєРѕРІ'],
    [/cleanup/i, 'РѕС‡РёСЃС‚РєР°'],
    [/performance/i, 'РѕРїС‚РёРјРёР·Р°С†РёСЏ РїСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚Рё']
  ].find(([pattern]) => pattern.test(normalized));

  if (mapped) {
    return mapped[1];
  }

  return text.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractUpdateParts(body) {
  const knownPhrases = [
    ['embed update', 'РѕРєРЅРѕ РѕР±РЅРѕРІР»РµРЅРёР№'],
    ['embeds', 'embed-РєР°СЂС‚РѕС‡РєРё'],
    ['embed', 'embed-РєР°СЂС‚РѕС‡РєРё'],
    ['reaction roles', 'РјРµРЅСЋ СѓРїСЂР°РІР»РµРЅРёСЏ СЂРѕР»СЏРјРё'],
    ['report schedule', 'СЂР°СЃРїРёСЃР°РЅРёРµ РѕС‚С‡С‘С‚РѕРІ'],
    ['welcome messages', 'welcome-СЃРѕРѕР±С‰РµРЅРёСЏ'],
    ['welcome', 'welcome-СЃРѕРѕР±С‰РµРЅРёСЏ'],
    ['autorole', 'Р°РІС‚РѕСЂРѕР»СЊ'],
    ['automod', 'automod'],
    ['server report', 'СЃРµСЂРІРµСЂРЅС‹Рµ РѕС‚С‡С‘С‚С‹'],
    ['activity report', 'РѕС‚С‡С‘С‚С‹ РїРѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё'],
    ['command sync', 'СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РєРѕРјР°РЅРґ'],
    ['guild warmup', 'РѕРїС‚РёРјРёР·Р°С†РёСЏ Р·Р°РїСѓСЃРєР° guild'],
    ['voice activity', 'РіРѕР»РѕСЃРѕРІР°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ'],
    ['leaderboard', 'Р»РёРґРµСЂР±РѕСЂРґ'],
    ['tickets', 'С‚РёРєРµС‚С‹'],
    ['applications', 'Р·Р°СЏРІРєРё'],
    ['logs', 'Р»РѕРіРё']
  ];

  let remaining = String(body || '').trim();
  const parts = [];

  for (const [needle, label] of knownPhrases) {
    const pattern = new RegExp(`\\b${needle.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (pattern.test(remaining)) {
      parts.push(label);
      remaining = remaining.replace(pattern, ' ');
    }
  }

  remaining
    .split(/\r?\n|;|,(?=\s*[a-zР°-СЏ0-9])|\s+\band\b\s+|\s+&\s+/i)
    .map(item => humanizeUpdatePart(item))
    .filter(Boolean)
    .forEach(item => parts.push(item));

  return [...new Set(parts)].slice(0, 8);
}

function splitUpdateChangeLines() {
  return getCurrentReleaseChangeGroups(DEPLOY_COMMIT_MESSAGE);
}

function getAutomodStateKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function buildAutomodRulePatch(rule, state) {
  switch (rule) {
    case 'invites':
      return { invitesEnabled: state };
    case 'links':
      return { linksEnabled: state };
    case 'caps':
      return { capsEnabled: state };
    case 'mentions':
      return { mentionsEnabled: state };
    case 'spam':
      return { spamEnabled: state };
    case 'badWords':
      return { badWordsEnabled: state };
    default:
      return {};
  }
}

function getAutomodTargetLimits(target, value) {
  switch (target) {
    case 'capsPercent':
      return { capsPercent: Math.max(50, Math.min(100, value)) };
    case 'capsMinLength':
      return { capsMinLength: Math.max(4, Math.min(200, value)) };
    case 'mentionLimit':
      return { mentionLimit: Math.max(2, Math.min(50, value)) };
    case 'spamCount':
      return { spamCount: Math.max(3, Math.min(20, value)) };
    case 'spamWindowSeconds':
      return { spamWindowSeconds: Math.max(3, Math.min(60, value)) };
    default:
      return {};
  }
}

function isPremiumAutomodRule(rule) {
  return rule === 'spam' || rule === 'badWords';
}

function isPremiumAutomodTarget(target) {
  return target === 'spamCount' || target === 'spamWindowSeconds';
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
    return 'РЅРµРёР·РІРµСЃС‚РЅРѕ';
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

async function sendDirectNotification(user, { title, description, color = 0x7c3aed, footer = 'BRHD вЂў Phoenix вЂў Notify' }) {
  if (!user) return false;

  const channel = await user.createDM().catch(() => null);
  if (!channel) return false;

  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({ text: footer }).setTimestamp();
  const sent = await channel.send({ embeds: [embed] }).then(() => true).catch(() => false);
  return sent;
}

async function sendAcceptanceDm({ guild, member, moderatorUser, reason, rankName }) {
  return sendDirectNotification(member.user, {
    title: 'Р—Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р°',
    color: 0x10b981,
    footer: 'BRHD вЂў Phoenix вЂў Family',
    description: [
      `РўС‹ РїСЂРёРЅСЏС‚ РІ СЃРµРјСЊСЋ **${resolveGuildSettings(guild.id).familyTitle}** РЅР° СЃРµСЂРІРµСЂРµ **${guild.name}**.`,
      '',
      `РњРѕРґРµСЂР°С‚РѕСЂ: <@${moderatorUser.id}>`,
      `РџСЂРёС‡РёРЅР°: ${reason}`,
      `Р’С‹РґР°РЅРЅС‹Р№ СЂР°РЅРі: ${rankName}`
    ].join('\n')
  });
}

async function sendDisciplineDm(type, guild, targetUser, moderatorUser, reason) {
  const isWarn = type === 'warn';
  return sendDirectNotification(targetUser, {
    title: isWarn ? 'РџРѕР»СѓС‡РµРЅ РІС‹РіРѕРІРѕСЂ' : 'РџРѕР»СѓС‡РµРЅР° РїРѕС…РІР°Р»Р°',
    color: isWarn ? 0xf97316 : 0x2563eb,
    footer: 'BRHD вЂў Phoenix вЂў Discipline',
    description: [
      `РЎРµСЂРІРµСЂ: **${guild.name}**`,
      `РњРѕРґРµСЂР°С‚РѕСЂ: <@${moderatorUser.id}>`,
      `РџСЂРёС‡РёРЅР°: ${reason}`,
      '',
      isWarn ? 'РЎР»РµРґРё Р·Р° Р°РєС‚РёРІРЅРѕСЃС‚СЊСЋ Рё РґРёСЃС†РёРїР»РёРЅРѕР№, С‡С‚РѕР±С‹ РЅРµ РїРѕР»СѓС‡РёС‚СЊ РґРѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Рµ СЃР°РЅРєС†РёРё.' : 'РўР°Рє РґРµСЂР¶Р°С‚СЊ. РђРєС‚РёРІРЅРѕСЃС‚СЊ Рё РІРєР»Р°Рґ РІ СЃРµРјСЊСЋ Р·Р°РјРµС‡РµРЅС‹.'
    ].join('\n')
  });
}

async function sendRankDm(guild, member, result) {
  if (!result?.ok) return false;

  const isPromotion = result.code === 'promoted' || result.code === 'auto_applied';
  const title = isPromotion ? 'Р Р°РЅРі РїРѕРІС‹С€РµРЅ' : 'Р Р°РЅРі РїРѕРЅРёР¶РµРЅ';

  return sendDirectNotification(member.user, {
    title,
    color: isPromotion ? 0x10b981 : 0xe11d48,
    footer: 'BRHD вЂў Phoenix вЂў Ranks',
    description: [
      `РЎРµСЂРІРµСЂ: **${guild.name}**`,
      `Р‘С‹Р»Рѕ: ${result.fromRole?.name || 'вЂ”'}`,
      `РЎС‚Р°Р»Рѕ: ${result.toRole?.name || 'вЂ”'}`,
      result.score !== undefined ? `РўРµРєСѓС‰РёРµ РѕС‡РєРё Р°РєС‚РёРІРЅРѕСЃС‚Рё: ${result.score}` : null
    ]
      .filter(Boolean)
      .join('\n')
  });
}

async function sendBlacklistDm(user, guild, reason) {
  return sendDirectNotification(user, {
    title: 'Р§С‘СЂРЅС‹Р№ СЃРїРёСЃРѕРє',
    color: 0xe11d48,
    footer: 'BRHD вЂў Phoenix вЂў Security',
    description: [
      `РўРІРѕР№ РґРѕСЃС‚СѓРї РЅР° СЃРµСЂРІРµСЂ **${guild.name}** РѕРіСЂР°РЅРёС‡РµРЅ.`,
      `РџСЂРёС‡РёРЅР°: ${reason}`,
      '',
      'Р•СЃР»Рё СЌС‚Рѕ РѕС€РёР±РєР°, СЃРІСЏР¶РёСЃСЊ СЃ Р°РґРјРёРЅРёСЃС‚СЂР°С†РёРµР№ СЃРµСЂРІРµСЂР°.'
    ].join('\n')
  });
}

async function sendAfkWarningDm(member) {
  return sendDirectNotification(member.user, {
    title: 'РџСЂРµРґСѓРїСЂРµР¶РґРµРЅРёРµ РѕР± AFK',
    color: 0xf59e0b,
    footer: 'BRHD вЂў Phoenix вЂў Activity',
    description: [
      `РќР° СЃРµСЂРІРµСЂРµ **${member.guild.name}** РѕС‚ С‚РµР±СЏ РЅРµ Р±С‹Р»Рѕ Р°РєС‚РёРІРЅРѕСЃС‚Рё СѓР¶Рµ 3 РґРЅСЏ.`,
      'Р•СЃР»Рё РЅРµ РїСЂРѕСЏРІРёС€СЊ Р°РєС‚РёРІРЅРѕСЃС‚СЊ, Р°РґРјРёРЅРёСЃС‚СЂР°С†РёСЏ РјРѕР¶РµС‚ РєРёРєРЅСѓС‚СЊ С‚РµР±СЏ Р·Р° AFK.',
      '',
      'РћС‚РїСЂР°РІСЊ СЃРѕРѕР±С‰РµРЅРёРµ, Р·Р°Р№РґРё РІ РіРѕР»РѕСЃРѕРІРѕР№ РєР°РЅР°Р» РёР»Рё РїСЂРѕСЃС‚Рѕ РїСЂРѕСЏРІРё Р°РєС‚РёРІРЅРѕСЃС‚СЊ РІ Discord.'
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
        changeLines: splitUpdateChangeLines()
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
    detail: [triggered.detail, punishmentLabel].filter(Boolean).join(' вЂў '),
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
        : `РђРІС‚Рѕ-СЂР°РЅРі СЃРѕС…СЂР°РЅРёР» С‚РµРєСѓС‰СѓСЋ СЂРѕР»СЊ ${result.currentRole.name}. РџРѕРЅРёР¶РµРЅРёРµ РІРЅРёР· Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РЅРµ РїСЂРёРјРµРЅСЏРµС‚СЃСЏ (${result.score} РѕС‡Рє.).`;
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
        console.log('РЎРєРѕРїРёСЂСѓР№ MESSAGE_ID:', message.id);
      }
    } else {
      const message = await channel.send({ embeds: familyEmbeds, components: embeds.panelButtons(), content: '' });
      storage.setGuildPanelMessageId(guild.id, message.id, fixedMessageId);
      console.log('РЎРєРѕРїРёСЂСѓР№ MESSAGE_ID:', message.id);
    }

    state.lastUpdate = Date.now();
  } catch (error) {
    console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїР°РЅРµР»Рё:', error);
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
      console.error(`РћС€РёР±РєР° Р°РІС‚Рѕ-СЂР°РЅРіР° РґР»СЏ ${failure.memberId}:`, failure.error);
    }
  } catch (error) {
    console.error('РћС€РёР±РєР° Р°РІС‚Рѕ-СЂР°РЅРіРѕРІ:', error);
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
    .setFooter({ text: 'BRHD вЂў Phoenix вЂў Maintenance' })
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

    const ok = await member.kick('Р•Р¶РµРЅРµРґРµР»СЊРЅР°СЏ РѕС‡РёСЃС‚РєР° СѓС‡Р°СЃС‚РЅРёРєРѕРІ Р±РµР· СЂРѕР»РµР№').then(() => true).catch(() => false);
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
        title: 'Р•Р¶РµРЅРµРґРµР»СЊРЅР°СЏ РѕС‡РёСЃС‚РєР° Р±РµР· СЂРѕР»РµР№',
        description: [`Р РµР¶РёРј: ${reason}`, `РљРёРєРЅСѓС‚Рѕ: ${kicked.length}`, `РћС€РёР±РѕРє: ${failed.length}`].join('\n'),
        color: 0xe11d48,
        fieldName: 'РћС‚С‡С‘С‚',
        lines: [...kicked.slice(0, 15), ...failed.slice(0, 10)].length ? [...kicked.slice(0, 15), ...failed.slice(0, 10)] : ['РќРёРєРѕРіРѕ РЅРµ РїСЂРёС€Р»РѕСЃСЊ РєРёРєР°С‚СЊ.']
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
      await member.kick('Р•Р¶РµРЅРµРґРµР»СЊРЅР°СЏ РѕС‡РёСЃС‚РєР° СѓС‡Р°СЃС‚РЅРёРєРѕРІ Р±РµР· СЂРѕР»РµР№');
      kicked.push(member.user.username);
    } catch (error) {
      const fallbackReason = error?.code === 50013
        ? 'Сѓ Р±РѕС‚Р° РЅРµ С…РІР°С‚Р°РµС‚ РїСЂР°РІ Discord РґР»СЏ РєРёРєР°'
        : (error?.message || 'РЅРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР° РєРёРєР°');
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
        title: 'Р•Р¶РµРЅРµРґРµР»СЊРЅР°СЏ РѕС‡РёСЃС‚РєР° Р±РµР· СЂРѕР»РµР№',
        description: [`Р РµР¶РёРј: ${reason}`, `РљРёРєРЅСѓС‚Рѕ: ${kicked.length}`, `РћС€РёР±РѕРє: ${failed.length}`].join('\n'),
        color: 0xe11d48,
        fieldName: 'РћС‚С‡С‘С‚',
        lines: [...kicked.slice(0, 15), ...failed.slice(0, 10)].length ? [...kicked.slice(0, 15), ...failed.slice(0, 10)] : ['РќРёРєРѕРіРѕ РЅРµ РїСЂРёС€Р»РѕСЃСЊ РєРёРєР°С‚СЊ.']
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
        title: 'AFK-РїСЂРµРґСѓРїСЂРµР¶РґРµРЅРёСЏ',
        description: `РћС‚РїСЂР°РІР»РµРЅС‹ РїСЂРµРґСѓРїСЂРµР¶РґРµРЅРёСЏ Р·Р° РЅРµР°РєС‚РёРІРЅРѕСЃС‚СЊ 3+ РґРЅСЏ: ${warned.length}`,
        color: 0xf59e0b,
        fieldName: 'РЈС‡Р°СЃС‚РЅРёРєРё',
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

async function handlePrimaryInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      const guildId = interaction.guild.id;
      const guildStorage = getGuildStorage(guildId);
      const applicationsService = getApplicationsService(guildId);
      const rankService = getRankService(guildId);
      const commandModule = getCommandModule(interaction.commandName);

      if (commandModule && !isModuleEnabled(guildId, commandModule)) {
        return interaction.reply(ephemeral({ content: copy.common.moduleDisabled }));
      }

      if (await handleCommandRuntime(interaction, {
        APPLICATION_COOLDOWN_MS,
        copy,
        embeds,
        database,
        ephemeral,
        resolveGuildSettings,
        buildFamilyDashboardStats,
        canApplications,
        canDebugConfig,
        buildGuildSettingsSnapshot,
        getGuildRecord,
        doPanelUpdate,
        defaultModulesForMode,
        getHelpCatalog,
        guildStorage,
        applicationsService
      })) {
        return;
      }

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
            content: `Р РѕР»СЊ **${key}** СЃРѕС…СЂР°РЅРµРЅР°: <@&${role.id}>`,
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
            content: `РљР°РЅР°Р» **${key}** СЃРѕС…СЂР°РЅС‘РЅ: <#${channel.id}>`,
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
            content: `РќР°Р·РІР°РЅРёРµ СЃРµРјСЊРё РѕР±РЅРѕРІР»РµРЅРѕ: **${familyTitle}**`,
            embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
          })
        );
      }

      if (interaction.commandName === 'setmode') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const mode = interaction.options.getString(copy.commands.modeOptionName, true);
        const modules = defaultModulesForMode(mode);
        database.updateGuildSettings(guildId, { mode, modules });
        const record = database.markSetupComplete(interaction.guild.id, buildGuildSettingsSnapshot(interaction.guild));
        await doPanelUpdate(guildId, true);
        return interaction.reply(
          ephemeral({
            content: `Р РµР¶РёРј СЃРµСЂРІРµСЂР° РїРµСЂРµРєР»СЋС‡С‘РЅ РЅР° **${mode}**.`,
            embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
          })
        );
      }

      if (interaction.commandName === 'setmodule') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const key = interaction.options.getString(copy.commands.moduleOptionName, true);
        const state = interaction.options.getString(copy.commands.stateOptionName, true) === 'on';
        database.updateGuildSettings(guildId, { modules: { [key]: state } });
        const record = database.markSetupComplete(interaction.guild.id, buildGuildSettingsSnapshot(interaction.guild));
        await doPanelUpdate(guildId, true);
        return interaction.reply(
          ephemeral({
            content: `РњРѕРґСѓР»СЊ **${key}** С‚РµРїРµСЂСЊ **${state ? 'РІРєР»СЋС‡С‘РЅ' : 'РІС‹РєР»СЋС‡РµРЅ'}**.`,
            embeds: [embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })]
          })
        );
      }

      if (interaction.commandName === 'automod') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const subcommand = interaction.options.getSubcommand();
        const current = resolveGuildSettings(guildId).automod;

        if (subcommand === copy.commands.automodStatusSubcommand) {
          return interaction.reply(ephemeral({
            embeds: [embeds.buildAutomodStatusEmbed(current, resolveGuildSettings(guildId).channels.automod)]
          }));
        }

        if (subcommand === copy.commands.automodToggleSubcommand) {
          const rule = interaction.options.getString(copy.commands.automodRuleOptionName, true);
          if (!isPremiumGuild(guildId) && isPremiumAutomodRule(rule)) {
            return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
          }

          const enabled = interaction.options.getString(copy.commands.stateOptionName, true) === 'on';
          database.updateGuildSettings(guildId, { automod: buildAutomodRulePatch(rule, enabled) });
          const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
          return interaction.reply(ephemeral({
            content: copy.automod.toggleDone(copy.automod.ruleLabel(rule), enabled),
            embeds: [
              embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod),
              embeds.buildAdminPanelEmbed({ guildName: interaction.guild.name, record })
            ]
          }));
        }

        if (subcommand === copy.commands.automodLimitSubcommand) {
          const target = interaction.options.getString(copy.commands.automodTargetOptionName, true);
          if (!isPremiumGuild(guildId) && isPremiumAutomodTarget(target)) {
            return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
          }

          const value = interaction.options.getInteger(copy.commands.valueOptionName, true);
          const patch = getAutomodTargetLimits(target, value);
          database.updateGuildSettings(guildId, { automod: patch });
          return interaction.reply(ephemeral({
            content: copy.automod.limitDone(copy.automod.targetLabel(target), Object.values(patch)[0]),
            embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
          }));
        }

        if (subcommand === copy.commands.automodActionSubcommand) {
          const mode = interaction.options.getString(copy.commands.actionModeOptionName, true);
          database.updateGuildSettings(guildId, { automod: { actionMode: mode } });
          return interaction.reply(ephemeral({
            content: copy.automod.actionUpdated(mode === 'hard' ? 'Р¶С‘СЃС‚РєРёР№' : 'РјСЏРіРєРёР№'),
            embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
          }));
        }

        if (subcommand === copy.commands.automodWordsSubcommand) {
          if (!isPremiumGuild(guildId)) {
            return interaction.reply(ephemeral({ content: copy.admin.premiumOnly }));
          }

          const action = interaction.options.getString(copy.commands.actionOptionName, true);
          const rawWord = interaction.options.getString(copy.commands.wordOptionName) || '';
          const word = rawWord.trim().toLowerCase();
          const words = [...current.badWords];

          if (action === 'list') {
            return interaction.reply(ephemeral({
              embeds: [embeds.buildAutomodStatusEmbed(current)]
            }));
          }

          if (action === 'clear') {
            database.updateGuildSettings(guildId, { automod: { badWords: [] } });
            return interaction.reply(ephemeral({
              content: copy.automod.wordsCleared,
              embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
            }));
          }

          if (!word) {
            return interaction.reply(ephemeral({ content: copy.automod.wordMissing }));
          }

          if (action === 'add') {
            const nextWords = [...new Set([...words, word])];
            database.updateGuildSettings(guildId, { automod: { badWords: nextWords, badWordsEnabled: true } });
            return interaction.reply(ephemeral({
              content: copy.automod.wordAdded(word),
              embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
            }));
          }

          const nextWords = words.filter(item => item !== word);
          database.updateGuildSettings(guildId, { automod: { badWords: nextWords } });
          return interaction.reply(ephemeral({
            content: copy.automod.wordRemoved(word),
            embeds: [embeds.buildAutomodStatusEmbed(resolveGuildSettings(guildId).automod, resolveGuildSettings(guildId).channels.automod)]
          }));
        }
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
          return interaction.reply(ephemeral({ content: 'РЈРєР°Р¶Рё РїСЂСЏРјСѓСЋ СЃСЃС‹Р»РєСѓ РЅР° РёР·РѕР±СЂР°Р¶РµРЅРёРµ С‡РµСЂРµР· http/https РёР»Рё РЅР°РїРёС€Рё `off`.' }));
        }

        database.updateGuildSettings(guildId, { visuals: { [key]: value } });
        const record = database.markSetupComplete(guildId, buildGuildSettingsSnapshot(interaction.guild));
        await doPanelUpdate(guildId, true);
        return interaction.reply(
          ephemeral({
            content: value ? `Р‘Р°РЅРЅРµСЂ **${key}** СЃРѕС…СЂР°РЅС‘РЅ.` : `Р‘Р°РЅРЅРµСЂ **${key}** РѕС‚РєР»СЋС‡С‘РЅ.`,
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
              content: `Р С™Р В°Р Р…Р В°Р В» <#${channel.id}> Р С•РЎвЂЎР С‘РЎвЂ°Р ВµР Р… Р С—Р С• РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎРЏР С. Р Р€Р Т‘Р В°Р В»Р ВµР Р…Р С•: **${deleted}**.`
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
              : `РљР°РЅР°Р» <#${channel.id}> РѕС‡РёС‰РµРЅ РїРѕ СЃРѕРѕР±С‰РµРЅРёСЏРј. РЈРґР°Р»РµРЅРѕ: **${deleted}**.`;
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
          .setFooter({ text: 'BRHD вЂў Phoenix вЂў Moderation' });

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

      if (interaction.commandName === 'serverreport') {
        if (!canDebugConfig(interaction)) {
          return interaction.reply(ephemeral({ content: copy.common.noAccess }));
        }

        const period = interaction.options.getString(copy.commands.periodOptionName, true);
        return interaction.reply(ephemeral({
          embeds: [buildServerStatsReportEmbed(interaction.guild, period)]
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
        const wantsNicknameChange = queryLower.includes('СЃРјРµРЅРё РЅРёРє')
          || queryLower.includes('РёР·РјРµРЅРё РЅРёРє')
          || queryLower.includes('РїРµСЂРµРёРјРµРЅСѓР№')
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
          console.error('РћС€РёР±РєР° РёР·РјРµРЅРµРЅРёСЏ СЂР°РЅРіР°:', error);
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
    console.error('РћС€РёР±РєР° interactionCreate:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply(ephemeral({ content: copy.common.unknownError })).catch(() => {});
    }
  }
}

registerInteractionRuntime({
  client,
  handlePrimaryInteraction,
  ephemeral,
  copy,
  embeds,
  database,
  EmbedBuilderCtor: EmbedBuilder,
  resolveGuildSettings,
  getGuildRecord,
  canDebugConfig,
  isPremiumGuild,
  fetchTextChannel,
  sendWelcomeInvite,
  getVerificationRoleId,
  applyVerificationRole,
  getRoleMenuEntries,
  findRoleMenu,
  saveRoleMenu,
  removeRoleMenuItem,
  getCustomCommands,
  getReactionRoleEntries,
  normalizeReactionEmoji,
  sendScheduledReport
});

client.login(config.token);

