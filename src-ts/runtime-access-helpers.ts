import { ChannelType, PermissionFlagsBits } from 'discord.js';

export function canApplications(accessApi: any, member: any): boolean {
  return accessApi.canApplications(member);
}

export function canDiscipline(accessApi: any, member: any): boolean {
  return accessApi.canDiscipline(member);
}

export function canManageRanks(accessApi: any, member: any): boolean {
  return accessApi.canManageRanks(member);
}

export function canModerate(accessApi: any, member: any): boolean {
  return accessApi.canModerate(member);
}

export function canManageNicknames(accessApi: any, member: any): boolean {
  return accessApi.canManageNicknames(member);
}

export function canDebugConfig(interaction: any): boolean {
  const memberPermissions = interaction.memberPermissions || interaction.member?.permissions;
  if (!memberPermissions) return false;

  return (
    memberPermissions.has(PermissionFlagsBits.Administrator) ||
    memberPermissions.has(PermissionFlagsBits.ManageGuild) ||
    memberPermissions.has(PermissionFlagsBits.ManageRoles)
  );
}

export function canUseSecurity(accessApi: any, member: any): boolean {
  return accessApi.canUseSecurity(member);
}

export function canBypassLeakGuard(accessApi: any, member: any): boolean {
  return accessApi.canBypassLeakGuard(member);
}

export function canBypassChannelGuard(accessApi: any, member: any): boolean {
  return accessApi.canBypassChannelGuard(member);
}

export async function fetchTextChannel(guild: any, id: string): Promise<any | null> {
  if (!id) return null;
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel;
}

export function resolveTargetTextChannel(interaction: any, channelOptionName: string): any | null {
  const channel = interaction.options.getChannel(channelOptionName) || interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    return null;
  }

  return channel;
}

export function canManageTargetChannel(accessApi: any, member: any, channel: any): boolean {
  return accessApi.canManageTargetChannel(member, channel);
}

export function formatModerationTimestamp(timestamp: number | string | Date): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'неизвестно';
  }

  return date.toLocaleString('ru-RU');
}
