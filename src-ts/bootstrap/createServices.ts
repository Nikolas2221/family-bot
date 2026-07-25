import { createDatabase } from '../database';
import { createStorage } from '../storage';
import { createAIService } from '../ai';
import { createDeepSeekService } from '../services/deepseek';
import { createLawService } from '../services/law';
import { createTelegramNotificationService } from '../telegram/notifications';
import { createTelegramBot } from '../telegram/bot';
import { createSupportTicketService } from '../services/support-tickets';
import { createReportRequestService } from '../services/report-requests';
import { createMediaShareService } from '../services/media-share';
import { createAfkLeaveService } from '../services/afk-leave';
import { createTicketService } from '../services/tickets';
import { createAnnouncementService } from '../services/announcements';
import { createServerBackupService } from '../services/server-backups';
import { createVoiceRoomsService } from '../modules/voiceRooms';
import { createMajesticApiService } from '../modules/majesticApi';
import { createFamilyCabinetService } from '../modules/familyCabinet';
import { createAccessApi } from '../access';
import { buildDiscordOnlineMembersText } from '../services/online-members';
import { ROLES } from '../roles';
import { copy } from '../copy';
import { normalizeAutomodConfig } from '../automod';
import { AppConfig } from '../config';
import type { DatabaseApi, StorageApi, RoleDefinition } from '../types';
import { EmbedBuilder } from 'discord.js';

export interface CoreServices {
  database: DatabaseApi;
  storage: StorageApi;
  aiService: ReturnType<typeof createAIService>;
  deepSeekService: ReturnType<typeof createDeepSeekService>;
  lawService: ReturnType<typeof createLawService>;
  telegramBot: ReturnType<typeof createTelegramBot>;
  telegramNotifications: ReturnType<typeof createTelegramNotificationService>;
  supportTicketService: ReturnType<typeof createSupportTicketService>;
  reportRequestService: ReturnType<typeof createReportRequestService>;
  mediaShareService: ReturnType<typeof createMediaShareService>;
  afkLeaveService: ReturnType<typeof createAfkLeaveService>;
  ticketService: ReturnType<typeof createTicketService>;
  announcementService: ReturnType<typeof createAnnouncementService>;
  serverBackupService: ReturnType<typeof createServerBackupService>;
  voiceRoomsService: ReturnType<typeof createVoiceRoomsService>;
  majesticApiService: ReturnType<typeof createMajesticApiService>;
  familyCabinetService: ReturnType<typeof createFamilyCabinetService>;
  accessApi: ReturnType<typeof createAccessApi>;
  roleTemplates: RoleDefinition[];
}

export function createCoreServices(config: AppConfig): CoreServices {
  const database = createDatabase({ dataFile: config.databaseFile || './database.json' });
  const storage = createStorage({ dataFile: config.storageFile || './storage.json' });

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

  const roleTemplates = ROLES.map(role => ({ ...role }));

  const supportTicketService = createSupportTicketService({ storage, client: null as any, config: config.supportTickets });
  const reportRequestService = createReportRequestService({
    database,
    fetchTextChannel: async () => null,
    resolveGuildSettings: () => ({} as any),
    canManageReports: () => false
  });
  const mediaShareService = createMediaShareService({
    database,
    fetchTextChannel: async () => null,
    resolveGuildSettings: () => ({} as any),
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
  const serverBackupService = createServerBackupService({ client: null as any, config: config.serverBackup });
  const voiceRoomsService = createVoiceRoomsService({ client: null as any, config: config.voiceRooms });
  const majesticApiService = createMajesticApiService(config.majesticApi);
  const familyCabinetService = createFamilyCabinetService(null as any, config.familyCabinet);
  const accessApi = createAccessApi({
    ownerIds: config.ownerIds,
    leakGuard: config.leakGuard,
    channelGuard: config.channelGuard,
    resolveGuildSettings: () => ({} as any)
  });

  return {
    database,
    storage,
    aiService,
    deepSeekService,
    lawService,
    telegramBot,
    telegramNotifications,
    supportTicketService,
    reportRequestService,
    mediaShareService,
    afkLeaveService,
    ticketService,
    announcementService,
    serverBackupService,
    voiceRoomsService,
    majesticApiService,
    familyCabinetService,
    accessApi,
    roleTemplates
  };
}
