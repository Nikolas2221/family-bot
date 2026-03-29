import type { RankActionResult, RankDescription, RankService, RankSyncResult, RoleDefinition } from './types';

interface MemberLike {
  id: string;
  roles: {
    cache: {
      has(roleId: string): boolean;
    };
    add(roleId: string): Promise<unknown>;
    remove(roleIds: string[]): Promise<unknown>;
  };
}

interface GuildLike {
  members: {
    cache: Map<string, MemberLike>;
  };
}

interface StorageLike {
  activityScore(memberId: string): number;
}

interface AutoRanksLike {
  enabled: boolean;
  memberMinScore: number;
  elderMinScore: number;
}

export function createRankService(options: {
  roles: RoleDefinition[];
  storage: StorageLike;
  autoRanks: AutoRanksLike;
}): RankService {
  const { roles, storage, autoRanks } = options;
  const familyRoles = roles.filter(role => role.id);
  const autoManagedRoles = ['elder', 'member', 'newbie']
    .map(key => familyRoles.find(role => role.key === key))
    .filter(Boolean) as RoleDefinition[];

  function getCurrentRole(member: MemberLike) {
    return familyRoles.find(role => role.id && member.roles.cache.has(role.id)) || null;
  }

  function getCurrentRoleIndex(member: MemberLike): number {
    const currentRole = getCurrentRole(member);
    return currentRole ? familyRoles.findIndex(role => role.id === currentRole.id) : -1;
  }

  function getAutoTargetRole(score: number) {
    const elderRole = familyRoles.find(role => role.key === 'elder');
    const memberRole = familyRoles.find(role => role.key === 'member');
    const newbieRole = familyRoles.find(role => role.key === 'newbie');

    if (elderRole && score >= autoRanks.elderMinScore) {
      return elderRole;
    }

    if (memberRole && score >= autoRanks.memberMinScore) {
      return memberRole;
    }

    return newbieRole || memberRole || elderRole || null;
  }

  function describeMember(member: MemberLike): RankDescription {
    const currentRole = getCurrentRole(member);
    const currentRoleIndex = getCurrentRoleIndex(member);
    const score = storage.activityScore(member.id);
    const hasManualOnlyRole = Boolean(currentRole && (currentRole.key === 'leader' || currentRole.key === 'deputy'));
    const autoTargetRole = currentRole && !hasManualOnlyRole ? getAutoTargetRole(score) : null;

    return {
      currentRole,
      score,
      autoEnabled: autoRanks.enabled,
      manualOnly: hasManualOnlyRole,
      canPromote: currentRoleIndex > 0,
      canDemote: currentRoleIndex >= 0 && currentRoleIndex < familyRoles.length - 1,
      canAutoSync:
        autoRanks.enabled &&
        !hasManualOnlyRole &&
        Boolean(currentRole && autoTargetRole && currentRole.id !== autoTargetRole.id),
      autoTargetRole
    };
  }

  async function assignRole(member: MemberLike, targetRole: RoleDefinition, scopeRoles = familyRoles): Promise<void> {
    const removableRoleIds = scopeRoles
      .filter(role => role.id && role.id !== targetRole.id && member.roles.cache.has(role.id))
      .map(role => role.id!) as string[];

    if (targetRole.id && !member.roles.cache.has(targetRole.id)) {
      await member.roles.add(targetRole.id);
    }

    if (removableRoleIds.length) {
      await member.roles.remove(removableRoleIds);
    }
  }

  async function promote(member: MemberLike): Promise<RankActionResult> {
    const currentRole = getCurrentRole(member);
    if (!currentRole) {
      return { ok: false, code: 'no_family_role' };
    }

    const currentIndex = familyRoles.findIndex(role => role.id === currentRole.id);
    if (currentIndex <= 0) {
      return { ok: false, code: 'top_rank', currentRole };
    }

    const targetRole = familyRoles[currentIndex - 1];
    await assignRole(member, targetRole);

    return { ok: true, code: 'promoted', fromRole: currentRole, toRole: targetRole };
  }

  async function demote(member: MemberLike): Promise<RankActionResult> {
    const currentRole = getCurrentRole(member);
    if (!currentRole) {
      return { ok: false, code: 'no_family_role' };
    }

    const currentIndex = familyRoles.findIndex(role => role.id === currentRole.id);
    if (currentIndex === -1 || currentIndex >= familyRoles.length - 1) {
      return { ok: false, code: 'bottom_rank', currentRole };
    }

    const targetRole = familyRoles[currentIndex + 1];
    await assignRole(member, targetRole);

    return { ok: true, code: 'demoted', fromRole: currentRole, toRole: targetRole };
  }

  async function applyAutoRank(member: MemberLike): Promise<RankActionResult> {
    if (!autoRanks.enabled) {
      return { ok: false, code: 'auto_disabled' };
    }

    const currentRole = getCurrentRole(member);
    if (!currentRole) {
      return { ok: false, code: 'no_family_role' };
    }

    if (currentRole.key === 'leader' || currentRole.key === 'deputy') {
      return { ok: false, code: 'manual_only', currentRole };
    }

    const score = storage.activityScore(member.id);
    const targetRole = getAutoTargetRole(score);

    if (!targetRole) {
      return { ok: false, code: 'auto_unavailable', currentRole, score };
    }

    const currentIndex = familyRoles.findIndex(role => role.id === currentRole.id);
    const targetIndex = familyRoles.findIndex(role => role.id === targetRole.id);

    if (currentIndex !== -1 && targetIndex > currentIndex) {
      return { ok: false, code: 'auto_keep_current', currentRole, targetRole, score };
    }

    if (currentRole.id === targetRole.id) {
      return { ok: false, code: 'already_synced', currentRole, score };
    }

    await assignRole(member, targetRole, autoManagedRoles);

    return { ok: true, code: 'auto_applied', fromRole: currentRole, toRole: targetRole, score };
  }

  async function syncAutoRanks(guild: GuildLike): Promise<RankSyncResult> {
    if (!autoRanks.enabled) {
      return { enabled: false, changes: [], failures: [] };
    }

    const changes: RankSyncResult['changes'] = [];
    const failures: RankSyncResult['failures'] = [];

    for (const member of guild.members.cache.values()) {
      const currentRole = getCurrentRole(member);
      if (!currentRole) continue;

      if (currentRole.key === 'leader' || currentRole.key === 'deputy') {
        continue;
      }

      try {
        const result = await applyAutoRank(member);
        if (result.ok) {
          changes.push({
            memberId: member.id,
            fromRole: result.fromRole,
            toRole: result.toRole,
            score: result.score || 0
          });
        }
      } catch (error) {
        failures.push({ memberId: member.id, error });
      }
    }

    return { enabled: true, changes, failures };
  }

  return {
    applyAutoRank,
    demote,
    describeMember,
    getCurrentRole,
    promote,
    syncAutoRanks
  };
}

export default createRankService;
