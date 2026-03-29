import fs from 'node:fs';
import path from 'node:path';

import type { BotMode, DatabaseApi, DatabaseState, GuildRecord, GuildSettings, ModuleFlags } from './types';
import { normalizeAutomodConfig } from './automod';

function defaultDatabase(): DatabaseState {
  return {
    meta: {
      version: 1
    },
    guilds: {}
  };
}

function defaultModulesForMode(mode: BotMode = 'hybrid'): ModuleFlags {
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
      customCommands: true,
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
    customCommands: true,
    music: false
  };
}

function normalizeWelcomeConfig(welcome: Record<string, unknown> = {}) {
  return {
    enabled: welcome?.enabled !== false,
    dmEnabled: Boolean(welcome?.dmEnabled),
    message: String(welcome?.message || '').trim().slice(0, 1000)
  };
}

function normalizeVerificationConfig(verification: Record<string, unknown> = {}) {
  return {
    enabled: Boolean(verification?.enabled),
    questionnaireEnabled: Boolean(verification?.questionnaireEnabled),
    roleId: String(verification?.roleId || '').trim()
  };
}

function normalizeReactionRoles(entries: unknown[] = []) {
  const seen = new Set<string>();

  return (Array.isArray(entries) ? entries : [])
    .map((entry: any) => ({
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

function normalizeReportSchedule(schedule: Record<string, any> = {}) {
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

function normalizeRoleMenus(menus: unknown[] = []) {
  return (Array.isArray(menus) ? menus : [])
    .map((menu: any) => ({
      menuId: String(menu?.menuId || '').trim().slice(0, 32).toLowerCase(),
      title: String(menu?.title || '').trim().slice(0, 80),
      description: String(menu?.description || '').trim().slice(0, 400),
      category: String(menu?.category || '').trim().slice(0, 40),
      channelId: String(menu?.channelId || '').trim(),
      messageId: String(menu?.messageId || '').trim(),
      items: (Array.isArray(menu?.items) ? menu.items : [])
        .map((item: any) => ({
          roleId: String(item?.roleId || '').trim(),
          label: String(item?.label || '').trim().slice(0, 80),
          emoji: String(item?.emoji || '').trim().slice(0, 32),
          description: String(item?.description || '').trim().slice(0, 120)
        }))
        .filter((item: any) => item.roleId && item.label)
        .slice(0, 25)
    }))
    .filter((menu: any) => menu.menuId && menu.title);
}

function normalizeCustomCommands(commands: unknown[] = []) {
  return (Array.isArray(commands) ? commands : [])
    .map((command: any) => ({
      name: String(command?.name || '').trim().slice(0, 32).toLowerCase(),
      trigger: String(command?.trigger || '').trim().slice(0, 120).toLowerCase(),
      response: String(command?.response || '').trim().slice(0, 1500),
      mode: ['contains', 'startsWith', 'exact'].includes(command?.mode) ? command.mode : 'contains'
    }))
    .filter((command: any) => command.name && command.trigger && command.response);
}

type GuildRecordPatch = Omit<Partial<GuildRecord>, 'settings'> & { settings?: Partial<GuildSettings> };

function normalizeGuildRecord(guildId: string, guild: GuildRecordPatch = {}): GuildRecord {
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
        rules: guild.settings?.channels?.rules || '',
        logs: guild.settings?.channels?.logs || '',
        disciplineLogs: guild.settings?.channels?.disciplineLogs || '',
        updates: guild.settings?.channels?.updates || '',
        reports: guild.settings?.channels?.reports || '',
        automod: guild.settings?.channels?.automod || ''
      },
      roles: {
        leader: guild.settings?.roles?.leader || '',
        deputy: guild.settings?.roles?.deputy || '',
        elder: guild.settings?.roles?.elder || '',
        member: guild.settings?.roles?.member || '',
        newbie: guild.settings?.roles?.newbie || '',
        mute: guild.settings?.roles?.mute || '',
        autorole: guild.settings?.roles?.autorole || '',
        verification: guild.settings?.roles?.verification || ''
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
      welcome: normalizeWelcomeConfig(guild.settings?.welcome as unknown as Record<string, unknown>),
      verification: normalizeVerificationConfig(guild.settings?.verification as unknown as Record<string, unknown>),
      reactionRoles: normalizeReactionRoles(guild.settings?.reactionRoles as unknown[]),
      reportSchedule: normalizeReportSchedule(guild.settings?.reportSchedule as Record<string, any>),
      roleMenus: normalizeRoleMenus(guild.settings?.roleMenus as unknown[]),
      customCommands: normalizeCustomCommands(guild.settings?.customCommands as unknown[]),
      automod: normalizeAutomodConfig(guild.settings?.automod as Record<string, unknown> | undefined),
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

function createDatabase(options: { dataFile: string; saveDelayMs?: number }): DatabaseApi {
  const { dataFile, saveDelayMs = 500 } = options;

  let database: DatabaseState = loadDatabase();
  let saveTimer: NodeJS.Timeout | null = null;

  function readJsonFile(filePath: string): DatabaseState | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as DatabaseState;
    } catch {
      return null;
    }
  }

  function hasMeaningfulDatabaseData(value: DatabaseState | null): boolean {
    return Boolean(value && typeof value === 'object' && Object.keys(value.guilds || {}).length);
  }

  function loadDatabase(): DatabaseState {
    const primary = readJsonFile(dataFile);
    const backup = readJsonFile(`${dataFile}.bak`);
    const parsed = hasMeaningfulDatabaseData(primary)
      ? primary
      : backup || primary;

    const normalized = defaultDatabase();
    for (const [guildId, guild] of Object.entries(parsed?.guilds || {})) {
      normalized.guilds[guildId] = normalizeGuildRecord(guildId, guild);
    }
    return normalized;
  }

  function flush(): void {
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

  function save(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      flush();
    }, saveDelayMs);
  }

  function ensureGuild(guildId: string, defaults: Partial<GuildRecord> = {}): GuildRecord {
    if (!database.guilds[guildId]) {
      database.guilds[guildId] = normalizeGuildRecord(guildId, defaults);
      save();
    }
    return database.guilds[guildId];
  }

  function getGuild(guildId: string): GuildRecord {
    return ensureGuild(guildId);
  }

  function listGuilds(): GuildRecord[] {
    return Object.values(database.guilds);
  }

  function setGuildSettings(guildId: string, settings: Partial<GuildSettings>): GuildRecord {
    const guild = ensureGuild(guildId);
    guild.settings = normalizeGuildRecord(guildId, { settings }).settings;
    save();
    return guild;
  }

  function updateGuildSettings(guildId: string, patch: Partial<GuildSettings>): GuildRecord {
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
        verification: {
          ...(guild.settings?.verification || {}),
          ...(patch?.verification || {})
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
        reactionRoles: Array.isArray(patch?.reactionRoles) ? patch.reactionRoles : guild.settings?.reactionRoles,
        roleMenus: Array.isArray(patch?.roleMenus) ? patch.roleMenus : guild.settings?.roleMenus,
        customCommands: Array.isArray(patch?.customCommands) ? patch.customCommands : guild.settings?.customCommands
      }
    }).settings;
    save();
    return guild;
  }

  function markSetupComplete(
    guildId: string,
    snapshot: { guildName?: string; ownerId?: string; settings?: Partial<GuildSettings> }
  ): GuildRecord {
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

  function updateGuildMaintenance(guildId: string, patch: Partial<GuildRecord['maintenance']>): GuildRecord {
    const guild = ensureGuild(guildId);
    guild.maintenance = {
      ...(guild.maintenance || {}),
      ...(patch || {})
    };
    save();
    return guild;
  }

  function getSubscription(guildId: string) {
    return ensureGuild(guildId).plan;
  }

  function setSubscription(guildId: string, payload: { plan: GuildRecord['plan']; assignedBy?: string }): GuildRecord {
    const guild = ensureGuild(guildId);
    guild.plan = payload.plan;
    guild.subscriptionAssignedBy = payload.assignedBy || '';
    guild.subscriptionAssignedAt = new Date().toISOString();
    save();
    return guild;
  }

  function isPremium(guildId: string): boolean {
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

export {
  createDatabase,
  defaultDatabase,
  defaultModulesForMode,
  normalizeCustomCommands,
  normalizeGuildRecord,
  normalizeReactionRoles,
  normalizeReportSchedule,
  normalizeRoleMenus
};

export type { BotMode, DatabaseApi, DatabaseState, GuildRecord, ModuleFlags };
