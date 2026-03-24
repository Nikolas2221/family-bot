import type {
  ApplicationFieldsInput,
  ApplicationRecord,
  BlacklistEntry,
  GuildPeriodAnalytics,
  MemberRecord,
  SanitizedApplicationInput,
  StorageApi,
  StoreState,
  WarnEntry
} from './types';

const storageJs = require('../storage') as {
  createStorage(options: { dataFile: string; saveDelayMs?: number }): StorageApi;
  defaultStore(): StoreState;
};

export const createStorage = storageJs.createStorage;
export const defaultStore = storageJs.defaultStore;

export type {
  ApplicationFieldsInput,
  ApplicationRecord,
  BlacklistEntry,
  GuildPeriodAnalytics,
  MemberRecord,
  SanitizedApplicationInput,
  StorageApi,
  StoreState,
  WarnEntry
};
