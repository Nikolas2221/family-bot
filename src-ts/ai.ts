import type {
  AIService,
  ApplicationAnalysisInput,
  MemberRecommendationInput
} from './types';

const aiJs = require('../ai') as {
  createAIService(options: { enabled: boolean }): AIService;
};

export const createAIService = aiJs.createAIService;

export type { AIService, ApplicationAnalysisInput, MemberRecommendationInput };
