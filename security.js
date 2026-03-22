const { AuditLogEvent, ChannelType, OverwriteType, PermissionFlagsBits } = require('discord.js');

const DISCORD_INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/i;

function containsDiscordInvite(text) {
  return DISCORD_INVITE_PATTERN.test(String(text || ''));
}

function explainKickFailure(member, actorMember) {
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

function serializePermissionOverwrites(channel) {
  if (!channel.permissionOverwrites?.cache) {
    return [];
  }

  return channel.permissionOverwrites.cache.map(overwrite => ({
    id: overwrite.id,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield,
    type: overwrite.type === OverwriteType.Member ? OverwriteType.Member : OverwriteType.Role
  }));
}

function buildChannelCreateOptions(channel, reason) {
  const options = {
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

async function restoreDeletedChannel(channel, reason) {
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

async function fetchDeletedChannelExecutor(guild, channelId) {
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

module.exports = {
  buildChannelCreateOptions,
  containsDiscordInvite,
  explainKickFailure,
  fetchDeletedChannelExecutor,
  restoreDeletedChannel
};
