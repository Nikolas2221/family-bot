const assert = require('node:assert/strict');

const { createRankService } = require('../ranks');

function createRoleCache(assignedRoleIds) {
  return {
    has(roleId) {
      return assignedRoleIds.has(roleId);
    }
  };
}

function createFakeMember(id, roleIds) {
  const assignedRoleIds = new Set(roleIds);

  return {
    id,
    roles: {
      cache: createRoleCache(assignedRoleIds),
      async add(roleId) {
        assignedRoleIds.add(typeof roleId === 'string' ? roleId : roleId.id);
      },
      async remove(roleIdsToRemove) {
        for (const roleId of roleIdsToRemove) {
          assignedRoleIds.delete(typeof roleId === 'string' ? roleId : roleId.id);
        }
      }
    },
    getAssignedRoleIds() {
      return [...assignedRoleIds];
    }
  };
}

function createFailingPromoteMember(id, roleIds, blockedRoleId) {
  const assignedRoleIds = new Set(roleIds);

  return {
    id,
    roles: {
      cache: createRoleCache(assignedRoleIds),
      async add(roleId) {
        const resolved = typeof roleId === 'string' ? roleId : roleId.id;
        if (resolved === blockedRoleId) {
          throw new Error('Missing Permissions');
        }
        assignedRoleIds.add(resolved);
      },
      async remove(roleIdsToRemove) {
        for (const roleId of roleIdsToRemove) {
          assignedRoleIds.delete(typeof roleId === 'string' ? roleId : roleId.id);
        }
      }
    },
    getAssignedRoleIds() {
      return [...assignedRoleIds];
    }
  };
}

function createRankServiceForTest(scoreByUserId = {}) {
  return createRankService({
    roles: [
      { key: 'leader', id: 'role-leader', name: 'Leader' },
      { key: 'deputy', id: 'role-deputy', name: 'Deputy' },
      { key: 'elder', id: 'role-elder', name: 'Elder' },
      { key: 'member', id: 'role-member', name: 'Member' },
      { key: 'newbie', id: 'role-newbie', name: 'Newbie' }
    ],
    storage: {
      getActivityScore(userId) {
        return scoreByUserId[userId] || 0;
      }
    },
    autoRanks: {
      enabled: true,
      intervalMs: 300000,
      memberMinScore: 50,
      elderMinScore: 150
    }
  });
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function testPromoteMovesMemberOneStepUp() {
  const rankService = createRankServiceForTest();
  const member = createFakeMember('user-1', ['role-member']);

  const result = await rankService.promote(member);

  assert.equal(result.ok, true);
  assert.deepEqual(member.getAssignedRoleIds(), ['role-elder']);
}

async function testDemoteMovesMemberOneStepDown() {
  const rankService = createRankServiceForTest();
  const member = createFakeMember('user-2', ['role-elder']);

  const result = await rankService.demote(member);

  assert.equal(result.ok, true);
  assert.deepEqual(member.getAssignedRoleIds(), ['role-member']);
}

async function testAutoRankPromotesByActivity() {
  const rankService = createRankServiceForTest({ 'user-3': 160 });
  const member = createFakeMember('user-3', ['role-newbie']);

  const result = await rankService.applyAutoRank(member);

  assert.equal(result.ok, true);
  assert.equal(result.toRole.name, 'Elder');
  assert.deepEqual(member.getAssignedRoleIds(), ['role-elder']);
}

async function testAutoRankSkipsManualLeadershipRoles() {
  const rankService = createRankServiceForTest({ 'user-4': 500 });
  const member = createFakeMember('user-4', ['role-deputy']);

  const result = await rankService.applyAutoRank(member);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'manual_only');
  assert.deepEqual(member.getAssignedRoleIds(), ['role-deputy']);
}

async function testAutoRankDoesNotDemoteOnLowActivity() {
  const rankService = createRankServiceForTest({ 'user-5': 0 });
  const member = createFakeMember('user-5', ['role-member']);

  const result = await rankService.applyAutoRank(member);

  assert.equal(result.ok, false);
  assert.equal(result.code, 'auto_keep_current');
  assert.deepEqual(member.getAssignedRoleIds(), ['role-member']);
}

async function testPromoteKeepsOldRoleWhenTargetAssignmentFails() {
  const rankService = createRankServiceForTest();
  const member = createFailingPromoteMember('user-6', ['role-member'], 'role-elder');

  await assert.rejects(() => rankService.promote(member), /Missing Permissions/);
  assert.deepEqual(member.getAssignedRoleIds(), ['role-member']);
}

async function main() {
  await runTest('rank promote moves member one step up', testPromoteMovesMemberOneStepUp);
  await runTest('rank demote moves member one step down', testDemoteMovesMemberOneStepDown);
  await runTest('auto rank promotes by activity score', testAutoRankPromotesByActivity);
  await runTest('auto rank skips leadership roles', testAutoRankSkipsManualLeadershipRoles);
  await runTest('auto rank does not demote on low activity', testAutoRankDoesNotDemoteOnLowActivity);
  await runTest('rank promote keeps old role when target assignment fails', testPromoteKeepsOldRoleWhenTargetAssignmentFails);
  console.log('ALL RANK TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
