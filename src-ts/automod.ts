import type {
  AutomodConfig,
  AutomodMessageInput,
  AutomodMessageMatch,
  AutomodSpamEvaluation
} from './types';

const automodJs = require('../automod') as {
  containsInvite(text?: string): boolean;
  containsUrl(text?: string): boolean;
  defaultAutomodConfig(): AutomodConfig;
  evaluateAutomodMessage(input: AutomodMessageInput): AutomodMessageMatch | null;
  evaluateSpamActivity(
    timestamps: number[],
    now: number,
    config?: Partial<AutomodConfig>
  ): AutomodSpamEvaluation;
  matchBadWord(text: string, words: string[]): string;
  normalizeAutomodConfig(raw?: Partial<AutomodConfig>): AutomodConfig;
  normalizeBadWords(words?: unknown[]): string[];
  uppercaseRatio(text?: string): number;
};

export const containsInvite = automodJs.containsInvite;
export const containsUrl = automodJs.containsUrl;
export const defaultAutomodConfig = automodJs.defaultAutomodConfig;
export const evaluateAutomodMessage = automodJs.evaluateAutomodMessage;
export const evaluateSpamActivity = automodJs.evaluateSpamActivity;
export const matchBadWord = automodJs.matchBadWord;
export const normalizeAutomodConfig = automodJs.normalizeAutomodConfig;
export const normalizeBadWords = automodJs.normalizeBadWords;
export const uppercaseRatio = automodJs.uppercaseRatio;

export type { AutomodConfig, AutomodMessageInput, AutomodMessageMatch, AutomodSpamEvaluation };
