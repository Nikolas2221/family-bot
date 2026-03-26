const assert = require('node:assert/strict');

const {
  defaultAutomodConfig,
  evaluateAutomodMessage,
  evaluateSpamActivity,
  normalizeAutomodConfig
} = require('../automod');

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function testNormalizeAutomodConfigClampsValuesAndWords() {
  const config = normalizeAutomodConfig({
    capsPercent: 200,
    mentionLimit: 1,
    badWords: [' Test ', '', 'test', 'Word', 'spam, scam , abuse']
  });

  assert.equal(config.capsPercent, 100);
  assert.equal(config.mentionLimit, 2);
  assert.deepEqual(config.badWords, ['test', 'word', 'spam', 'scam', 'abuse']);
}

async function testEvaluateAutomodMessageDetectsRules() {
  const base = defaultAutomodConfig();

  assert.equal(
    evaluateAutomodMessage({
      content: 'join https://discord.gg/test',
      config: { ...base, invitesEnabled: true }
    }).rule,
    'invites'
  );

  assert.equal(
    evaluateAutomodMessage({
      content: 'BUY NOW HTTPS://EXAMPLE.COM',
      config: { ...base, linksEnabled: true }
    }).rule,
    'links'
  );

  assert.equal(
    evaluateAutomodMessage({
      content: 'ЭТО ОЧЕНЬ ГРОМКОЕ СООБЩЕНИЕ ДЛЯ ПРОВЕРКИ',
      config: { ...base, capsEnabled: true, capsPercent: 70, capsMinLength: 10 }
    }).rule,
    'caps'
  );

  assert.equal(
    evaluateAutomodMessage({
      content: 'привет',
      mentionCount: 6,
      config: { ...base, mentionsEnabled: true, mentionLimit: 5 }
    }).rule,
    'mentions'
  );

  assert.equal(
    evaluateAutomodMessage({
      content: 'bad word here',
      config: { ...base, badWordsEnabled: true, badWords: ['word'] }
    }).rule,
    'badWords'
  );
}

async function testEvaluateSpamActivityTriggersInsideWindow() {
  const now = Date.now();
  const { recent, triggered } = evaluateSpamActivity(
    [now - 1000, now - 2000, now - 3000, now - 4000, now - 5000],
    now,
    { spamEnabled: true, spamCount: 6, spamWindowSeconds: 8 }
  );

  assert.equal(triggered, true);
  assert.equal(recent.length, 6);
}

async function main() {
  await runTest('automod config normalization clamps values and deduplicates words', testNormalizeAutomodConfigClampsValuesAndWords);
  await runTest('automod message evaluation detects configured rules', testEvaluateAutomodMessageDetectsRules);
  await runTest('automod spam evaluation triggers inside the configured window', testEvaluateSpamActivityTriggersInsideWindow);
  console.log('ALL AUTOMOD TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
