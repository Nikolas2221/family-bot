import { createGuildRuntimeApi, GuildRuntimeDefaults } from '../guild-runtime';
import type { DatabaseApi, StorageApi, RoleDefinition } from '../types';
import { AppConfig } from '../config';
import { normalizeAutomodConfig } from '../automod';

export function createGuildRuntime(
  config: AppConfig,
  database: DatabaseApi,
  storage: StorageApi,
  roleTemplates: RoleDefinition[]
) {
  const defaults: GuildRuntimeDefaults = {
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
  };

  return createGuildRuntimeApi({ database, storage, roleTemplates, defaults });
}
