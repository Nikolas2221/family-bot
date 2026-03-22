const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');

const { explainKickFailure } = require('../security');

function createActorMember({ canKick = true, highestPosition = 10 } = {}) {
  return {
    permissions: {
      has(permission) {
        return canKick && permission === PermissionFlagsBits.KickMembers;
      }
    },
    roles: {
      highest: {
        position: highestPosition
      }
    }
  };
}

function createTargetMember({
  id = 'user-1',
  ownerId = 'owner-1',
  kickable = true,
  highestPosition = 1
} = {}) {
  return {
    id,
    kickable,
    guild: {
      ownerId
    },
    roles: {
      highest: {
        position: highestPosition
      }
    }
  };
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

async function testExplainsMissingKickPermission() {
  const reason = explainKickFailure(
    createTargetMember(),
    createActorMember({ canKick: false })
  );

  assert.equal(reason, 'у бота нет права Kick Members');
}

async function testExplainsRoleHierarchyBlock() {
  const reason = explainKickFailure(
    createTargetMember({ kickable: false, highestPosition: 20 }),
    createActorMember({ canKick: true, highestPosition: 10 })
  );

  assert.equal(reason, 'роль бота стоит ниже или на уровне роли участника');
}

async function testAllowsKickWhenChecksPass() {
  const reason = explainKickFailure(
    createTargetMember(),
    createActorMember()
  );

  assert.equal(reason, '');
}

async function main() {
  await runTest('security explains missing kick permission', testExplainsMissingKickPermission);
  await runTest('security explains role hierarchy block', testExplainsRoleHierarchyBlock);
  await runTest('security allows kick when checks pass', testAllowsKickWhenChecksPass);
  console.log('ALL SECURITY TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
