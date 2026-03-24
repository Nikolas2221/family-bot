import type { ApplicationsService, EmbedsApi } from './types';

const applicationsJs = require('../applications') as {
  createApplicationsService(options: {
    storage: unknown;
    fetchTextChannel: (...args: unknown[]) => Promise<unknown>;
    applicationsChannelId: string;
    applicationDefaultRole: string;
    logChannelId: string;
    applicationsBanner: string;
    familyRoles?: unknown[];
    applicationAccessRoleIds?: string[];
    client: unknown;
    embeds: EmbedsApi;
    sendAcceptLog: (...args: unknown[]) => Promise<unknown>;
    sendAcceptanceDm?: (...args: unknown[]) => Promise<unknown>;
  }): ApplicationsService;
};

export const createApplicationsService = applicationsJs.createApplicationsService;

export type { ApplicationsService };
