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
const {
  canApplications: canApplicationsHelper,
  canBypassChannelGuard: canBypassChannelGuardHelper,
  canBypassLeakGuard: canBypassLeakGuardHelper,
  canDebugConfig: canDebugConfigHelper,
  canDiscipline: canDisciplineHelper,
  canManageNicknames: canManageNicknamesHelper,
  canManageRanks: canManageRanksHelper,
  canManageTargetChannel: canManageTargetChannelHelper,
  canModerate: canModerateHelper,
  canUseSecurity: canUseSecurityHelper,
  fetchTextChannel: fetchTextChannelHelper,
  formatModerationTimestamp: formatModerationTimestampHelper,
  resolveTargetTextChannel: resolveTargetTextChannelHelper
} = require('./runtime-access-helpers');
const { createAutomationRuntimeHelpers } = require('./runtime-automation-helpers');
const { createFamilyRuntimeHelpers } = require('./runtime-family-helpers');
const { createRuntimeLifecycleHelpers } = require('./runtime-lifecycle-helpers');
const { createNotificationRuntimeHelpers } = require('./runtime-notification-helpers');
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
const ROLE_TEMPLATES = ROLES.map((role: any) => ({ ...role }));
const automodState = new Map();
const voiceSessions = new Map();
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

function scheduleDeleteReply(interaction: any, delayMs = 5000) {
  return scheduleDeleteReplyHelper(interaction, delayMs);
}

async function replyAndAutoDelete(interaction: any, payload: any, delayMs = 5000) {
  return replyAndAutoDeleteHelper(interaction, payload, delayMs);
}

async function editReplyAndAutoDelete(interaction: any, payload: any, delayMs = 5000) {
  return editReplyAndAutoDeleteHelper(interaction, payload, delayMs);
}

function memberSessionKey(guildId: any, memberId: any) {
  return buildMemberSessionKey(guildId, memberId);
}

function resolveGuildSettings(guildId: any) {
  return guildRuntime.resolveGuildSettings(guildId);
}

function getRoleIds(guildId: any) {
  return guildRuntime.getRoleIds(guildId);
}

function getGuildStorage(guildId: any) {
  return guildRuntime.getGuildStorage(guildId);
}

function getRankService(guildId: any) {
  return createRankService({
    roles: resolveGuildSettings(guildId).roles,
    storage: getGuildStorage(guildId),
    autoRanks: AUTO_RANKS
  });
}

function hasPermission(member: any, permission: any) {
  return accessApi.hasPermission(member, permission);
}

function hasAnyRole(member: any, roleIds: any) {
  return accessApi.hasAnyRole(member, roleIds);
}

function isOwner(userId: any) {
  return accessApi.isOwner(userId);
}

function getGuildPlan(guildId: any) {
  return guildRuntime.getGuildPlan(guildId);
}

function isPremiumGuild(guildId: any) {
  return guildRuntime.isPremiumGuild(guildId);
}

function buildGuildSettingsSnapshot(guild: any) {
  return guildRuntime.buildGuildSettingsSnapshot(guild);
}

const {
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
} = createFamilyRuntimeHelpers({
  copy,
  voiceSessions,
  afkWarningThresholdMs: AFK_WARNING_THRESHOLD_MS,
  getGuildStorage,
  getRoleIds,
  getRankService,
  isPremiumGuild,
  resolveGuildSettings,
  memberSessionKey,
  EmbedBuilderCtor: EmbedBuilder
});

const {
  announceBuildUpdate,
  applyAutorole,
  applyVerificationRole,
  getVerificationRoleId,
  sendAcceptLog,
  sendAcceptanceDm,
  sendAfkWarningDm,
  sendAutomodLog,
  sendBlacklistDm,
  sendDisciplineDm,
  sendDisciplineLog,
  sendRankDm,
  sendSecurityLog,
  sendServerLogEmbed,
  sendWelcomeInvite
} = createNotificationRuntimeHelpers({
  copy,
  embeds,
  database,
  EmbedBuilderCtor: EmbedBuilder,
  fetchTextChannel,
  isPremiumGuild,
  resolveGuildSettings,
  currentBuildSignature: CURRENT_BUILD_SIGNATURE,
  productVersionLabel: PRODUCT_VERSION_LABEL,
  productVersionSemver: PRODUCT_VERSION_SEMVER,
  deployBuildId: DEPLOY_BUILD_ID,
  deployCommitMessage: DEPLOY_COMMIT_MESSAGE,
  getUpdateChangeGroups,
  getCurrentReleaseChangeGroups
});

const {
  getRoleMenuEntries,
  findRoleMenu,
  saveRoleMenu,
  removeRoleMenuItem,
  getCustomCommands,
  handleCustomTriggerMessage,
  sendScheduledReport,
  runScheduledReports,
  handleAutomodMessage
} = createAutomationRuntimeHelpers({
  database,
  automodState,
  copy,
  resolveGuildSettings,
  isModuleEnabled,
  isPremiumGuild,
  getGuildStorage,
  fetchTextChannel,
  buildServerStatsReportEmbed,
  getWeeklyReportKey,
  getMonthlyReportKey,
  isScheduledReportDue,
  fetchGuild: async (guildId: any) =>
    client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null),
  evaluateAutomodMessage,
  evaluateSpamActivity,
  getAutomodStateKey,
  canBypassAutomod,
  sendAutomodLog
});

const {
  startVoiceSession,
  stopVoiceSession,
  flushVoiceSessions,
  doPanelUpdate,
  doPanelUpdateAll,
  syncAutoRanks,
  syncAutoRanksAll
} = createRuntimeLifecycleHelpers({
  client,
  storage,
  embeds,
  voiceSessions,
  autoRanks: AUTO_RANKS,
  fixedGuildId: GUILD_ID,
  fixedMessageId: MESSAGE_ID,
  updateIntervalMs: UPDATE_INTERVAL_MS,
  memberSessionKey,
  getGuildStorage,
  getRankService,
  isPremiumGuild,
  resolveGuildSettings,
  fetchTextChannel,
  buildFamilyDashboardStats,
  sendRankDm
});

function formatPeriodLabel(period: any) {
  return period === 'monthly' ? 'Ежемесячный статистический отчёт' : 'Еженедельный статистический отчёт';
}

function formatPeriodRangeLabel(analytics: any) {
  return analytics.dayCount >= 30
    ? `Отчёт за период с ${analytics.fromDayKey}`
    : `Отчёт за период: ${analytics.fromDayKey} - ${analytics.toDayKey}`;
}

function medal(index: any) {
  return `${index + 1}.`;
}

function formatMinutesLong(totalMinutes: any) {
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

function getReactionEmojiKey(emoji: any) {
  if (!emoji) return '';
  return String(emoji.id || emoji.name || '').trim();
}

function getReactionRoleEntries(guildId: any) {
  return resolveGuildSettings(guildId).reactionRoles || [];
}

function findReactionRoleEntry(guildId: any, messageId: any, emojiKey: any) {
  const normalizedEmoji = normalizeReactionEmoji(emojiKey);
  return getReactionRoleEntries(guildId).find(
    (entry: any) => entry.messageId === String(messageId) && normalizeReactionEmoji(entry.emoji) === normalizedEmoji
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

function isScheduledReportDue(period: any, now = new Date()) {
  if (now.getHours() !== 2) return false;

  if (period === 'monthly') {
    return now.getDate() === 1;
  }

  return (now.getDay() || 7) === 1;
}

function getMemberLabel(guild: any, memberId: any) {
  const member = guild.members.cache.get(memberId);
  if (member) {
    return `<@${memberId}> | ${member.displayName}`;
  }

  return `<@${memberId}>`;
}

function getChannelLabel(guild: any, channelId: any) {
  const channel = guild.channels.cache.get(channelId);
  return channel ? `<#${channelId}>` : `#${channelId}`;
}

function buildRankedLines(entries: any, formatter: any, limit = 5) {
  return entries.slice(0, limit).map((entry: any, index: any) => `${medal(index)} ${formatter(entry)}`);
}

function buildServerStatsReportEmbed(guild: any, period = 'weekly') {
  const guildStorage = getGuildStorage(guild.id);
  const settings = resolveGuildSettings(guild.id);
  const analytics = guildStorage.getPeriodAnalytics(period === 'monthly' ? 30 : 7);
  const memberEntries = Object.entries(analytics.members || {}) as Array<[string, any]>;

  const topMessages = buildRankedLines(
    memberEntries
      .map(([memberId, stats]) => ({ memberId, value: stats.messages || 0 }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    (item: any) => `${getMemberLabel(guild, item.memberId)} - ${item.value} сообщений`
  );

  const topVoice = buildRankedLines(
    memberEntries
      .map(([memberId, stats]) => ({ memberId, value: stats.voiceMinutes || 0 }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    (item: any) => `${getMemberLabel(guild, item.memberId)} - ${formatMinutesLong(item.value)}`
  );

  const topReactions = buildRankedLines(
    memberEntries
      .map(([memberId, stats]) => ({ memberId, value: stats.reactions || 0 }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    (item: any) => `${getMemberLabel(guild, item.memberId)} - ${item.value} реакций`
  );

  const topChannels = buildRankedLines(
    (Object.entries(analytics.channels || {}) as Array<[string, any]>)
      .map(([channelId, value]) => ({ channelId, value }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    (item: any) => `${getChannelLabel(guild, item.channelId)} - ${item.value} сообщений`
  );

  const topVoiceChannels = buildRankedLines(
    (Object.entries(analytics.voiceChannels || {}) as Array<[string, any]>)
      .map(([channelId, value]) => ({ channelId, value }))
      .filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value),
    (item: any) => `${getChannelLabel(guild, item.channelId)} - ${formatMinutesLong(item.value)}`
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

function normalizeMemberQuery(value: any) {
  return String(value || '').trim().toLowerCase();
}

async function resolveMemberQuery(guild: any, query: any, fallbackUserId = '') {
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
  const findIn = (members: any) =>
    members.find((member: any) => normalizeMemberQuery(member.displayName) === lookup) ||
    members.find((member: any) => normalizeMemberQuery(member.user.username) === lookup) ||
    members.find((member: any) => normalizeMemberQuery(member.displayName).includes(lookup)) ||
    members.find((member: any) => normalizeMemberQuery(member.user.username).includes(lookup)) ||
    null;

  const cachedMembers = Array.from(guild.members.cache.values()).filter((member: any) => !member.user?.bot);
  const cachedMatch = findIn(cachedMembers);
  if (cachedMatch) return cachedMatch;

  await guild.members.fetch().catch(() => {});
  const fetchedMembers = Array.from(guild.members.cache.values()).filter((member: any) => !member.user?.bot);
  return findIn(fetchedMembers);
}

async function buildAiAdvisorEmbed(guild: any, member: any) {
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

function getGuildRecord(guild: any) {
  return database.ensureGuild(guild.id, {
    guildName: guild.name,
    ownerId: guild.ownerId || ''
  });
}

function getRoleLimit(guildId: any) {
  return isPremiumGuild(guildId) ? Number.MAX_SAFE_INTEGER : 6;
}

function getCommandModule(commandName: any) {
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

function isModuleEnabled(guildId: any, moduleName: any) {
  return guildRuntime.isModuleEnabled(guildId, moduleName);
}

function getHelpCatalog(interaction: any) {
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

function canUseCommandInContext(commandName: any, interaction: any) {
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

function buildAiCommandsOverview(interaction: any) {
  return buildAiCommandsOverviewHelper({
    catalog: getHelpCatalog(interaction),
    isPremium: isPremiumGuild(interaction.guild.id),
    userId: interaction.user.id,
    copy
  });
}

function canBypassAutomod(member: any) {
  return Boolean(member?.user?.bot);
}

function canApplications(member: any) {
  return canApplicationsHelper(accessApi, member);
}

function canDiscipline(member: any) {
  return canDisciplineHelper(accessApi, member);
}

function canManageRanks(member: any) {
  return canManageRanksHelper(accessApi, member);
}

function canModerate(member: any) {
  return canModerateHelper(accessApi, member);
}

function canManageNicknames(member: any) {
  return canManageNicknamesHelper(accessApi, member);
}

function canDebugConfig(interaction: any) {
  return canDebugConfigHelper(interaction);
}

function canUseSecurity(member: any) {
  return canUseSecurityHelper(accessApi, member);
}

function canBypassLeakGuard(member: any) {
  return canBypassLeakGuardHelper(accessApi, member);
}

function canBypassChannelGuard(member: any) {
  return canBypassChannelGuardHelper(accessApi, member);
}

async function fetchTextChannel(guild: any, id: any) {
  return fetchTextChannelHelper(guild, id);
}

function resolveTargetTextChannel(interaction: any) {
  return resolveTargetTextChannelHelper(interaction, copy.commands.channelOptionName);
}

function canManageTargetChannel(member: any, channel: any) {
  return canManageTargetChannelHelper(accessApi, member, channel);
}

function formatModerationTimestamp(timestamp: any) {
  return formatModerationTimestampHelper(timestamp);
}

async function deleteMessagesFast(messages: any) {
  if (!messages.length) return 0;

  const now = Date.now();
  const fresh = messages.filter((message: any) => now - message.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
  const stale = messages.filter((message: any) => now - message.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);
  let deleted = 0;

  for (let index = 0; index < fresh.length; index += 100) {
    const batch = fresh.slice(index, index + 100);
    if (!batch.length) continue;
    const result = await batch[0].channel.bulkDelete(batch.map((message: any) => message.id), true).catch(() => null);
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

async function fetchRecentDeletableMessages(channel: any, count: any) {
  const collected = [];
  let before;

  while (collected.length < count) {
    const batch: any = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
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

async function fetchAllDeletableMessages(channel: any, { includePinned = true } = {}) {
  const collected = [];
  let skippedSystem = 0;
  let skippedBlocked = 0;
  let before;

  while (true) {
    const batch: any = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
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

function messageBelongsToUser(message: any, userId: any) {
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

async function fetchMessagesForUser(channel: any, userId: any, count: any) {
  const collected = [];
  let matched = 0;
  let blocked = 0;
  let system = 0;
  let before;

  while (collected.length < count) {
    const batch: any = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
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

async function clearChannelByMessages(channel: any) {
  const { messages, skippedSystem, skippedBlocked } = await fetchAllDeletableMessages(channel);
  const deleted = await deleteMessagesFast(messages);

  return {
    deleted,
    requested: messages.length,
    skippedSystem,
    skippedBlocked
  };
}

function remapConfiguredChannelIds(guildId: any, oldChannelId: any, newChannelId: any) {
  const settings = resolveGuildSettings(guildId);
  const channelPatch: Record<string, any> = {};

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

async function fetchMemberFast(guild: any, userId: any) {
  return guild.members.cache.get(userId) || guild.members.fetch(userId).catch(() => null);
}

function getApplicationsService(guildId: any) {
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

async function refreshMember(member: any) {
  if (typeof member.fetch !== 'function') return member;
  return member.fetch().catch(() => member);
}

function buildProfilePayload(member: any, allowRankButtons: any, content = '') {
  const guildStorage = getGuildStorage(member.guild.id);
  const rankService = getRankService(member.guild.id);
  const memberData = { ...guildStorage.ensureMemberRecord(member.id), voiceMinutes: getLiveVoiceMinutes(member) };
  const rankInfo = {
    ...rankService.describeMember(member),
    autoEnabled: isPremiumGuild(member.guild.id) && AUTO_RANKS.enabled
  };
  const payload: any = {
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

function formatRankResult(userId: any, result: any) {
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

async function enforceBlacklist(member: any) {
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

function buildMaintenanceEmbed({ title, description, color, fieldName, lines }: any) {
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

async function runRolelessCleanup(guildId: any, reason = 'interval') {
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

    const nonEveryoneRoles = member.roles.cache.filter((role: any) => role.id !== guild.id);
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

async function runRolelessCleanupDetailed(guildId: any, reason = 'interval', options: any = {}) {
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

    const nonEveryoneRoles = member.roles.cache.filter((role: any) => role.id !== guild.id);
    if (nonEveryoneRoles.size > 0) continue;

    const blockedReason = explainKickFailure(member, botMember);
    if (blockedReason) {
      failed.push(`${member.user.username} (\`${member.id}\`) - ${blockedReason}`);
      continue;
    }

    try {
      await member.kick('Еженедельная очистка участников без ролей');
      kicked.push(member.user.username);
    } catch (error: any) {
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

async function runAfkWarnings(guildId: any) {
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
  handleCommand: (interaction: any) => {
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
    getGuildRecord: (guild: any) => database.getGuild(guild.id),
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
    updateAutomodConfig: (guildId: any, patch: any) => database.updateGuildSettings(guildId, { automod: patch }),
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



