import { PermissionFlagsBits } from 'discord.js';

const DANGEROUS_ASSIGNABLE_PERMISSIONS: Array<[bigint, string]> = [
  [PermissionFlagsBits.Administrator, 'Administrator'],
  [PermissionFlagsBits.ManageGuild, 'Manage Server'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels'],
  [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages'],
  [PermissionFlagsBits.MentionEveryone, 'Mention Everyone'],
  [PermissionFlagsBits.BanMembers, 'Ban Members'],
  [PermissionFlagsBits.KickMembers, 'Kick Members'],
  [PermissionFlagsBits.ModerateMembers, 'Moderate Members']
];

function hasPermission(role: any, permission: bigint): boolean {
  return Boolean(role?.permissions?.has?.(permission));
}

function rolePosition(role: any): number {
  return Number(role?.position ?? role?.rawPosition ?? 0);
}

function memberHighestPosition(member: any): number {
  const highest = member?.roles?.highest;
  if (highest) return rolePosition(highest);

  const roles = Array.from(member?.roles?.cache?.values?.() || []) as any[];
  return roles.reduce((max, role) => Math.max(max, rolePosition(role)), 0);
}

export async function getGuildBotMember(guild: any): Promise<any | null> {
  if (guild?.members?.me) return guild.members.me;

  if (typeof guild?.members?.fetchMe === 'function') {
    const fetched = await guild.members.fetchMe().catch(() => null);
    if (fetched) return fetched;
  }

  if (guild?.client?.user?.id && typeof guild?.members?.fetch === 'function') {
    return guild.members.fetch(guild.client.user.id).catch(() => null);
  }

  return null;
}

export function getUnsafeAssignableRoleReason(
  role: any,
  context: { guild?: any; actor?: any; botMember?: any; allowDangerousPermissions?: boolean } = {}
): string {
  const guild = context.guild || role?.guild;
  if (!role) return 'роль не найдена';
  if (guild?.id && role.id === guild.id) return 'нельзя выдавать @everyone';
  if (role.name === '@everyone') return 'нельзя выдавать @everyone';
  if (role.managed) return 'нельзя выдавать managed/integration роль';

  if (!context.allowDangerousPermissions) {
    const dangerous = DANGEROUS_ASSIGNABLE_PERMISSIONS
      .filter(([permission]) => hasPermission(role, permission))
      .map(([, label]) => label);
    if (dangerous.length) return `роль содержит опасные права: ${dangerous.join(', ')}`;
  }

  const botMember = context.botMember || guild?.members?.me;
  if (botMember && rolePosition(role) >= memberHighestPosition(botMember)) {
    return 'роль выше или равна верхней роли бота';
  }

  const actor = context.actor;
  if (actor && guild?.ownerId !== actor.id && rolePosition(role) >= memberHighestPosition(actor)) {
    return 'роль выше или равна верхней роли настройщика';
  }

  return '';
}

export async function getUnsafeAssignableRoleReasonAsync(
  role: any,
  context: { guild?: any; actor?: any; botMember?: any; allowDangerousPermissions?: boolean } = {}
): Promise<string> {
  const guild = context.guild || role?.guild;
  const botMember = context.botMember || await getGuildBotMember(guild);
  return getUnsafeAssignableRoleReason(role, { ...context, guild, botMember });
}

export function formatUnsafeRoleMessage(reason: string): string {
  return `Эту роль нельзя выдавать ботом: ${reason}. Выбери обычную роль без админских/модераторских прав и ниже роли бота.`;
}
