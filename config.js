const copy = require('./copy');

const FAMILY_ROLE_ENV_KEYS = [
  'ROLE_LEADER',
  'ROLE_DEPUTY',
  'ROLE_ELDER',
  'ROLE_MEMBER',
  'ROLE_NEWBIE'
];

const AUTO_RANK_REQUIRED_KEYS = ['ROLE_ELDER', 'ROLE_MEMBER', 'ROLE_NEWBIE'];

function trim(value) {
  return String(value || '').trim();
}

function parseCsv(value) {
  return trim(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  return trim(value).toLowerCase() === 'true';
}

function parseNumber(value, fallback, { min = null } = {}) {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? parsed : fallback;
  return min === null ? normalized : Math.max(min, normalized);
}

function isSnowflake(value) {
  return /^\d{16,20}$/.test(value);
}

function createConfig(env = process.env) {
  const channelId = trim(env.CHANNEL_ID);
  const logChannelId = trim(env.LOG_CHANNEL_ID);
  const roleNewbie = trim(env.ROLE_NEWBIE);

  return {
    raw: { ...env },
    databaseFile: trim(env.DATABASE_FILE),
    token: trim(env.TOKEN),
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
    applicationDefaultRole: trim(env.APPLICATION_DEFAULT_ROLE) || roleNewbie,
    familyTitle: trim(env.FAMILY_TITLE) || copy.defaults.familyTitle,
    accessApplications: parseCsv(env.ACCESS_APPLICATIONS),
    accessDiscipline: parseCsv(env.ACCESS_DISCIPLINE),
    accessRanks: parseCsv(env.ACCESS_RANKS),
    ownerIds: parseCsv(env.BOT_OWNER_IDS),
    aiEnabled: parseBoolean(env.AI_ENABLED),
    aiModel: 'offline',
    openAiApiKey: '',
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
    roles: FAMILY_ROLE_ENV_KEYS.map(key => ({ key, value: trim(env[key]) }))
  };
}

function validateDiscordId(fieldName, value, errors, warnings, { required = false } = {}) {
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

function validateConfig(config) {
  const errors = [];
  const warnings = [];
  const notes = [];

  if (!config.token) {
    errors.push('Не задана обязательная переменная TOKEN.');
  }

  validateDiscordId('GUILD_ID', config.guildId, errors, warnings, { required: true });
  validateDiscordId('CHANNEL_ID', config.channelId, errors, warnings, { required: true });
  validateDiscordId('APPLICATIONS_CHANNEL_ID', config.applicationsChannelId, errors, warnings);
  validateDiscordId('LOG_CHANNEL_ID', config.logChannelId, errors, warnings);
  validateDiscordId('DISCIPLINE_LOG_CHANNEL_ID', config.disciplineLogChannelId, errors, warnings);
  validateDiscordId('MESSAGE_ID', config.messageId, errors, warnings);
  validateDiscordId('APPLICATION_DEFAULT_ROLE', config.applicationDefaultRole, errors, warnings);

  for (const role of config.roles) {
    validateDiscordId(role.key, role.value, errors, warnings);
  }

  const missingRoles = config.roles.filter(role => !role.value).map(role => role.key);
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

  if (!config.aiEnabled) {
    notes.push('AI отключён через AI_ENABLED=false.');
  } else {
    notes.push('AI работает локально в оффлайн-режиме без внешнего API.');
  }

  if (config.autoRanks.enabled) {
    if (config.autoRanks.elderMinScore < config.autoRanks.memberMinScore) {
      errors.push('AUTO_RANK_ELDER_MIN_SCORE должен быть больше или равен AUTO_RANK_MEMBER_MIN_SCORE.');
    }

    const missingAutoRankRoles = config.roles
      .filter(role => AUTO_RANK_REQUIRED_KEYS.includes(role.key) && !role.value)
      .map(role => role.key);

    if (missingAutoRankRoles.length) {
      warnings.push(`Авто-ранги включены, но не заданы роли для ступеней: ${missingAutoRankRoles.join(', ')}`);
    }
  } else {
    notes.push('Авто-ранги отключены через AUTO_RANKS_ENABLED=false.');
  }

  return { errors, warnings, notes };
}

function summarizeConfig(config) {
  const configuredRoles = config.roles.filter(role => role.value).length;
  const rankManagers = config.accessRanks.length ? `${config.accessRanks.length} role(s)` : 'ManageRoles';
  const autoRanksSummary = config.autoRanks.enabled
    ? `enabled every ${Math.floor(config.autoRanks.intervalMs / 1000)}s (member ${config.autoRanks.memberMinScore}, elder ${config.autoRanks.elderMinScore})`
    : 'disabled';
  const leakGuardSummary = config.leakGuard.enabled ? 'enabled' : 'disabled';
  const channelGuardSummary = config.channelGuard.enabled ? 'enabled' : 'disabled';
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
    `- panel message id: ${config.messageId || 'auto-create'}`,
    `- AI: ${config.aiEnabled ? 'offline helper enabled' : 'disabled'}`,
    `- auto ranks: ${autoRanksSummary}`,
    `- leak guard: ${leakGuardSummary}`,
    `- channel guard: ${channelGuardSummary}`
  ];
}

function printStartupDiagnostics(config, validation) {
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

module.exports = {
  createConfig,
  printStartupDiagnostics,
  summarizeConfig,
  validateConfig
};
