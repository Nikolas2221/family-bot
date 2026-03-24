import type {
  ChannelCreateOptionsShape,
  SecurityMemberLike
} from './types';

const securityJs = require('../security') as {
  buildChannelCreateOptions(channel: unknown, reason: string): ChannelCreateOptionsShape;
  containsDiscordInvite(text?: string): boolean;
  explainKickFailure(member: SecurityMemberLike, actorMember?: SecurityMemberLike | null): string;
  fetchDeletedChannelExecutor(guild: unknown, channelId: string): Promise<unknown | null>;
  restoreDeletedChannel(channel: unknown, reason: string): Promise<unknown | null>;
};

export const buildChannelCreateOptions = securityJs.buildChannelCreateOptions;
export const containsDiscordInvite = securityJs.containsDiscordInvite;
export const explainKickFailure = securityJs.explainKickFailure;
export const fetchDeletedChannelExecutor = securityJs.fetchDeletedChannelExecutor;
export const restoreDeletedChannel = securityJs.restoreDeletedChannel;

export type { ChannelCreateOptionsShape, SecurityMemberLike };
