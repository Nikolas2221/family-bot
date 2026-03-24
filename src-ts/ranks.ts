import type { RankService } from './types';

const ranksJs = require('../ranks') as {
  createRankService(options: {
    roles: unknown[];
    storage: {
      activityScore(memberId: string): number;
    };
    autoRanks: {
      enabled: boolean;
      memberMinScore: number;
      elderMinScore: number;
    };
  }): RankService;
};

export const createRankService = ranksJs.createRankService;

export type { RankService };
