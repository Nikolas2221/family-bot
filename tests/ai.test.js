const assert = require('node:assert/strict');

const { createAIService } = require('../dist-ts/ai');

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

async function testExternalAiChatIsUsedWhenConfigured() {
  const calls = [];
  const aiService = createAIService({
    enabled: true,
    chatCompletion: {
      enabled: true,
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      async chat(messages) {
        calls.push(messages);
        return 'Ответ от OpenRouter модели';
      }
    }
  });

  const answer = await aiService.aiText('system', 'question');
  assert.equal(answer, 'Ответ от OpenRouter модели');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].content, 'question');
}

async function testMemberRolesArePassedToExternalAi() {
  const calls = [];
  const aiService = createAIService({
    enabled: true,
    chatCompletion: {
      enabled: true,
      async chat(messages) {
        calls.push(messages);
        return 'ok';
      }
    }
  });

  await aiService.analyzeMember({
    displayName: 'RoleMember',
    currentRoleName: 'KLAIZ Elite',
    allRoleNames: ['KLAIZ Elite', 'KLAIZ Main', 'Family'],
    activityScore: 10,
    points: 5,
    warns: 0,
    commends: 0,
    messageCount: 1,
    voiceMinutes: 2,
    lastSeenAt: Date.now()
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0][1].content, /Текущая роль: KLAIZ Elite/u);
  assert.match(calls[0][1].content, /Все роли Discord: KLAIZ Elite, KLAIZ Main, Family/u);
}

async function main() {
  await runTest('ai advisor suggests promotion for strong member', testAdvisorSuggestsPromotionForStrongMember);
  await runTest('ai advisor flags afk risk', testAdvisorFlagsAfkRisk);
  await runTest('external ai chat is used when configured', testExternalAiChatIsUsedWhenConfigured);
  await runTest('member roles are passed to external ai', testMemberRolesArePassedToExternalAi);
  console.log('ALL AI TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
