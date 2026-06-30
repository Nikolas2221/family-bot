import type { AppConfig, ReleaseNoteGroups, RoleEnvEntry, ValidationResult } from './types';
import copy from './copy';

const FAMILY_ROLE_ENV_KEYS = [
  'ROLE_RANK_15',
  'ROLE_RANK_14',
  'ROLE_RANK_13',
  'ROLE_RANK_12',
  'ROLE_RANK_11',
  'ROLE_RANK_10',
  'ROLE_RANK_9',
  'ROLE_RANK_8',
  'ROLE_RANK_7',
  'ROLE_RANK_6',
  'ROLE_LEADER',
  'ROLE_DEPUTY',
  'ROLE_ELDER',
  'ROLE_MEMBER',
  'ROLE_NEWBIE'
] as const;

const AUTO_RANK_REQUIRED_KEYS = ['ROLE_ELDER', 'ROLE_MEMBER', 'ROLE_NEWBIE'] as const;
const CORE_FAMILY_ROLE_ENV_KEYS = ['ROLE_LEADER', 'ROLE_DEPUTY', 'ROLE_ELDER', 'ROLE_MEMBER', 'ROLE_NEWBIE'] as const;

type EnvLike = Record<string, string | undefined>;

function trim(value?: string | null): string {
  return String(value || '').trim();
}

function parseCsv(value?: string | null): string[] {
  return trim(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseBoolean(value?: string | null): boolean {
  return trim(value).toLowerCase() === 'true';
}

function parseNumber(value: string | undefined, fallback: number, { min = null }: { min?: number | null } = {}): number {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  return min === null ? normalized : Math.max(min, normalized);
}

function isSnowflake(value: string): boolean {
  return /^\d{16,20}$/.test(value);
}

export function createConfig(env: EnvLike = process.env): AppConfig {
  const channelId = trim(env.CHANNEL_ID);
  const logChannelId = trim(env.LOG_CHANNEL_ID);
  const roleNewbie = trim(env.ROLE_NEWBIE);

  return {
    raw: { ...env },
    databaseFile: trim(env.DATABASE_FILE),
    storageFile: trim(env.STORAGE_FILE),
    token: trim(env.TOKEN),
    telegramBotToken: trim(env.TELEGRAM_BOT_TOKEN),
    telegramAdminChatId: trim(env.TELEGRAM_ADMIN_CHAT_ID),
    telegramAnnouncementsChatId: trim(env.TELEGRAM_ANNOUNCEMENTS_CHAT_ID) || trim(env.TELEGRAM_ADMIN_CHAT_ID),
    discordAnnouncementsChannelId: trim(env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID),
    discordAnnouncerRoleIds: parseCsv(env.DISCORD_ANNOUNCER_ROLE_IDS),
    discordOnlineGuildId: trim(env.DISCORD_ONLINE_GUILD_ID) || trim(env.GUILD_ID),
    guildId: trim(env.GUILD_ID),
    channelId,
    hasApplicationsChannelId: Boolean(trim(env.APPLICATIONS_CHANNEL_ID)),
    applicationsChannelId: trim(env.APPLICATIONS_CHANNEL_ID) || channelId,
    logChannelId,
    hasDisciplineLogChannelId: Boolean(trim(env.DISCIPLINE_LOG_CHANNEL_ID)),
    disciplineLogChannelId: trim(env.DISCIPLINE_LOG_CHANNEL_ID) || logChannelId || '',
    messageId: trim(env.MESSAGE_ID),
    updateIntervalMs: parseNumber(env.UPDATE_INTERVAL_MS, 60000, { min: 60000 }),
    applicationCooldownMs: parseNumber(env.APPLICATION_COOLDOWN_MS, 300000, { min: 10000 }),
    applicationTicketDeleteDelaySeconds: parseNumber(env.APPLICATION_TICKET_DELETE_DELAY_SECONDS, 5, { min: 1 }),
    applicationDefaultRole: trim(env.APPLICATION_DEFAULT_ROLE) || roleNewbie,
    familyTitle: trim(env.FAMILY_TITLE) || copy.defaults.familyTitle,
    accessApplications: parseCsv(env.ACCESS_APPLICATIONS),
    accessDiscipline: parseCsv(env.ACCESS_DISCIPLINE),
    accessRanks: parseCsv(env.ACCESS_RANKS),
    ownerIds: parseCsv(env.BOT_OWNER_IDS),
    aiEnabled: parseBoolean(env.AI_ENABLED),
    aiModel: trim(env.DEEPSEEK_API_KEY) ? (trim(env.DEEPSEEK_MODEL) || 'deepseek-chat') : 'offline',
    openAiApiKey: '',
    deepSeekApiKey: trim(env.DEEPSEEK_API_KEY),
    deepSeekBaseUrl: trim(env.DEEPSEEK_BASE_URL) || 'https://api.deepseek.com',
    deepSeekModel: trim(env.DEEPSEEK_MODEL) || 'deepseek-chat',
    supportTickets: {
      categoryId: trim(env.TICKET_CATEGORY_ID),
      supportRoleId: trim(env.TICKET_SUPPORT_ROLE_ID),
      logChannelId: trim(env.TICKET_LOG_CHANNEL_ID),
      panelChannelId: trim(env.TICKET_PANEL_CHANNEL_ID),
      pingSupport: parseBoolean(env.TICKET_PING_SUPPORT || 'true'),
      cooldownSeconds: parseNumber(env.TICKET_COOLDOWN_SECONDS, 60, { min: 5 }),
      maxOpenPerUser: parseNumber(env.TICKET_MAX_OPEN_PER_USER, 1, { min: 1 }),
      deleteDelaySeconds: parseNumber(env.TICKET_DELETE_DELAY_SECONDS, 5, { min: 1 })
    },
    afkLeave: {
      channelId: trim(env.AFK_CHANNEL_ID),
      logChannelId: trim(env.AFK_LOG_CHANNEL_ID),
      managerRoleId: trim(env.AFK_MANAGER_ROLE_ID),
      approvedRoleId: trim(env.AFK_APPROVED_ROLE_ID),
      useModal: parseBoolean(env.AFK_USE_MODAL || 'true'),
      useMessageForm: parseBoolean(env.AFK_USE_MESSAGE_FORM || 'true'),
      allowDmNotify: parseBoolean(env.AFK_ALLOW_DM_NOTIFY || 'true'),
      pinPanel: parseBoolean(env.AFK_PIN_PANEL || 'true'),
      preventDuplicatePanel: parseBoolean(env.AFK_PREVENT_DUPLICATE_PANEL || 'true')
    },
    serverBackup: {
      enabled: parseBoolean(env.SERVER_BACKUP_ENABLED),
      intervalHours: parseNumber(env.SERVER_BACKUP_INTERVAL_HOURS, 48, { min: 1 }),
      githubToken: trim(env.GITHUB_BACKUP_TOKEN),
      githubOwner: trim(env.GITHUB_BACKUP_OWNER),
      githubRepo: trim(env.GITHUB_BACKUP_REPO),
      githubBranch: trim(env.GITHUB_BACKUP_BRANCH) || 'main',
      githubBasePath: trim(env.GITHUB_BACKUP_BASE_PATH) || 'backups/server'
    },
    autoRanks: {
      enabled: parseBoolean(env.AUTO_RANKS_ENABLED),
      intervalMs: parseNumber(env.AUTO_RANKS_INTERVAL_MS, 300000, { min: 60000 }),
      memberMinScore: parseNumber(env.AUTO_RANK_MEMBER_MIN_SCORE, 50, { min: 0 }),
      elderMinScore: parseNumber(env.AUTO_RANK_ELDER_MIN_SCORE, 150, { min: 0 })
    },
    leakGuard: {
      enabled: parseBoolean(trim(env.LEAK_GUARD_ENABLED || 'true')),
      allowedRoles: parseCsv(env.LEAK_GUARD_ALLOWED_ROLES)
    },
    channelGuard: {
      enabled: parseBoolean(trim(env.CHANNEL_GUARD_ENABLED || 'true')),
      allowedRoles: parseCsv(env.CHANNEL_GUARD_ALLOWED_ROLES)
    },
    roles: FAMILY_ROLE_ENV_KEYS.map((key): RoleEnvEntry => ({ key, value: trim(env[key]) }))
  };
}

function validateDiscordId(
  fieldName: string,
  value: string,
  errors: string[],
  warnings: string[],
  { required = false }: { required?: boolean } = {}
): void {
  if (!value) {
    if (required) {
      errors.push(`Не задана обязательная переменная ${fieldName}.`);
    }
    return;
  }

  if (!isSnowflake(value)) {
    warnings.push(`Переменная ${fieldName} не похожа на Discord ID: ${value}`);
  }
}

export function validateConfig(config: AppConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  if (!config.token) {
    errors.push('Не задана обязательная переменная TOKEN.');
  }

  if (Boolean(config.telegramBotToken) !== Boolean(config.telegramAdminChatId)) {
    warnings.push('Telegram-уведомления отключены: TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID должны быть заданы вместе.');
  }

  validateDiscordId('GUILD_ID', config.guildId, errors, warnings, { required: true });
  validateDiscordId('DISCORD_ONLINE_GUILD_ID', config.discordOnlineGuildId, errors, warnings);
  validateDiscordId('CHANNEL_ID', config.channelId, errors, warnings, { required: true });
  validateDiscordId('APPLICATIONS_CHANNEL_ID', config.applicationsChannelId, errors, warnings);
  validateDiscordId('LOG_CHANNEL_ID', config.logChannelId, errors, warnings);
  validateDiscordId('DISCIPLINE_LOG_CHANNEL_ID', config.disciplineLogChannelId, errors, warnings);
  validateDiscordId('MESSAGE_ID', config.messageId, errors, warnings);
  validateDiscordId('APPLICATION_DEFAULT_ROLE', config.applicationDefaultRole, errors, warnings);
  validateDiscordId('DISCORD_ANNOUNCEMENTS_CHANNEL_ID', config.discordAnnouncementsChannelId, errors, warnings);
  validateDiscordId('TICKET_CATEGORY_ID', config.supportTickets.categoryId, errors, warnings);
  validateDiscordId('TICKET_SUPPORT_ROLE_ID', config.supportTickets.supportRoleId, errors, warnings);
  validateDiscordId('TICKET_LOG_CHANNEL_ID', config.supportTickets.logChannelId, errors, warnings);
  validateDiscordId('TICKET_PANEL_CHANNEL_ID', config.supportTickets.panelChannelId, errors, warnings);
  validateDiscordId('AFK_CHANNEL_ID', config.afkLeave.channelId, errors, warnings);
  validateDiscordId('AFK_LOG_CHANNEL_ID', config.afkLeave.logChannelId, errors, warnings);
  validateDiscordId('AFK_MANAGER_ROLE_ID', config.afkLeave.managerRoleId, errors, warnings);
  validateDiscordId('AFK_APPROVED_ROLE_ID', config.afkLeave.approvedRoleId, errors, warnings);

  for (const role of config.roles) {
    validateDiscordId(role.key, role.value, errors, warnings);
  }

  const missingRoles = config.roles
    .filter(role => CORE_FAMILY_ROLE_ENV_KEYS.includes(role.key as (typeof CORE_FAMILY_ROLE_ENV_KEYS)[number]) && !role.value)
    .map(role => role.key);
  if (missingRoles.length) {
    warnings.push(`Не заданы некоторые роли семьи: ${missingRoles.join(', ')}`);
  }

  if (!config.applicationDefaultRole) {
    warnings.push('APPLICATION_DEFAULT_ROLE не задан. При принятии бот не будет автоматически выдавать роль.');
  }

  if (!config.logChannelId) {
    warnings.push('LOG_CHANNEL_ID не задан. Логи приёма и отказа будут отключены.');
  }

  if (!config.disciplineLogChannelId) {
    warnings.push('DISCIPLINE_LOG_CHANNEL_ID не задан. Дисциплинарные логи будут отключены.');
  } else if (!config.hasDisciplineLogChannelId && config.logChannelId) {
    notes.push('DISCIPLINE_LOG_CHANNEL_ID не задан, используется LOG_CHANNEL_ID.');
  }

  if (!config.hasApplicationsChannelId && config.channelId) {
    notes.push('APPLICATIONS_CHANNEL_ID не задан, используется CHANNEL_ID.');
  }

  if (!config.messageId) {
    notes.push('MESSAGE_ID не задан. Бот создаст панель и сохранит её ID в storage.json.');
  }

  if (!config.storageFile) {
    notes.push('STORAGE_FILE не задан. Активность и очки сохраняются в локальный storage.json бота.');
  }

  if (!config.accessApplications.length) {
    warnings.push('ACCESS_APPLICATIONS не задан. Доступ к заявкам будет определяться по ManageRoles.');
  }

  if (!config.accessDiscipline.length) {
    warnings.push('ACCESS_DISCIPLINE не задан. Доступ к дисциплине будет определяться по ManageRoles.');
  }

  if (!config.accessRanks.length) {
    warnings.push('ACCESS_RANKS не задан. Доступ к повышению и понижению будет определяться по ManageRoles.');
  }

  if (!config.ownerIds.length) {
    warnings.push('BOT_OWNER_IDS не задан. Owner-команды для подписок будут недоступны.');
  }

  if (config.serverBackup.enabled) {
    const missingBackupFields = [
      ['GITHUB_BACKUP_TOKEN', config.serverBackup.githubToken],
      ['GITHUB_BACKUP_OWNER', config.serverBackup.githubOwner],
      ['GITHUB_BACKUP_REPO', config.serverBackup.githubRepo]
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missingBackupFields.length) {
      warnings.push(`SERVER_BACKUP_ENABLED=true, но не заданы GitHub backup переменные: ${missingBackupFields.join(', ')}`);
    }
  }

  if (!config.aiEnabled) {
    notes.push('AI отключён через AI_ENABLED=false.');
  } else if (config.deepSeekApiKey) {
    notes.push(`AI использует DeepSeek (${config.deepSeekModel}).`);
  } else {
    notes.push('AI работает локально в оффлайн-режиме без внешнего API.');
  }

  if (config.autoRanks.enabled) {
    if (config.autoRanks.elderMinScore < config.autoRanks.memberMinScore) {
      errors.push('AUTO_RANK_ELDER_MIN_SCORE должен быть больше или равен AUTO_RANK_MEMBER_MIN_SCORE.');
    }

    const missingAutoRankRoles = config.roles
      .filter(role => AUTO_RANK_REQUIRED_KEYS.includes(role.key as (typeof AUTO_RANK_REQUIRED_KEYS)[number]) && !role.value)
      .map(role => role.key);

    if (missingAutoRankRoles.length) {
      warnings.push(`Авто-ранги включены, но не заданы роли для ступеней: ${missingAutoRankRoles.join(', ')}`);
    }
  } else {
    notes.push('Авто-ранги отключены через AUTO_RANKS_ENABLED=false.');
  }

  return { errors, warnings, notes };
}

export function summarizeConfig(config: AppConfig): string[] {
  const configuredRoles = config.roles.filter(role => role.value).length;
  const rankManagers = config.accessRanks.length ? `${config.accessRanks.length} role(s)` : 'ManageRoles';
  const autoRanksSummary = config.autoRanks.enabled
    ? `enabled every ${Math.floor(config.autoRanks.intervalMs / 1000)}s (member ${config.autoRanks.memberMinScore}, elder ${config.autoRanks.elderMinScore})`
    : 'disabled';
  const leakGuardSummary = config.leakGuard.enabled ? 'enabled' : 'disabled';
  const channelGuardSummary = config.channelGuard.enabled ? 'enabled' : 'disabled';
  const serverBackupSummary = config.serverBackup.enabled
    ? `enabled every ${config.serverBackup.intervalHours}h -> ${config.serverBackup.githubOwner || '?'}/${config.serverBackup.githubRepo || '?'}`
    : 'disabled';
  const ownersSummary = config.ownerIds.length ? `${config.ownerIds.length} owner(s)` : 'not configured';

  return [
    'Config summary:',
    `- guild: ${config.guildId || 'missing'}`,
    `- panel channel: ${config.channelId || 'missing'}`,
    `- applications channel: ${config.applicationsChannelId || 'missing'}`,
    `- logs channel: ${config.logChannelId || 'disabled'}`,
    `- discipline logs: ${config.disciplineLogChannelId || 'disabled'}`,
    `- family title: ${config.familyTitle}`,
    `- family roles configured: ${configuredRoles}/${config.roles.length}`,
    `- rank managers: ${rankManagers}`,
    `- bot owners: ${ownersSummary}`,
    `- Telegram notifications: ${config.telegramBotToken && config.telegramAdminChatId ? 'enabled' : 'disabled'}`,
    `- announcements bridge: ${config.telegramAnnouncementsChatId && config.discordAnnouncementsChannelId ? 'enabled' : 'disabled'}`,
    `- support tickets: ${config.supportTickets.categoryId && config.supportTickets.supportRoleId ? 'configured' : 'not configured'}`,
    `- AFK leave: ${config.afkLeave.channelId ? 'configured' : 'not configured'}`,
    `- panel message id: ${config.messageId || 'auto-create'}`,
    `- storage file: ${config.storageFile || 'local ./storage.json'}`,
    `- database file: ${config.databaseFile || 'local ./database.json'}`,
    `- AI: ${config.aiEnabled ? (config.deepSeekApiKey ? `DeepSeek enabled (${config.deepSeekModel})` : 'offline helper enabled') : 'disabled'}`,
    `- auto ranks: ${autoRanksSummary}`,
    `- leak guard: ${leakGuardSummary}`,
    `- channel guard: ${channelGuardSummary}`,
    `- server backup: ${serverBackupSummary}`
  ];
}

export function printStartupDiagnostics(config: AppConfig, validation: ValidationResult): void {
  for (const line of summarizeConfig(config)) {
    console.log(line);
  }

  for (const note of validation.notes) {
    console.log(`NOTE: ${note}`);
  }

  for (const warning of validation.warnings) {
    console.warn(`WARN: ${warning}`);
  }

  for (const error of validation.errors) {
    console.error(`ERROR: ${error}`);
  }
}
