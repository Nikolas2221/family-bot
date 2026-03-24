import { PermissionFlagsBits } from 'discord.js';
import type { GuardConfig } from './types';

interface MemberPermissionsLike {
  has(permission: unknown): boolean;
}

interface RoleLike {
  id: string;
}

interface RoleCacheLike {
  some(callback: (role: RoleLike) => boolean): boolean;
}

interface MemberLike {
  guild?: {
    id: string;
  };
  permissions?: MemberPermissionsLike | null;
  roles?: {
    cache?: RoleCacheLike | null;
  } | null;
}

interface ChannelPermissionsLike {
  has(permission: unknown): boolean;
}

interface ChannelLike {
  permissionsFor(member: MemberLike): ChannelPermissionsLike | null;
}

interface ResolvedAccessSettings {
  access: {
    applications: string[];
    discipline: string[];
    ranks: string[];
  };
  modules?: Record<string, boolean>;
}

interface CreateAccessApiOptions {
  ownerIds: string[];
  leakGuard: GuardConfig;
  channelGuard: GuardConfig;
  resolveGuildSettings(guildId: string): ResolvedAccessSettings;
}

export function createAccessApi(options: CreateAccessApiOptions) {
  const { ownerIds, leakGuard, channelGuard, resolveGuildSettings } = options;

  function hasPermission(member: MemberLike | null | undefined, permission: unknown): boolean {
    return Boolean(member?.permissions?.has(permission));
  }

  function hasAnyRole(member: MemberLike | null | undefined, roleIds: string[]): boolean {
    return Boolean(member?.roles?.cache?.some(role => roleIds.includes(role.id)));
  }

  function isOwner(userId: string): boolean {
    return ownerIds.includes(userId);
  }

  function canApplications(member: MemberLike | null | undefined): boolean {
    if (!member?.guild?.id) return false;
    if (hasPermission(member, PermissionFlagsBits.Administrator)) return true;
    const accessRoles = resolveGuildSettings(member.guild.id).access.applications;
    if (!accessRoles.length) return hasPermission(member, PermissionFlagsBits.ManageRoles);
    return hasAnyRole(member, accessRoles) || hasPermission(member, PermissionFlagsBits.ManageRoles);
  }

  function canDiscipline(member: MemberLike | null | undefined): boolean {
    if (!member?.guild?.id) return false;
    if (hasPermission(member, PermissionFlagsBits.Administrator)) return true;
    const accessRoles = resolveGuildSettings(member.guild.id).access.discipline;
    if (!accessRoles.length) return hasPermission(member, PermissionFlagsBits.ManageRoles);
    return hasAnyRole(member, accessRoles) || hasPermission(member, PermissionFlagsBits.ManageRoles);
  }

  function canManageRanks(member: MemberLike | null | undefined): boolean {
    if (!member?.guild?.id) return false;
    if (hasPermission(member, PermissionFlagsBits.Administrator)) return true;
    const accessRoles = resolveGuildSettings(member.guild.id).access.ranks;
    if (!accessRoles.length) return hasPermission(member, PermissionFlagsBits.ManageRoles);
    return hasAnyRole(member, accessRoles) || hasPermission(member, PermissionFlagsBits.ManageRoles);
  }

  function canModerate(member: MemberLike | null | undefined): boolean {
    if (!member) return false;
    return (
      hasPermission(member, PermissionFlagsBits.Administrator) ||
      hasPermission(member, PermissionFlagsBits.ManageMessages) ||
      hasPermission(member, PermissionFlagsBits.ManageChannels) ||
      hasPermission(member, PermissionFlagsBits.ManageRoles) ||
      hasPermission(member, PermissionFlagsBits.ModerateMembers)
    );
  }

  function canManageNicknames(member: MemberLike | null | undefined): boolean {
    if (!member) return false;
    return (
      hasPermission(member, PermissionFlagsBits.Administrator) ||
      hasPermission(member, PermissionFlagsBits.ManageNicknames) ||
      hasPermission(member, PermissionFlagsBits.ManageGuild)
    );
  }

  function canUseSecurity(member: MemberLike | null | undefined): boolean {
    if (!member) return false;
    return hasPermission(member, PermissionFlagsBits.Administrator);
  }

  function canBypassLeakGuard(member: MemberLike | null | undefined): boolean {
    if (!leakGuard.enabled) return true;
    if (!member) return false;
    if (!leakGuard.allowedRoles.length) {
      return hasPermission(member, PermissionFlagsBits.ManageGuild) || hasPermission(member, PermissionFlagsBits.ManageMessages);
    }

    return (
      hasAnyRole(member, leakGuard.allowedRoles) ||
      hasPermission(member, PermissionFlagsBits.ManageGuild) ||
      hasPermission(member, PermissionFlagsBits.ManageMessages)
    );
  }

  function canBypassChannelGuard(member: MemberLike | null | undefined): boolean {
    if (!channelGuard.enabled) return true;
    if (!member) return false;
    if (!channelGuard.allowedRoles.length) {
      return hasPermission(member, PermissionFlagsBits.ManageGuild) || hasPermission(member, PermissionFlagsBits.ManageChannels);
    }

    return (
      hasAnyRole(member, channelGuard.allowedRoles) ||
      hasPermission(member, PermissionFlagsBits.ManageGuild) ||
      hasPermission(member, PermissionFlagsBits.ManageChannels)
    );
  }

  function canManageTargetChannel(member: MemberLike | null | undefined, channel: ChannelLike | null | undefined): boolean {
    if (!member || !channel) return false;
    if (hasPermission(member, PermissionFlagsBits.Administrator)) return true;

    const permissions = channel.permissionsFor(member);
    return Boolean(
      permissions?.has(PermissionFlagsBits.ManageMessages) ||
      permissions?.has(PermissionFlagsBits.ManageChannels)
    );
  }

  return {
    hasPermission,
    hasAnyRole,
    isOwner,
    canApplications,
    canDiscipline,
    canManageRanks,
    canModerate,
    canManageNicknames,
    canUseSecurity,
    canBypassLeakGuard,
    canBypassChannelGuard,
    canManageTargetChannel
  };
}
