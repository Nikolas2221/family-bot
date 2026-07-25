import type { AppConfig } from './types';
import type { DatabaseApi, StorageApi, GuildStorageContext, RoleDefinition } from './types';
import { createGuildRuntimeApi } from './guild-runtime';
import { createAIService } from './ai';
import { createDeepSeekService } from './services/deepseek';
import { createLawService } from './services/law';
import { createTelegramNotificationService } from './telegram/notifications';
import { createTelegramBot } from './telegram/bot';
import { createSupportTicketService } from './services/support-tickets';
import { createReportRequestService } from './services/report-requests';
import { createMediaShareService } from './services/media-share';
import { createAfkLeaveService } from './services/afk-leave';
import { createServerBackupService } from './services/server-backups';
import { createVoiceRoomsService } from './modules/voiceRooms';
import { createMajesticApiService } from './modules/majesticApi';
import { createFamilyCabinetService } from './modules/familyCabinet';
import { createAnnouncementService } from './services/announcements';
import { createTicketService } from './services/tickets';
import { createAccessApi } from './access';
import { buildDiscordOnlineMembersText } from './services/online-members';
import { roles } from './roles';
import { copy } from './copy';
import { normalizeAutomodConfig } from './automod';
import { EmbedBuilder } from 'discord.js';
import { createConfig } from './config';

export interface ServiceContainer {
  database: DatabaseApi;
  storage: StorageApi;
  guildRuntime: ReturnType<typeof createGuildRuntimeApi>;
  aiService: ReturnType<typeof createAIService>;
  deepSeekService: ReturnType<typeof createDeepSeekService>;
  lawService: ReturnType<typeof createLawService>;
  telegramBot: any | null;
  telegramNotifications: ReturnType<typeof createTelegramNotificationService>;
  supportTicketService: ReturnType<typeof createSupportTicketService>;
  reportRequestService: ReturnType<typeof createReportRequestService>;
  mediaShareService: ReturnType<typeof createMediaShareService>;
  afkLeaveService: ReturnType<typeof createAfkLeaveService>;
  serverBackupService: ReturnType<typeof createServerBackupService>;
  voiceRoomsService: ReturnType<typeof createVoiceRoomsService>;
  majesticApiService: ReturnType<typeof createMajesticApiService>;
  familyCabinetService: ReturnType<typeof createFamilyCabinetService>;
  announcementService: ReturnType<typeof createAnnouncementService>;
  ticketService: ReturnType<typeof createTicketService>;
  accessApi: ReturnType<typeof createAccessApi>;
  roleTemplates: RoleDefinition[];
  config: AppConfig;
  logger: ReturnType<typeof import('./logger').createLogger>;
}

const containers = new Map<string, ServiceContainer>();

export function createContainer(database: any, storage: any, config: any, normalizeAutomodConfig: any, key = 'default'): ServiceContainer {
    const logger = createLogger({ level: 'info', service: 'KLAIZ' });
    const roleTemplates = roles.map(role => ({ ...role }));

    const guildRuntime = createGuildRuntimeApi({
        database,
        storage,
        roleTemplates,
        defaults: {
            guildId: config.guildId,
            channelId: config.channelId,
            applicationsChannelId: config.applicationsChannelId,
            logChannelId: config.logChannelId,
            disciplineLogChannelId: config.disciplineLogChannelId,
            familyTitle: config.familyTitle,
            accessApplications: config.accessApplications,
            accessDiscipline: config.accessDiscipline,
            accessRanks: config.accessRanks,
            applicationDefaultRole: config.applicationDefaultRole,
            guestRoleId: config.guestRoleId,
            features: {
                aiEnabled: config.aiEnabled,
                autoRanksEnabled: config.autoRanks.enabled,
                leakGuardEnabled: config.leakGuard.enabled,
                channelGuardEnabled: config.channelGuard.enabled
            },
            normalizeAutomodConfig
        }
    });

    // Собираем объект контейнера
    const container: ServiceContainer = {
        database,
        storage,
        guildRuntime,
        aiService,
        deepSeekService,
        lawService,
        telegramBot: null, // Временно заглушка
        telegramNotifications,
        supportTicketService,
        reportRequestService,
        mediaShareService,
        afkLeaveService,
        serverBackupService,
        voiceRoomsService,
        majesticApiService,
        familyCabinetService,
        announcementService,
        ticketService,
        accessApi,
        roleTemplates,
        config,
        logger,
        
        // Добавляем геттеры для проксирования методов из guildRuntime
        get isPremiumGuild() {
            return this.guildRuntime.isPremiumGuild.bind(this.guildRuntime);
        },
        get getGuildPlan() {
            return this.guildRuntime.getGuildPlan.bind(this.guildRuntime);
        },
        get getGuildStorage() {
            return this.guildRuntime.getGuildStorage.bind(this.guildRuntime);
        },
        get resolveGuildSettings() {
            return this.guildRuntime.resolveGuildSettings.bind(this.guildRuntime);
        },
        get getRoleIds() {
            return this.guildRuntime.getRoleIds.bind(this.guildRuntime);
        },
        get buildGuildSettingsSnapshot() {
            return this.guildRuntime.buildGuildSettingsSnapshot.bind(this.guildRuntime);
        }
    };

    return container;
};

  const logger = createLogger({ level: 'info', service: 'KLAIZ' });

  const roleTemplates = roles.map(role => ({ ...role }));

  const guildRuntime = createGuildRuntimeApi({
    database,
    storage,
    roleTemplates,
    defaults: {
      guildId: config.guildId,
      channelId: config.channelId,
      applicationsChannelId: config.applicationsChannelId,
      logChannelId: config.logChannelId,
      disciplineLogChannelId: config.disciplineLogChannelId,
      familyTitle: config.familyTitle,
      accessApplications: config.accessApplications,
      accessDiscipline: config.accessDiscipline,
      accessRanks: config.accessRanks,
      applicationDefaultRole: config.applicationDefaultRole,
      guestRoleId: config.guestRoleId,
      features: {
        aiEnabled: config.aiEnabled,
        autoRanksEnabled: config.autoRanks.enabled,
        leakGuardEnabled: config.leakGuard.enabled,
        channelGuardEnabled: config.channelGuard.enabled
      },
      normalizeAutomodConfig
    }
  });

  const aiService = createAIService({ enabled: config.aiEnabled });
  const deepSeekService = createDeepSeekService({
    apiKey: config.aiEnabled ? config.deepSeekApiKey : '',
    baseUrl: config.deepSeekBaseUrl,
    model: config.deepSeekModel
  });
  const lawService = createLawService(deepSeekService.enabled ? deepSeekService : null);

  const telegramBot = createTelegramBot(config.telegramBotToken && config.telegramAdminChatId ? config.telegramBotToken : '');
  const telegramNotifications = createTelegramNotificationService({
    adminChatId: config.telegramAdminChatId,
    announcementsChatId: config.telegramAnnouncementsChatId,
    allowedGuildIds: config.telegramAllowedGuildIds,
    sender: telegramBot?.telegram || null
  });

  const supportTicketService = createSupportTicketService({ storage, client: null as any, config: config.supportTickets });
  const reportRequestService = createReportRequestService({
    database,
    fetchTextChannel: async () => null,
    resolveGuildSettings: guildRuntime.resolveGuildSettings,
    canManageReports: () => false
  });
  const mediaShareService = createMediaShareService({
    database,
    fetchTextChannel: async () => null,
    resolveGuildSettings: guildRuntime.resolveGuildSettings,
    canManageMedia: () => false
  });
  const afkLeaveService = createAfkLeaveService({
    storage,
    client: null as any,
    config: config.afkLeave,
    telegramNotifications
  });
  const ticketService = createTicketService({ storage, client: null as any, telegramNotifications });
  const announcementService = createAnnouncementService({
    storage,
    client: null as any,
    telegramNotifications,
    discordChannelId: config.discordAnnouncementsChannelId
  });
  const serverBackupService = createServerBackupService({
    client: null as any,
    config: config.serverBackup
  });
  const voiceRoomsService = createVoiceRoomsService({
    client: null as any,
    config: config.voiceRooms
  });
  const majesticApiService = createMajesticApiService(config.majesticApi);
  const familyCabinetService = createFamilyCabinetService(null as any, config.familyCabinet);
  const accessApi = createAccessApi({
    ownerIds: config.ownerIds,
    leakGuard: config.leakGuard,
    channelGuard: config.channelGuard,
    resolveGuildSettings: guildRuntime.resolveGuildSettings
  });

  const container: ServiceContainer = {
    database,
    storage,
    guildRuntime,
    aiService,
    deepSeekService,
    lawService,
    telegramBot,
    telegramNotifications,
    supportTicketService,
    reportRequestService,
    mediaShareService,
    afkLeaveService,
    serverBackupService,
    voiceRoomsService,
    majesticApiService,
    familyCabinetService,
    announcementService,
    ticketService,
    accessApi,
    roleTemplates,
    config,
    logger
  };

  containers.set(key, container); 
   return container; 
  }



export function getContainer(key = 'default'): ServiceContainer | undefined {
  return containers.get(key);
}

export function setContainerClientServices(container: ServiceContainer, client: any): void {
  container.supportTicketService = createSupportTicketService({ storage: container.storage, client, config: container.config.supportTickets });
  container.reportRequestService = createReportRequestService({
    database: container.database,
    fetchTextChannel: async (guild: any, channelId?: string | null) => guild?.channels?.fetch?.(channelId || '').catch(() => null),
    resolveGuildSettings: container.guildRuntime.resolveGuildSettings,
    canManageReports: (interaction: any) => container.accessApi.canUseSecurity(interaction.member)
  });
  container.mediaShareService = createMediaShareService({
    database: container.database,
    fetchTextChannel: async (guild: any, channelId?: string | null) => guild?.channels?.fetch?.(channelId || '').catch(() => null),
    resolveGuildSettings: container.guildRuntime.resolveGuildSettings,
    canManageMedia: (interaction: any) => container.accessApi.canUseSecurity(interaction.member)
  });
  container.afkLeaveService = createAfkLeaveService({
    storage: container.storage,
    client,
    config: container.config.afkLeave,
    telegramNotifications: container.telegramNotifications
  });
  container.ticketService = createTicketService({ storage: container.storage, client, telegramNotifications: container.telegramNotifications });
  container.announcementService = createAnnouncementService({
    storage: container.storage,
    client,
    telegramNotifications: container.telegramNotifications,
    discordChannelId: container.config.discordAnnouncementsChannelId
  });
  container.serverBackupService = createServerBackupService({ client, config: container.config.serverBackup });
  container.voiceRoomsService = createVoiceRoomsService({ client, config: container.config.voiceRooms });
  container.familyCabinetService = createFamilyCabinetService(client, container.config.familyCabinet);
}

import { createLogger } from './logger';
