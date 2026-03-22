const fs = require('fs');

function defaultDatabase() {
  return {
    meta: {
      version: 1
    },
    guilds: {}
  };
}

function normalizeGuildRecord(guildId, guild = {}) {
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
      lastRolelessCleanupAt: guild.maintenance?.lastRolelessCleanupAt || ''
    },
    settings: {
      familyTitle: guild.settings?.familyTitle || '',
      channels: {
        panel: guild.settings?.channels?.panel || '',
        applications: guild.settings?.channels?.applications || '',
        logs: guild.settings?.channels?.logs || '',
        disciplineLogs: guild.settings?.channels?.disciplineLogs || ''
      },
      roles: {
        leader: guild.settings?.roles?.leader || '',
        deputy: guild.settings?.roles?.deputy || '',
        elder: guild.settings?.roles?.elder || '',
        member: guild.settings?.roles?.member || '',
        newbie: guild.settings?.roles?.newbie || ''
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

  function loadDatabase() {
    try {
      if (!fs.existsSync(dataFile)) return defaultDatabase();
      const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      const normalized = defaultDatabase();

      for (const [guildId, guild] of Object.entries(parsed.guilds || {})) {
        normalized.guilds[guildId] = normalizeGuildRecord(guildId, guild);
      }

      return normalized;
    } catch {
      return defaultDatabase();
    }
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
    fs.writeFileSync(dataFile, JSON.stringify(database, null, 2), 'utf8');
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
        features: {
          ...(guild.settings?.features || {}),
          ...(patch?.features || {})
        }
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
  defaultDatabase
};
