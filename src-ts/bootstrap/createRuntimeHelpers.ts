import { createFamilyRuntimeHelpers } from '../runtime-family-helpers';
import { createAutomationRuntimeHelpers } from '../runtime-automation-helpers';
import { createRuntimeLifecycleHelpers } from '../runtime-lifecycle-helpers';
import { createNotificationRuntimeHelpers } from '../runtime-notification-helpers';
import { createAccessApi } from '../access';
import type { DatabaseApi, StorageApi, AutoRanksConfig, GuildStorageContext, RankService } from '../types';
import { AppConfig } from '../config';
import { copy } from '../copy';
import { EmbedBuilder } from 'discord.js';
import { normalizeAutomodConfig } from '../automod';

export interface RuntimeHelpers {
  family: ReturnType<typeof createFamilyRuntimeHelpers>;
  automation: ReturnType<typeof createAutomationRuntimeHelpers>;
  lifecycle: ReturnType<typeof createRuntimeLifecycleHelpers>;
  notification: ReturnType<typeof createNotificationRuntimeHelpers>;
  access: ReturnType<typeof createAccessApi>;
}

export function createRuntimeHelpers(
  config: AppConfig,
  database: DatabaseApi,
  storage: StorageApi,
  guildRuntime: ReturnType<typeof import('../guild-runtime').createGuildRuntimeApi>,
  roleTemplates: any[],
  autoRanks: AutoRanksConfig,
  afkWarningThresholdMs: number,
  updateIntervalMs: number,
  fixedGuildId: string,
  fixedMessageId: string,
  memberSessionKey: (guildId: string, memberId: string) => string,
  voiceSessions: Map<string, any>,
  automodState: Map<string, number[]>,
  client: any
): RuntimeHelpers {
  const getGuildStorage = (guildId: string) => guildRuntime.getGuildStorage(guildId);
  const getRoleIds = (guildId: string) => guildRuntime.getRoleIds(guildId);
  const getRankService = (guildId: string) => {
    const settings = guildRuntime.resolveGuildSettings(guildId);
    return createRankService({ roles: settings.roles, storage: getGuildStorage(guildId), autoRanks });
  };
  const isPremiumGuild = (guildId: string) => guildRuntime.isPremiumGuild(guildId);
  const resolveGuildSettings = (guildId: string) => guildRuntime.resolveGuildSettings(guildId);
  const isModuleEnabled = (guildId: string, moduleName: string | null) => guildRuntime.isModuleEnabled(guildId, moduleName);

  const accessApi = createAccessApi({
    ownerIds: config.ownerIds,
    leakGuard: config.leakGuard,
    channelGuard: config.channelGuard,
    resolveGuildSettings
  });

  const family = createFamilyRuntimeHelpers({
    copy,
    voiceSessions,
    afkWarningThresholdMs,
    getGuildStorage,
    getRoleIds,
    getRankService,
    isPremiumGuild,
    resolveGuildSettings,
    memberSessionKey,
    EmbedBuilderCtor: EmbedBuilder
  });

  const automation = createAutomationRuntimeHelpers({
    database,
    automodState,
    copy,
    resolveGuildSettings,
    isModuleEnabled,
    isPremiumGuild,
    getGuildStorage,
    fetchTextChannel: async (guild: any, channelId?: string | null) => guild?.channels?.fetch?.(channelId || '').catch(() => null),
    buildServerStatsReportEmbed: (guild: any, period?: string) => buildServerStatsReportEmbed(guild, period, getGuildStorage, resolveGuildSettings),
    getWeeklyReportKey: (date?: Date) => getWeeklyReportKey(date),
    getMonthlyReportKey: (date?: Date) => getMonthlyReportKey(date),
    isScheduledReportDue: (period: string, now?: Date) => isScheduledReportDue(period, now),
    fetchGuild: async (guildId: string) => client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null),
    evaluateAutomodMessage: (payload: any) => evaluateAutomodMessage(payload),
    evaluateSpamActivity: (current: number[], now: number, automod: any) => evaluateSpamActivity(current, now, automod),
    getAutomodStateKey: (guildId: string, memberId: string) => `${guildId}:${memberId}`,
    canBypassAutomod: (member: any) => Boolean(member?.user?.bot),
    sendAutomodLog: async (guild: any, payload: any) => sendAutomodLog(guild, payload, getGuildStorage, resolveGuildSettings)
  });

  const lifecycle = createRuntimeLifecycleHelpers({
    client,
    storage,
    embeds: null as any,
    voiceSessions,
    autoRanks,
    fixedGuildId,
    fixedMessageId,
    updateIntervalMs,
    memberSessionKey,
    getGuildStorage,
    getRankService,
    isPremiumGuild,
    resolveGuildSettings,
    fetchTextChannel: async (guild: any, channelId?: string | null) => guild?.channels?.fetch?.(channelId || '').catch(() => null),
    buildFamilyDashboardStats: family.buildFamilyDashboardStats,
    sendRankDm: async () => {}
  });

  const notification = createNotificationRuntimeHelpers({
    copy,
    embeds: null as any,
    database,
    EmbedBuilderCtor: EmbedBuilder,
    fetchTextChannel: async (guild: any, channelId?: string | null) => guild?.channels?.fetch?.(channelId || '').catch(() => null),
    isPremiumGuild,
    resolveGuildSettings,
    currentBuildSignature: '',
    productVersionLabel: '',
    productVersionSemver: '',
    deployBuildId: '',
    deployCommitMessage: '',
    getUpdateChangeGroups: () => ({ added: [], updated: [], fixed: [] }),
    getCurrentReleaseChangeGroups: () => ({ added: [], updated: [], fixed: [] }),
    telegramNotifications: null as any
  });

  return { family, automation, lifecycle, notification, access: accessApi };
}

function createRankService(options: { roles: any[]; storage: GuildStorageContext; autoRanks: AutoRanksConfig }): RankService {
  return require('../ranks').createRankService(options);
}

function buildServerStatsReportEmbed(guild: any, period: string, getGuildStorage: any, resolveGuildSettings: any) {
  return require('../index').buildServerStatsReportEmbed(guild, period);
}

function getWeeklyReportKey(date = new Date()) {
  return require('../index').getWeeklyReportKey(date);
}

function getMonthlyReportKey(date = new Date()) {
  return require('../index').getMonthlyReportKey(date);
}

function isScheduledReportDue(period: string, now = new Date()) {
  return require('../index').isScheduledReportDue(period, now);
}

function evaluateAutomodMessage(payload: any) {
  return require('../automod').evaluateAutomodMessage(payload);
}

function evaluateSpamActivity(current: number[], now: number, automod: any) {
  return require('../automod').evaluateSpamActivity(current, now, automod);
}

async function sendAutomodLog(guild: any, payload: any, getGuildStorage: any, resolveGuildSettings: any) {
  return require('../index').sendAutomodLog(guild, payload);
}
