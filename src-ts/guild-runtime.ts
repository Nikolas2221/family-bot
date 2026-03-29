import { defaultModulesForMode } from './database';
import { createGuildScopedStorage } from './storage';
import type {
  ApplicationRecord,
  AutomodConfig,
  AutoRanksConfig,
  DatabaseApi,
  GuildScopedStorageApi,
  GuildFeatures,
  GuardConfig,
  GuildSettings,
  RoleDefinition,
  StorageApi
} from './types';

interface GuildLikeForSnapshot {
  id: string;
  name: string;
  ownerId?: string | null;
}

interface GuildRuntimeDefaults {
  channelId: string;
  applicationsChannelId: string;
  logChannelId: string;
  disciplineLogChannelId: string;
  familyTitle: string;
  accessApplications: string[];
  accessDiscipline: string[];
  accessRanks: string[];
  applicationDefaultRole: string;
  features: GuildFeatures;
  normalizeAutomodConfig(input: Record<string, unknown> | undefined): AutomodConfig;
}

export function memberSessionKey(guildId: string, memberId: string): string {
  return `${guildId}:${memberId}`;
}

export function createGuildRuntimeApi(options: {
  database: DatabaseApi;
  storage: StorageApi;
  roleTemplates: RoleDefinition[];
  defaults: GuildRuntimeDefaults;
}) {
  const { database, storage, roleTemplates, defaults } = options;

  function resolveGuildSettings(guildId: string) {
    const guild = database.getGuild(guildId);
    const settings = guild.settings || ({} as Partial<GuildSettings>);
    const mode = settings.mode || 'hybrid';
    const defaultModules = defaultModulesForMode(mode);
    const roles = roleTemplates.map(role => ({
      ...role,
      id: settings.roles?.[role.key] || role.id || ''
    }));
    const panel = settings.channels?.panel || defaults.channelId;
    const logs = settings.channels?.logs || defaults.logChannelId;

    return {
      mode,
      familyTitle: settings.familyTitle || defaults.familyTitle,
      channels: {
        panel,
        applications: settings.channels?.applications || defaults.applicationsChannelId || panel,
        welcome: settings.channels?.welcome || settings.channels?.applications || defaults.applicationsChannelId || panel,
        rules: settings.channels?.rules || '',
        logs,
        disciplineLogs: settings.channels?.disciplineLogs || defaults.disciplineLogChannelId || logs || '',
        updates: settings.channels?.updates || '',
        reports: settings.channels?.reports || logs || '',
        automod: settings.channels?.automod || logs || ''
      },
      roles,
      access: {
        applications: settings.access?.applications?.length ? settings.access.applications : defaults.accessApplications,
        discipline: settings.access?.discipline?.length ? settings.access.discipline : defaults.accessDiscipline,
        ranks: settings.access?.ranks?.length ? settings.access.ranks : defaults.accessRanks
      },
      muteRoleId: settings.roles?.mute || '',
      autoroleRoleId: settings.roles?.autorole || '',
      verificationRoleId: settings.roles?.verification || '',
      visuals: {
        familyBanner: settings.visuals?.familyBanner || '',
        applicationsBanner: settings.visuals?.applicationsBanner || ''
      },
      welcome: {
        enabled: settings.welcome?.enabled !== false,
        dmEnabled: Boolean(settings.welcome?.dmEnabled),
        message: String(settings.welcome?.message || '').trim().slice(0, 1000)
      },
      verification: {
        enabled: Boolean(settings.verification?.enabled),
        questionnaireEnabled: Boolean(settings.verification?.questionnaireEnabled),
        roleId: String(settings.verification?.roleId || settings.roles?.verification || settings.roles?.autorole || '').trim()
      },
      reactionRoles: Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [],
      roleMenus: Array.isArray(settings.roleMenus) ? settings.roleMenus : [],
      reportSchedule: {
        weekly: {
          enabled: Boolean(settings.reportSchedule?.weekly?.enabled),
          channelId: settings.reportSchedule?.weekly?.channelId || settings.channels?.reports || logs || ''
        },
        monthly: {
          enabled: Boolean(settings.reportSchedule?.monthly?.enabled),
          channelId: settings.reportSchedule?.monthly?.channelId || settings.channels?.reports || logs || ''
        }
      },
      customCommands: Array.isArray(settings.customCommands) ? settings.customCommands : [],
      automod: defaults.normalizeAutomodConfig(settings.automod as unknown as Record<string, unknown> | undefined),
      modules: {
        family: settings.modules?.family ?? defaultModules.family,
        applications: settings.modules?.applications ?? defaultModules.applications,
        moderation: settings.modules?.moderation ?? defaultModules.moderation,
        security: settings.modules?.security ?? defaultModules.security,
        analytics: settings.modules?.analytics ?? defaultModules.analytics,
        ai: settings.modules?.ai ?? defaultModules.ai,
        welcome: settings.modules?.welcome ?? defaultModules.welcome,
        automod: settings.modules?.automod ?? defaultModules.automod,
        subscriptions: settings.modules?.subscriptions ?? defaultModules.subscriptions,
        customCommands: settings.modules?.customCommands ?? defaultModules.customCommands,
        music: settings.modules?.music ?? defaultModules.music
      },
      applicationDefaultRole: settings.roles?.newbie || defaults.applicationDefaultRole
    };
  }

  function getRoleIds(guildId: string): string[] {
    return resolveGuildSettings(guildId).roles.map(role => role.id).filter(Boolean);
  }

  function getGuildStorage(guildId: string): GuildScopedStorageApi {
    return createGuildScopedStorage(guildId, storage);
  }

  function getGuildPlan(guildId: string) {
    return database.getSubscription(guildId);
  }

  function isPremiumGuild(guildId: string) {
    return database.isPremium(guildId);
  }

  function buildGuildSettingsSnapshot(guild: GuildLikeForSnapshot) {
    const settings = resolveGuildSettings(guild.id);

    return {
      guildName: guild.name,
      ownerId: guild.ownerId || '',
      settings: {
        familyTitle: settings.familyTitle,
        mode: settings.mode,
        channels: {
          panel: settings.channels.panel,
          applications: settings.channels.applications,
          welcome: settings.channels.welcome,
          rules: settings.channels.rules,
          logs: settings.channels.logs,
          disciplineLogs: settings.channels.disciplineLogs,
          updates: settings.channels.updates,
          reports: settings.channels.reports,
          automod: settings.channels.automod
        },
        roles: {
          leader: settings.roles.find(role => role.key === 'leader')?.id || '',
          deputy: settings.roles.find(role => role.key === 'deputy')?.id || '',
          elder: settings.roles.find(role => role.key === 'elder')?.id || '',
          member: settings.roles.find(role => role.key === 'member')?.id || '',
          newbie: settings.roles.find(role => role.key === 'newbie')?.id || '',
          mute: settings.muteRoleId || '',
          autorole: settings.autoroleRoleId || '',
          verification: settings.verificationRoleId || ''
        },
        access: {
          applications: settings.access.applications,
          discipline: settings.access.discipline,
          ranks: settings.access.ranks
        },
        visuals: {
          familyBanner: settings.visuals.familyBanner,
          applicationsBanner: settings.visuals.applicationsBanner
        },
        welcome: settings.welcome,
        verification: settings.verification,
        reactionRoles: settings.reactionRoles,
        roleMenus: settings.roleMenus,
        reportSchedule: settings.reportSchedule,
        customCommands: settings.customCommands,
        automod: settings.automod,
        modules: {
          ...settings.modules
        },
        features: {
          ...defaults.features
        }
      }
    };
  }

  function isModuleEnabled(guildId: string, moduleName: keyof ReturnType<typeof resolveGuildSettings>['modules'] | null) {
    if (!moduleName) return true;
    return resolveGuildSettings(guildId).modules?.[moduleName] !== false;
  }

  return {
    resolveGuildSettings,
    getRoleIds,
    getGuildStorage,
    getGuildPlan,
    isPremiumGuild,
    buildGuildSettingsSnapshot,
    isModuleEnabled
  };
}
