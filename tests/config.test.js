const assert = require('node:assert/strict');

const { createConfig, summarizeConfig, validateConfig } = require('../config');

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function testMissingRequiredEnv() {
  const config = createConfig({});
  const validation = validateConfig(config);

  assert.match(validation.errors.join('\n'), /TOKEN/);
  assert.match(validation.errors.join('\n'), /GUILD_ID/);
  assert.match(validation.errors.join('\n'), /CHANNEL_ID/);
}

async function testAiEnabledWorksInOfflineModeWithoutKey() {
  const config = createConfig({
    TOKEN: 'token',
    GUILD_ID: '123456789012345678',
    CHANNEL_ID: '123456789012345679',
    AI_ENABLED: 'true'
  });
  const validation = validateConfig(config);

  assert.equal(validation.errors.length, 0);
  assert.match(validation.notes.join('\n'), /оффлайн-режиме/i);
}

async function testSummaryContainsSafeHumanReadableFields() {
  const config = createConfig({
    TOKEN: 'super-secret-token',
    GUILD_ID: '123456789012345678',
    CHANNEL_ID: '123456789012345679',
    AI_ENABLED: 'true',
    ROLE_MEMBER: '123456789012345680'
  });

  const lines = summarizeConfig(config).join('\n');

  assert.match(lines, /Config summary/);
  assert.match(lines, /offline helper enabled/);
  assert.doesNotMatch(lines, /super-secret-token/);
}

async function testAutoRanksThresholdValidation() {
  const config = createConfig({
    TOKEN: 'token',
    GUILD_ID: '123456789012345678',
    CHANNEL_ID: '123456789012345679',
    AUTO_RANKS_ENABLED: 'true',
    AUTO_RANK_MEMBER_MIN_SCORE: '200',
    AUTO_RANK_ELDER_MIN_SCORE: '100'
  });
  const validation = validateConfig(config);

  assert.match(validation.errors.join('\n'), /AUTO_RANK_ELDER_MIN_SCORE/);
}

async function main() {
  await runTest('config validation fails when required env is missing', testMissingRequiredEnv);
  await runTest('config validation allows offline AI without API key', testAiEnabledWorksInOfflineModeWithoutKey);
  await runTest('config summary stays safe and readable', testSummaryContainsSafeHumanReadableFields);
  await runTest('config validation catches invalid auto rank thresholds', testAutoRanksThresholdValidation);
  console.log('ALL CONFIG TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
