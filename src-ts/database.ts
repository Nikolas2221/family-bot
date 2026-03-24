import type { BotMode, DatabaseApi, DatabaseState, GuildRecord, ModuleFlags } from './types';

const databaseJs = require('../database') as {
  createDatabase(options: { dataFile: string; saveDelayMs?: number }): DatabaseApi;
  defaultDatabase(): DatabaseState;
  defaultModulesForMode(mode?: BotMode): ModuleFlags;
};

export const createDatabase = databaseJs.createDatabase;
export const defaultDatabase = databaseJs.defaultDatabase;
export const defaultModulesForMode = databaseJs.defaultModulesForMode;

export type { DatabaseApi, DatabaseState, GuildRecord, ModuleFlags };
