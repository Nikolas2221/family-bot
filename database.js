const fs = require('fs');
const path = require('path');
const { normalizeAutomodConfig } = require('./automod');

function defaultDatabase() {
  return {
    meta: {
      version: 1
    },
    guilds: {}
  };
}

function defaultModulesForMode(mode = 'hybrid') {
  const normalized = ['family', 'server', 'hybrid'].includes(mode) ? mode : 'hybrid';

  if (normalized === 'family') {
    return {
      family: true,
      applications: true,
      moderation: true,
      security: false,
      analytics: true,
      ai: true,
      welcome: true,
      automod: false,
      subscriptions: false,
      customCommands: false,
      music: false
    };
  }

  if (normalized === 'server') {
    return {
      family: false,
      applications: false,
      moderation: true,
      security: true,
      analytics: true,
      ai: false,
      welcome: true,
      automod: true,
      subscriptions: false,
      customCommands: false,
      music: false
    };
  }

  return {
    family: true,
    applications: true,
    moderation: true,
    security: true,
    analytics: true,
    ai: true,
    welcome: true,
    automod: true,
    subscriptions: false,
    customCommands: false,
    music: false
  };
}

function normalizeWelcomeConfig(welcome = {}) {
  return {
    enabled: welcome?.enabled !== false,
    dmEnabled: Boolean(welcome?.dmEnabled),
    message: String(welcome?.message || '').trim().slice(0, 1000)
  };
}

function normalizeReactionRoles(entries = []) {
  const seen = new Set();

  return (Array.isArray(entries) ? entries : [])
    .map(entry => ({
      messageId: String(entry?.messageId || '').trim(),
      channelId: String(entry?.channelId || '').trim(),
      emoji: String(entry?.emoji || '').trim(),
      roleId: String(entry?.roleId || '').trim()
    }))
    .filter(entry => entry.messageId && entry.emoji && entry.roleId)
    .filter(entry => {
      const key = `${entry.messageId}:${entry.emoji}:${entry.roleId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizeReportSchedule(schedule = {}) {
  return {
    weekly: {
      enabled: Boolean(schedule?.weekly?.enabled),
      channelId: String(schedule?.weekly?.channelId || '').trim()
    },
    monthly: {
      enabled: Boolean(schedule?.monthly?.enabled),
      channelId: String(schedule?.monthly?.channelId || '').trim()
    }
  };
}

function normalizeGuildRecord(guildId, guild = {}) {
  const mode = guild.settings?.mode || 'hybrid';
  const defaultModules = defaultModulesForMode(mode);

  return {
    guildId,
    guildName: guild.guildName || '',
    ownerId: guild.ownerId || '',
    plan: guild.plan || 'free',
    setupCompleted: Boolean(guild.setupCompleted),
    setupCompletedAt: guild.setupCompletedAt || '',
    subscriptionAssignedBy: guild.subscriptionAssignedBy || '',
    subscriptionAssignedAt: guild.subscriptionAssignedAt || '',
    maintenance: {
      lastRolelessCleanupAt: guild.maintenance?.lastRolelessCleanupAt || '',
      lastUpdateAnnouncementId: guild.maintenance?.lastUpdateAnnouncementId || '',
      lastCommandSignature: guild.maintenance?.lastCommandSignature || ''
    },
    settings: {
      mode,
      familyTitle: guild.settings?.familyTitle || '',
      channels: {
        panel: guild.settings?.channels?.panel || '',
        applications: guild.settings?.channels?.applications || '',
        welcome: guild.settings?.channels?.welcome || '',
        logs: guild.settings?.channels?.logs || '',
        disciplineLogs: guild.settings?.channels?.disciplineLogs || '',
        updates: guild.settings?.channels?.updates || '',
        reports: guild.settings?.channels?.reports || ''
      },
      roles: {
        leader: guild.settings?.roles?.leader || '',
        deputy: guild.settings?.roles?.deputy || '',
        elder: guild.settings?.roles?.elder || '',
        member: guild.settings?.roles?.member || '',
        newbie: guild.settings?.roles?.newbie || '',
        mute: guild.settings?.roles?.mute || '',
        autorole: guild.settings?.roles?.autorole || ''
      },
      access: {
        applications: [...(guild.settings?.access?.applications || [])],
        discipline: [...(guild.settings?.access?.discipline || [])],
        ranks: [...(guild.settings?.access?.ranks || [])]
      },
      visuals: {
        familyBanner: guild.settings?.visuals?.familyBanner || '',
        applicationsBanner: guild.settings?.visuals?.applicationsBanner || ''
      },
      welcome: normalizeWelcomeConfig(guild.settings?.welcome),
      reactionRoles: normalizeReactionRoles(guild.settings?.reactionRoles),
      reportSchedule: normalizeReportSchedule(guild.settings?.reportSchedule),
      automod: normalizeAutomodConfig(guild.settings?.automod),
      modules: {
        family: guild.settings?.modules?.family ?? defaultModules.family,
        applications: guild.settings?.modules?.applications ?? defaultModules.applications,
        moderation: guild.settings?.modules?.moderation ?? defaultModules.moderation,
        security: guild.settings?.modules?.security ?? defaultModules.security,
        analytics: guild.settings?.modules?.analytics ?? defaultModules.analytics,
        ai: guild.settings?.modules?.ai ?? defaultModules.ai,
        welcome: guild.settings?.modules?.welcome ?? defaultModules.welcome,
        automod: guild.settings?.modules?.automod ?? defaultModules.automod,
        subscriptions: guild.settings?.modules?.subscriptions ?? defaultModules.subscriptions,
        customCommands: guild.settings?.modules?.customCommands ?? defaultModules.customCommands,
        music: guild.settings?.modules?.music ?? defaultModules.music
      },
      features: {
        aiEnabled: Boolean(guild.settings?.features?.aiEnabled),
        autoRanksEnabled: Boolean(guild.settings?.features?.autoRanksEnabled),
        leakGuardEnabled: Boolean(guild.settings?.features?.leakGuardEnabled),
        channelGuardEnabled: Boolean(guild.settings?.features?.channelGuardEnabled)
      }
    }
  };
}

function createDatabase({ dataFile, saveDelayMs = 500 }) {
  let database = loadDatabase();
  let saveTimer = null;

  function readJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  function hasMeaningfulDatabaseData(value) {
    return Boolean(value && typeof value === 'object' && Object.keys(value.guilds || {}).length);
  }

  function loadDatabase() {
    const parsed = hasMeaningfulDatabaseData(readJsonFile(dataFile))
      ? readJsonFile(dataFile)
      : readJsonFile(`${dataFile}.bak`) || readJsonFile(dataFile);
    const normalized = defaultDatabase();

    for (const [guildId, guild] of Object.entries(parsed?.guilds || {})) {
      normalized.guilds[guildId] = normalizeGuildRecord(guildId, guild);
    }

    return normalized;
  }

  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      flush();
    }, saveDelayMs);
  }

  function flush() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const backupFile = `${dataFile}.bak`;
    const tempFile = `${dataFile}.tmp`;
    const payload = JSON.stringify(database, null, 2);

    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(tempFile, payload, 'utf8');
    fs.renameSync(tempFile, dataFile);
    fs.writeFileSync(backupFile, payload, 'utf8');
  }

  function ensureGuild(guildId, defaults = {}) {
    if (!database.guilds[guildId]) {
      database.guilds[guildId] = normalizeGuildRecord(guildId, defaults);
      save();
    }
    return database.guilds[guildId];
  }

  function getGuild(guildId) {
    return ensureGuild(guildId);
  }

  function listGuilds() {
    return Object.values(database.guilds);
  }

  function setGuildSettings(guildId, settings) {
    const guild = ensureGuild(guildId);
    guild.settings = normalizeGuildRecord(guildId, { settings }).settings;
    save();
    return guild;
  }

  function updateGuildSettings(guildId, patch) {
    const guild = ensureGuild(guildId);
    guild.settings = normalizeGuildRecord(guildId, {
      settings: {
        ...guild.settings,
        ...patch,
        channels: {
          ...(guild.settings?.channels || {}),
          ...(patch?.channels || {})
        },
        roles: {
          ...(guild.settings?.roles || {}),
          ...(patch?.roles || {})
        },
        access: {
          ...(guild.settings?.access || {}),
          ...(patch?.access || {})
        },
        visuals: {
          ...(guild.settings?.visuals || {}),
          ...(patch?.visuals || {})
        },
        welcome: {
          ...(guild.settings?.welcome || {}),
          ...(patch?.welcome || {})
        },
        reportSchedule: {
          ...(guild.settings?.reportSchedule || {}),
          ...(patch?.reportSchedule || {}),
          weekly: {
            ...(guild.settings?.reportSchedule?.weekly || {}),
            ...(patch?.reportSchedule?.weekly || {})
          },
          monthly: {
            ...(guild.settings?.reportSchedule?.monthly || {}),
            ...(patch?.reportSchedule?.monthly || {})
          }
        },
        automod: {
          ...(guild.settings?.automod || {}),
          ...(patch?.automod || {})
        },
        modules: {
          ...(guild.settings?.modules || {}),
          ...(patch?.modules || {})
        },
        features: {
          ...(guild.settings?.features || {}),
          ...(patch?.features || {})
        },
        reactionRoles: Array.isArray(patch?.reactionRoles) ? patch.reactionRoles : guild.settings?.reactionRoles
      }
    }).settings;
    save();
    return guild;
  }

  function markSetupComplete(guildId, snapshot) {
    const guild = ensureGuild(guildId, {
      guildName: snapshot.guildName,
      ownerId: snapshot.ownerId
    });

    guild.guildName = snapshot.guildName || guild.guildName;
    guild.ownerId = snapshot.ownerId || guild.ownerId;
    guild.settings = normalizeGuildRecord(guildId, { settings: snapshot.settings }).settings;
    guild.setupCompleted = true;
    guild.setupCompletedAt = new Date().toISOString();
    save();
    return guild;
  }

  function updateGuildMaintenance(guildId, patch) {
    const guild = ensureGuild(guildId);
    guild.maintenance = {
      ...(guild.maintenance || {}),
      ...(patch || {})
    };
    save();
    return guild;
  }

  function getSubscription(guildId) {
    return ensureGuild(guildId).plan;
  }

  function setSubscription(guildId, { plan, assignedBy }) {
    const guild = ensureGuild(guildId);
    guild.plan = plan;
    guild.subscriptionAssignedBy = assignedBy || '';
    guild.subscriptionAssignedAt = new Date().toISOString();
    save();
    return guild;
  }

  function isPremium(guildId) {
    return getSubscription(guildId) === 'premium';
  }

  return {
    ensureGuild,
    flush,
    getGuild,
    getSubscription,
    isPremium,
    listGuilds,
    markSetupComplete,
    save,
    setGuildSettings,
    updateGuildMaintenance,
    updateGuildSettings,
    setSubscription
  };
}

module.exports = {
  createDatabase,
  defaultDatabase,
  defaultModulesForMode
};
