function createRankService({ roles, storage, autoRanks }) {
  const familyRoles = roles.filter(role => role.id);
  const autoManagedRoles = ['elder', 'member', 'newbie']
    .map(key => familyRoles.find(role => role.key === key))
    .filter(Boolean);

  function getCurrentRole(member) {
    return familyRoles.find(role => member.roles.cache.has(role.id)) || null;
  }

  function getCurrentRoleIndex(member) {
    const currentRole = getCurrentRole(member);
    return currentRole ? familyRoles.findIndex(role => role.id === currentRole.id) : -1;
  }

  function getAutoTargetRole(score) {
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

  function describeMember(member) {
    const currentRole = getCurrentRole(member);
    const currentRoleIndex = getCurrentRoleIndex(member);
    const score = storage.activityScore(member.id);
    const hasManualOnlyRole = currentRole && (currentRole.key === 'leader' || currentRole.key === 'deputy');
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

  async function assignRole(member, targetRole, scopeRoles = familyRoles) {
    const removableRoleIds = scopeRoles.filter(role => role.id !== targetRole.id && member.roles.cache.has(role.id)).map(role => role.id);

    if (removableRoleIds.length) {
      await member.roles.remove(removableRoleIds);
    }

    if (!member.roles.cache.has(targetRole.id)) {
      await member.roles.add(targetRole.id);
    }
  }

  async function promote(member) {
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

  async function demote(member) {
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

  async function applyAutoRank(member) {
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

    if (currentRole.id === targetRole.id) {
      return { ok: false, code: 'already_synced', currentRole, score };
    }

    await assignRole(member, targetRole, autoManagedRoles);

    return { ok: true, code: 'auto_applied', fromRole: currentRole, toRole: targetRole, score };
  }

  async function syncAutoRanks(guild) {
    if (!autoRanks.enabled) {
      return { enabled: false, changes: [], failures: [] };
    }

    const changes = [];
    const failures = [];

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
            score: result.score
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

module.exports = { createRankService };
