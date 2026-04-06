const assert = require('node:assert/strict');

const {
  buildAiCommandsOverview,
  buildAutomodRulePatch,
  getAutomodStateKey,
  getAutomodTargetLimits,
  isAiCommandOverviewQuery,
  isAiNicknameRequest,
  isPremiumAutomodRule,
  isPremiumAutomodTarget
} = require('../dist-ts/runtime-command-helpers');

async function main() {
  assert.equal(isAiCommandOverviewQuery('что я умею'), true);
  assert.equal(isAiCommandOverviewQuery('мои команды'), true);
  assert.equal(isAiCommandOverviewQuery('просто текст'), false);

  assert.equal(isAiNicknameRequest('смени ник', { id: '1' }, 'Phoenix'), true);
  assert.equal(isAiNicknameRequest('rename nick', { id: '1' }, 'Phoenix'), true);
  assert.equal(isAiNicknameRequest('смени ник', null, 'Phoenix'), false);

  const overview = buildAiCommandsOverview({
    catalog: {
      regularCommands: [{ name: 'family', description: 'Панель семьи' }],
      adminCommands: [{ name: 'adminpanel', description: 'Админка' }]
    },
    isPremium: true,
    userId: '123',
    copy: {
      ai: {
        commandsOverviewTitle: 'Доступные команды',
        commandsOverviewEmpty: 'Пусто'
      }
    }
  });

  assert.match(overview, /Доступные команды/u);
  assert.match(overview, /Premium/u);
  assert.match(overview, /\/family - Панель семьи/u);
  assert.match(overview, /\/adminpanel - Админка/u);

  assert.equal(getAutomodStateKey('guild', 'user'), 'guild:user');
  assert.deepEqual(buildAutomodRulePatch('badWords', true), { badWordsEnabled: true });
  assert.deepEqual(buildAutomodRulePatch('unknown', true), {});
  assert.deepEqual(getAutomodTargetLimits('capsPercent', 120), { capsPercent: 100 });
  assert.deepEqual(getAutomodTargetLimits('spamWindowSeconds', 1), { spamWindowSeconds: 3 });
  assert.deepEqual(getAutomodTargetLimits('unknown', 10), {});
  assert.equal(isPremiumAutomodRule('spam'), true);
  assert.equal(isPremiumAutomodRule('links'), false);
  assert.equal(isPremiumAutomodTarget('spamCount'), true);
  assert.equal(isPremiumAutomodTarget('mentionLimit'), false);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
