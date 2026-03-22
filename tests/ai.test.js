const assert = require('node:assert/strict');

const { createAIService } = require('../ai');

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function testAdvisorSuggestsPromotionForStrongMember() {
  const aiService = createAIService({ enabled: true });

  const result = await aiService.analyzeMember({
    displayName: 'PhoenixMember',
    currentRoleName: 'Member',
    autoTargetRoleName: 'Elder',
    activityScore: 180,
    points: 82,
    warns: 0,
    commends: 5,
    messageCount: 64,
    voiceMinutes: 420,
    lastSeenAt: Date.now() - 60 * 60 * 1000
  });

  assert.match(result, /РАССМОТРЕТЬ ПОВЫШЕНИЕ/i);
  assert.match(result, /Elder/i);
}

async function testAdvisorFlagsAfkRisk() {
  const aiService = createAIService({ enabled: true });

  const result = await aiService.analyzeMember({
    displayName: 'QuietMember',
    currentRoleName: 'Newbie',
    autoTargetRoleName: 'Newbie',
    activityScore: 3,
    points: 8,
    warns: 0,
    commends: 0,
    messageCount: 1,
    voiceMinutes: 0,
    lastSeenAt: Date.now() - 4 * 24 * 60 * 60 * 1000
  });

  assert.match(result, /ПРЕДУПРЕДИТЬ ОБ AFK|КИК \/ ЧИСТКА ЗА AFK/i);
}

async function main() {
  await runTest('ai advisor suggests promotion for strong member', testAdvisorSuggestsPromotionForStrongMember);
  await runTest('ai advisor flags afk risk', testAdvisorFlagsAfkRisk);
  console.log('ALL AI TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
