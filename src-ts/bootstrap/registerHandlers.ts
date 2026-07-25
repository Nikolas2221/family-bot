import { registerClientReadyRuntime } from '../client-ready-runtime';
import { registerEventRuntime } from '../event-runtime';
import { registerInteractionRuntime } from '../interaction-runtime';
import { AppConfig } from '../config';
import type { DatabaseApi, StorageApi, AutoRanksConfig } from '../types';
import { EmbedBuilder } from 'discord.js';

export interface HandlerDependencies {
  client: any;
  database: DatabaseApi;
  storage: StorageApi;
  config: AppConfig;
  autoRanks: AutoRanksConfig;
  afkWarningCheckIntervalMs: number;
  reportScheduleCheckIntervalMs: number;
  updateIntervalMs: number;
  syncAutoRanks: (guildId: string, reason: string) => Promise<any>;
  syncAutoRanksAll: (reason: string) => Promise<any>;
  doPanelUpdate: (guildId: string, force: boolean) => Promise<any>;
  doPanelUpdateAll: (force: boolean) => Promise<any>;
  refreshLegacyBrandMessages: (guild: any) => Promise<any>;
  announceBuildUpdate: (guild: any) => Promise<any>;
  runRolelessCleanupDetailed: (guildId: string, reason: string, options?: any) => Promise<any>;
  runAfkWarnings: (guildId: string) => Promise<any>;
  runScheduledReports: (guildId: string, now?: Date) => Promise<any>;
  startVoiceSession: (member: any) => void;
  stopVoiceSession: (member: any) => void;
  flushVoiceSessions: () => void;
  handleCommand: (interaction: any) => Promise<boolean>;
  applicationCooldownMs: number;
  ephemeral: (payload: any) => any;
  copy: any;
  embeds: any;
  aiService: any;
  EmbedBuilderCtor: typeof EmbedBuilder;
  resolveGuildSettings: (guildId: string) => any;
  getGuildRecord: (guild: any) => any;
  getGuildStorage: (guildId: string) => any;
  getApplicationsService: (guildId: string) => any;
  getRankService: (guildId: string) => any;
  canDebugConfig: (interaction: any) => boolean;
  canApplications: (member: any) => boolean;
  canManageRanks: (member: any) => boolean;
  canUseSecurity: (member: any) => boolean;
  isPremiumGuild: (guildId: string) => boolean;
  fetchTextChannel: (guild: any, channelId?: string | null) => Promise<any>;
  fetchMemberFast: (guild: any, userId: string) => Promise<any>;
  refreshMember: (member: any) => Promise<any>;
  sendWelcomeInvite: (member: any, memberCount?: number) => Promise<any>;
  sendRankDm: (guild: any, member: any, result: any) => Promise<any>;
  getVerificationRoleId: (guildId: string) => string;
  applyVerificationRole: (member: any) => Promise<any>;
  getRoleMenuEntries: (guildId: string) => any[];
  findRoleMenu: (guildId: string, menuId: string) => any;
  saveRoleMenu: (guildId: string, menu: any) => void;
  removeRoleMenuItem: (guildId: string, menuId: string, roleId: string) => void;
  getCustomCommands: (guildId: string) => any[];
  getReactionRoleEntries: (guildId: string) => any[];
  normalizeReactionEmoji: (emojiValue?: string) => string;
  buildProfilePayload: (member: any, allowRankButtons: boolean, content?: string) => any;
  buildLeaderboardLines: (guild: any, limit?: number) => string[];
  buildLeaderboardSummary: (guild: any) => any;
  buildVoiceActivityLines: (guild: any, limit?: number) => string[];
  buildVoiceActivitySummary: (guild: any) => any;
  buildPremiumActivityReportEmbed: (guild: any, targetMember?: any) => any;
  buildAiAdvisorEmbed: (guild: any, member: any) => Promise<any>;
  resolveMemberQuery: (guild: any, query: string, fallbackUserId?: string) => Promise<any>;
  formatRankResult: (userId: string, result: any) => string;
  sendScheduledReport: (guild: any, period: string, channelId: string) => Promise<boolean>;
  getHelpCatalog: (interaction: any) => any;
  supportTicketService: any;
  afkLeaveService: any;
  reportRequestService: any;
  mediaShareService: any;
  voiceRoomsService: any;
  formatVoiceHours: (minutes: number) => string;
  buildFamilyDashboardStats: (guild: any) => any;
  buildServerStatsReportEmbed: (guild: any, period: string) => any;
}

export function registerAllHandlers(deps: HandlerDependencies): void {
  registerClientReadyRuntime({
    client: deps.client,
    database: deps.database,
    updateIntervalMs: deps.updateIntervalMs,
    autoRanks: deps.autoRanks,
    afkWarningCheckIntervalMs: deps.afkWarningCheckIntervalMs,
    reportScheduleCheckIntervalMs: deps.reportScheduleCheckIntervalMs,
    syncAutoRanks: deps.syncAutoRanks,
    syncAutoRanksAll: deps.syncAutoRanksAll,
    doPanelUpdate: deps.doPanelUpdate,
    doPanelUpdateAll: deps.doPanelUpdateAll,
    refreshLegacyBrandMessages: deps.refreshLegacyBrandMessages,
    announceBuildUpdate: deps.announceBuildUpdate,
    runRolelessCleanupDetailed: deps.runRolelessCleanupDetailed,
    runAfkWarnings: deps.runAfkWarnings,
    runScheduledReports: deps.runScheduledReports,
    startVoiceSession: deps.startVoiceSession
  });

  registerEventRuntime({
    client: deps.client,
    leakGuard: deps.config.leakGuard,
    scamGuard: deps.config.scamGuard,
    channelGuard: deps.config.channelGuard,
    copySecurity: deps.copy.security,
    getGuildStorage: deps.getGuildStorage,
    isPremiumGuild: deps.isPremiumGuild,
    isModuleEnabled: (guildId: string, moduleName: string | null) => deps.guildRuntime?.isModuleEnabled?.(guildId, moduleName) ?? true,
    hasFamilyRole: (member: any) => deps.family?.hasFamilyRole?.(member) ?? false,
    containsDiscordInvite: require('../security').containsDiscordInvite,
    detectScamGift: require('../security').detectScamGift,
    canBypassLeakGuard: (member: any) => deps.access?.canBypassLeakGuard?.(member) ?? false,
    canBypassScamGuard: (member: any) => deps.access?.canBypassScamGuard?.(member) ?? false,
    handleAutomodMessage: (message: any) => deps.automation?.handleAutomodMessage?.(message) ?? Promise.resolve(false),
    handleCustomTriggerMessage: (message: any) => deps.automation?.handleCustomTriggerMessage?.(message) ?? Promise.resolve(false),
    sendSecurityLog: (guild: any, content: string) => deps.notification?.sendSecurityLog?.(guild, content) ?? Promise.resolve(),
    notifyTelegramScamBlocked: (input: any) => deps.telegramNotifications?.notifyScamBlocked?.(input) ?? Promise.resolve(false),
    notifyTelegramSecurityAlert: (input: any) => deps.telegramNotifications?.notifySecurityAlert?.(input) ?? Promise.resolve(false),
    startVoiceSession: deps.startVoiceSession,
    stopVoiceSession: deps.stopVoiceSession,
    enforceBlacklist: (member: any) => deps.family?.enforceBlacklist?.(member) ?? Promise.resolve(false),
    sendWelcomeInvite: deps.sendWelcomeInvite,
    notifyTelegramMemberJoined: (member: any) => deps.telegramNotifications?.notifyMemberJoined?.(member) ?? Promise.resolve(false),
    applyAutorole: (member: any) => deps.notification?.applyAutorole?.(member) ?? Promise.resolve(false),
    resolveGuildSettings: deps.resolveGuildSettings,
    findReactionRoleEntry: (guildId: string, messageId: string, emojiKey: string) => deps.automation?.findReactionRoleEntry?.(guildId, messageId, emojiKey) ?? null,
    getReactionEmojiKey: (emoji: any) => deps.automation?.getReactionEmojiKey?.(emoji) ?? '',
    canBypassChannelGuard: (member: any) => deps.access?.canBypassChannelGuard?.(member) ?? false,
    fetchDeletedChannelExecutor: require('../security').fetchDeletedChannelExecutor,
    restoreDeletedChannel: require('../security').restoreDeletedChannel,
    doPanelUpdate: deps.doPanelUpdate,
    handleDiscordTicketMessage: (message: any) => deps.ticketService?.handleDiscordTicketMessage?.(message) ?? Promise.resolve(false),
    handleAfkMessage: (message: any) => deps.afkLeaveService?.handleMessage?.(message) ?? Promise.resolve(false),
    handleVoiceRoomsVoiceStateUpdate: (oldState: any, newState: any) => deps.voiceRoomsService?.handleVoiceStateUpdate?.(oldState, newState) ?? Promise.resolve(false)
  });

  registerInteractionRuntime({
    client: deps.client,
    handleCommand: deps.handleCommand,
    applicationCooldownMs: deps.applicationCooldownMs,
    ephemeral: deps.ephemeral,
    copy: deps.copy,
    embeds: deps.embeds,
    database: deps.database,
    aiService: deps.aiService,
    EmbedBuilderCtor: deps.EmbedBuilderCtor,
    resolveGuildSettings: deps.resolveGuildSettings,
    getGuildRecord: deps.getGuildRecord,
    getGuildStorage: deps.getGuildStorage,
    getApplicationsService: deps.getApplicationsService,
    getRankService: deps.getRankService,
    canDebugConfig: deps.canDebugConfig,
    canApplications: deps.canApplications,
    canManageRanks: deps.canManageRanks,
    canUseSecurity: deps.canUseSecurity,
    isPremiumGuild: deps.isPremiumGuild,
    fetchTextChannel: deps.fetchTextChannel,
    fetchMemberFast: deps.fetchMemberFast,
    refreshMember: deps.refreshMember,
    sendWelcomeInvite: deps.sendWelcomeInvite,
    sendRankDm: deps.sendRankDm,
    getVerificationRoleId: deps.getVerificationRoleId,
    applyVerificationRole: deps.applyVerificationRole,
    getRoleMenuEntries: deps.getRoleMenuEntries,
    findRoleMenu: deps.findRoleMenu,
    saveRoleMenu: deps.saveRoleMenu,
    removeRoleMenuItem: deps.removeRoleMenuItem,
    getCustomCommands: deps.getCustomCommands,
    getReactionRoleEntries: deps.getReactionRoleEntries,
    normalizeReactionEmoji: deps.normalizeReactionEmoji,
    buildProfilePayload: deps.buildProfilePayload,
    buildLeaderboardLines: deps.buildLeaderboardLines,
    buildLeaderboardSummary: deps.buildLeaderboardSummary,
    buildVoiceActivityLines: deps.buildVoiceActivityLines,
    buildVoiceActivitySummary: deps.buildVoiceActivitySummary,
    buildPremiumActivityReportEmbed: deps.buildPremiumActivityReportEmbed,
    buildAiAdvisorEmbed: deps.buildAiAdvisorEmbed,
    getHelpCatalog: deps.getHelpCatalog,
    supportTicketService: deps.supportTicketService,
    afkLeaveService: deps.afkLeaveService,
    reportRequestService: deps.reportRequestService,
    mediaShareService: deps.mediaShareService,
    voiceRoomsService: deps.voiceRoomsService,
    resolveMemberQuery: deps.resolveMemberQuery,
    formatRankResult: deps.formatRankResult,
    syncAutoRanks: deps.syncAutoRanks,
    doPanelUpdate: deps.doPanelUpdate,
    sendScheduledReport: deps.sendScheduledReport
  });
}
