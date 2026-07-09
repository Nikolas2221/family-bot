export type FamilyCabinetActionStatus = 'parsed' | 'unparsed';

export interface FamilyCabinetPerson {
  nickname: string;
  staticId: number;
}

export interface FamilyCabinetAction {
  externalLogId: string;
  datetime: string;
  actionRaw: string;
  actionType: string;
  member: FamilyCabinetPerson;
  initiator: FamilyCabinetPerson | null;
  quantity?: number | null;
  unit?: string | null;
  direction?: string | null;
  contract?: string | null;
  amount?: number | null;
  balanceAfter?: number | null;
  status: FamilyCabinetActionStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface FamilyCabinetSyncRun {
  startedAt: string;
  finishedAt: string;
  status: 'ok' | 'failed' | 'disabled';
  logsReceived: number;
  logsCreated: number;
  logsSkipped: number;
  errorMessage?: string;
}

export interface FamilyCabinetState {
  actions: FamilyCabinetAction[];
  syncRuns: FamilyCabinetSyncRun[];
}

export interface FamilyCabinetConfig {
  enabled: boolean;
  email: string;
  password: string;
  familyUrl: string;
  loginUrl: string;
  syncEnabled: boolean;
  syncChannelId: string;
  logChannelId: string;
  syncIntervalMs: number;
  dataFile: string;
  scraperModulePath: string;
  sessionStoragePath: string;
  logsFetchTarget: number;
  financeTabEnabled: boolean;
  financeFetchTarget: number;
}
