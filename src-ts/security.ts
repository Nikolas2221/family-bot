import { AuditLogEvent, ChannelType, OverwriteType, PermissionFlagsBits } from 'discord.js';

import type {
  ChannelCreateOptionsShape,
  SecurityMemberLike
} from './types';

const DISCORD_INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?d[iі1][sѕ][cс][oо0]rd(?:app)?\.(?:gg|com\/invite)\/[a-z0-9-]+/i;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/gu;
const STEAM_SCAM_DOMAIN_PATTERN = /\b(?:steam|st[e3]am|stearn|stean|stre?am|staem)[a-z0-9-]{0,24}(?:community|communit+y|comrnunity|comnmunity|cornmunity|powered|store|gift|nitro)?\.(?:com|ru|net|org|top|xyz|shop|click|site|icu|me|cc|gift|lol|live|quest)\b/iu;
const SHORTENER_PATTERN = /\b(?:dub\.sh|bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd|soo\.gd|rebrand\.ly|shorturl\.at|rb\.gy|clck\.ru|goo\.su|s\.id|lnkd\.in|ow\.ly|buff\.ly|grabify\.link|iplogger\.(?:org|com)|2no\.co)\b/iu;
const SCAM_PATH_PATTERN = /\/(?:gift|gifts|activation|activate|claim|promo|airdrop|free|nitro|giveaway|reward|bonus|skin|case|drop|login|verify|verification|auth|trade|steam|wallet)(?:[/?#]|$)/iu;
const SCAM_TEXT_PATTERN = /\b(?:free|claim|gift|gifts?|activation|activate|airdrop|giveaway|nitro|steam|wallet|skins?|bonus|promo|reward|20\s*\$|50\s*\$|100\s*\$)\b/iu;
const URL_PATTERN = /\b(?:https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})(?:\S*)/iu;

export function normalizeInviteText(text = ''): string {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '')
    .replace(/\b(?:dot|точка)\b/giu, '.')
    .replace(/[。｡]/gu, '.')
    .replace(/\\/gu, '/')
    .replace(/[\s\[\](){}<>]+/gu, '')
    .toLowerCase();
}

export function containsDiscordInvite(text = ''): boolean {
  return DISCORD_INVITE_PATTERN.test(normalizeInviteText(text));
}

export function normalizeScamText(text = ''): string {
  return String(text || '')
    .normalize('NFKC')
    .replace(ZERO_WIDTH_PATTERN, '')
    .replace(/[аА]/gu, 'a')
    .replace(/[еЕёЁ]/gu, 'e')
    .replace(/[оО]/gu, 'o')
    .replace(/[рР]/gu, 'p')
    .replace(/[сС]/gu, 'c')
    .replace(/[уУ]/gu, 'y')
    .replace(/[хХ]/gu, 'x')
    .replace(/[іІ]/gu, 'i')
    .replace(/[ѕЅ]/gu, 's')
    .replace(/\b(?:dot|точка)\b/giu, '.')
    .replace(/[。｡]/gu, '.')
    .replace(/\\/gu, '/')
    .toLowerCase();
}

export function detectScamGift(text = ''): { matched: boolean; reason: string } {
  const normalized = normalizeScamText(text);
  const compact = normalized.replace(/[\s\[\](){}<>]+/gu, '');
  const hasUrl = URL_PATTERN.test(normalized) || URL_PATTERN.test(compact);
  const hasSteamScamDomain = STEAM_SCAM_DOMAIN_PATTERN.test(compact);
  const hasShortener = SHORTENER_PATTERN.test(compact);
  const hasScamPath = SCAM_PATH_PATTERN.test(compact);
  const hasScamText = SCAM_TEXT_PATTERN.test(normalized) || SCAM_TEXT_PATTERN.test(compact);

  if (hasSteamScamDomain && (hasScamPath || hasScamText || hasUrl)) {
    return { matched: true, reason: 'steam-gift/phishing domain' };
  }

  if (hasShortener && hasScamText) {
    return { matched: true, reason: 'shortener with gift/phishing text' };
  }

  if (hasUrl && hasScamPath && hasScamText) {
    return { matched: true, reason: 'gift/claim phishing link' };
  }

  if (/\bsteamcommunity\.com\/gift\/activation\b/iu.test(compact)) {
    return { matched: true, reason: 'steam gift activation link' };
  }

  return { matched: false, reason: '' };
}

export function explainKickFailure(member: SecurityMemberLike, actorMember?: SecurityMemberLike | null): string {
  if (!member?.guild) {
    return 'не удалось определить сервер участника';
  }

  if (member.id === member.guild.ownerId) {
    return 'нельзя кикнуть владельца сервера';
  }

  if (!actorMember) {
    return 'бот не найден среди участников сервера';
  }

  if (!actorMember.permissions?.has?.(PermissionFlagsBits.KickMembers)) {
    return 'у бота нет права Kick Members';
  }

  if (member.kickable === false) {
    const botRolePosition = actorMember.roles?.highest?.position ?? -1;
    const targetRolePosition = member.roles?.highest?.position ?? -1;
    if (botRolePosition <= targetRolePosition) {
      return 'роль бота стоит ниже или на уровне роли участника';
    }

    return 'Discord не разрешает кикнуть этого участника';
  }

  return '';
}

function serializePermissionOverwrites(channel: any): ChannelCreateOptionsShape['permissionOverwrites'] {
  if (!channel.permissionOverwrites?.cache) {
    return [];
  }

  return channel.permissionOverwrites.cache.map((overwrite: any) => ({
    id: overwrite.id,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
    type: overwrite.type === OverwriteType.Member ? OverwriteType.Member : OverwriteType.Role
  }));
}

export function buildChannelCreateOptions(channel: any, reason: string): ChannelCreateOptionsShape {
  const options: ChannelCreateOptionsShape = {
    name: channel.name,
    type: channel.type,
    position: channel.rawPosition,
    parent: channel.parentId || undefined,
    permissionOverwrites: serializePermissionOverwrites(channel),
    reason
  };

  if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
    options.topic = channel.topic || undefined;
    options.nsfw = Boolean(channel.nsfw);
    options.rateLimitPerUser = channel.rateLimitPerUser || 0;
  }

  if (channel.type === ChannelType.GuildVoice) {
    options.bitrate = channel.bitrate;
    options.userLimit = channel.userLimit;
  }

  return options;
}

export async function restoreDeletedChannel(channel: any, reason: string): Promise<any | null> {
  if (!channel?.guild) return null;

  const supportedTypes = new Set([
    ChannelType.GuildCategory,
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice
  ]);

  if (!supportedTypes.has(channel.type)) {
    return null;
  }

  const recreated = await channel.guild.channels.create(buildChannelCreateOptions(channel, reason));

  if (typeof channel.rawPosition === 'number') {
    await recreated.setPosition(channel.rawPosition).catch(() => {});
  }

  return recreated;
}

export async function fetchDeletedChannelExecutor(guild: any, channelId: string): Promise<any | null> {
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 5 }).catch(() => null);
  if (!logs) return null;

  const now = Date.now();
  for (const entry of logs.entries.values()) {
    if (entry.target?.id !== channelId) continue;
    if (now - entry.createdTimestamp > 10000) continue;
    return entry.executor || null;
  }

  return null;
}

export type { ChannelCreateOptionsShape, SecurityMemberLike };
