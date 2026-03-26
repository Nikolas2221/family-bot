import { defaultModulesForMode } from './database';
import type {
  ApplicationRecord,
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
  normalizeAutomodConfig(input: Record<string, unknown> | undefined): Record<string, unknown>;
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
      automod: defaults.normalizeAutomodConfig(settings.automod as Record<string, unknown> | undefined),
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
    return {
      ensureMember(memberId: string) {
        return storage.ensureGuildMember(guildId, memberId);
      },
      activityScore(memberId: string) {
        return storage.guildActivityScore(guildId, memberId);
      },
      pointsScore(memberId: string) {
        return storage.guildPointsScore(guildId, memberId);
      },
      voiceMinutes(memberId: string) {
        return storage.guildVoiceMinutes(guildId, memberId);
      },
      addVoiceMinutes(memberId: string, minutes: number) {
        return storage.addGuildVoiceMinutes(guildId, memberId, minutes);
      },
      addVoiceMinutesInChannel(memberId: string, minutes: number, channelId: string) {
        return storage.addGuildVoiceMinutes(guildId, memberId, minutes, channelId);
      },
      trackMessage(memberId: string) {
        return storage.trackGuildMessage(guildId, memberId);
      },
      trackMessageInChannel(memberId: string, channelId: string) {
        return storage.trackGuildMessage(guildId, memberId, channelId);
      },
      trackAnalyticsMessage(memberId: string, channelId: string) {
        return storage.trackGuildAnalyticsMessage(guildId, memberId, channelId);
      },
      trackPresence(memberId: string) {
        return storage.trackGuildPresence(guildId, memberId);
      },
      addReaction(memberId: string) {
        return storage.addGuildReaction(guildId, memberId);
      },
      addWarn({ userId, moderatorId, reason }: { userId: string; moderatorId: string; reason: string }) {
        return storage.addGuildWarn({ guildId, userId, moderatorId, reason });
      },
      listWarns(userId: string, limit = 10) {
        return storage.listGuildWarnsForUser(guildId, userId, limit);
      },
      clearWarns(userId: string) {
        return storage.clearGuildWarnsForUser(guildId, userId);
      },
      addCommend({ userId, moderatorId, reason }: { userId: string; moderatorId: string; reason: string }) {
        return storage.addGuildCommend({ guildId, userId, moderatorId, reason });
      },
      getCooldown(userId: string) {
        return storage.getGuildCooldown(guildId, userId);
      },
      setCooldown(userId: string, value?: number) {
        return storage.setGuildCooldown(guildId, userId, value);
      },
      createApplication(payload: {
        userId: string;
        nickname: string;
        level: string;
        inviter: string;
        discovery: string;
        about: string;
        age: string;
        text: string;
      }) {
        return storage.createGuildApplication({ guildId, ...payload });
      },
      findApplication(applicationId: string) {
        return storage.findGuildApplication(guildId, applicationId);
      },
      setApplicationTicketInfo(application: ApplicationRecord | null, ticketInfo: Partial<Pick<ApplicationRecord, 'ticketThreadId' | 'ticketMessageId' | 'ticketStarterMessageId'>>) {
        return storage.setApplicationTicketInfo(application, ticketInfo);
      },
      listRecentApplications(limit?: number) {
        return storage.listGuildRecentApplications(guildId, limit);
      },
      listBlacklist() {
        return storage.listGuildBlacklist(guildId);
      },
      getBlacklistEntry(userId: string) {
        return storage.getGuildBlacklistEntry(guildId, userId);
      },
      isBlacklisted(userId: string) {
        return storage.isGuildBlacklisted(guildId, userId);
      },
      addBlacklistEntry({ userId, moderatorId, reason }: { userId: string; moderatorId: string; reason: string }) {
        return storage.addGuildBlacklistEntry({ guildId, userId, moderatorId, reason });
      },
      removeBlacklistEntry(userId: string) {
        return storage.removeGuildBlacklistEntry(guildId, userId);
      },
      markAfkWarningSent(memberId: string, value?: string) {
        return storage.markGuildAfkWarningSent(guildId, memberId, value);
      },
      clearAfkWarningSent(memberId: string) {
        return storage.clearGuildAfkWarningSent(guildId, memberId);
      },
      trackJoin() {
        return storage.trackGuildJoin(guildId);
      },
      trackLeave() {
        return storage.trackGuildLeave(guildId);
      },
      getPeriodAnalytics(days?: number, now?: Date) {
        return storage.getGuildPeriodAnalytics(guildId, days, now);
      },
      getReportMarker(markerKey: string) {
        return storage.getGuildReportMarker(guildId, markerKey);
      },
      setReportMarker(markerKey: string, value: string) {
        return storage.setGuildReportMarker(guildId, markerKey, value);
      },
      sanitizeApplicationInput: storage.sanitizeApplicationInput,
      setApplicationStatus: storage.setApplicationStatus
    };
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
