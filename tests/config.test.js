const assert = require('node:assert/strict');

const { createConfig, summarizeConfig, validateConfig } = require('../dist-ts/config');

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
    ROLE_MEMBER: '123456789012345680',
    STORAGE_FILE: '/data/storage.json',
    DATABASE_FILE: '/data/database.json'
  });

  const lines = summarizeConfig(config).join('\n');

  assert.match(lines, /Config summary/);
  assert.match(lines, /offline helper enabled/);
  assert.match(lines, /storage file: \/data\/storage\.json/);
  assert.match(lines, /database file: \/data\/database\.json/);
  assert.doesNotMatch(lines, /super-secret-token/);
}

async function testStorageFileEnvIsReadFromConfig() {
  const config = createConfig({
    TOKEN: 'token',
    GUILD_ID: '123456789012345678',
    CHANNEL_ID: '123456789012345679',
    STORAGE_FILE: '/data/storage.json'
  });

  assert.equal(config.storageFile, '/data/storage.json');
}

async function testApplicationDefaultRoleIgnoresLegacyNewbieRole() {
  const config = createConfig({
    TOKEN: 'token',
    GUILD_ID: '123456789012345678',
    CHANNEL_ID: '123456789012345679',
    ROLE_NEWBIE: '1519857232345436220',
    APPLICATION_DEFAULT_ROLE: '1522317438228627528'
  });

  assert.equal(config.applicationDefaultRole, '1522317438228627528');
}

async function testDeepSeekConfigKeepsKeySecret() {
  const config = createConfig({
    TOKEN: 'token',
    GUILD_ID: '123456789012345678',
    CHANNEL_ID: '123456789012345679',
    AI_ENABLED: 'true',
    DEEPSEEK_API_KEY: 'deepseek-secret'
  });
  const validation = validateConfig(config);
  const summary = summarizeConfig(config).join('\n');

  assert.equal(config.deepSeekModel, 'deepseek-chat');
  assert.match(validation.notes.join('\n'), /DeepSeek/);
  assert.match(summary, /DeepSeek enabled/);
  assert.doesNotMatch(summary, /deepseek-secret/);
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

async function testTelegramConfigIsSafeAndRequiresBothValues() {
  const incomplete = createConfig({
    TOKEN: 'token',
    GUILD_ID: '123456789012345678',
    CHANNEL_ID: '123456789012345679',
    TELEGRAM_BOT_TOKEN: 'telegram-secret-token'
  });
  assert.match(validateConfig(incomplete).warnings.join('\n'), /TELEGRAM_ADMIN_CHAT_ID/);

  const complete = createConfig({
    TOKEN: 'token',
    GUILD_ID: '123456789012345678',
    CHANNEL_ID: '123456789012345679',
    TELEGRAM_BOT_TOKEN: 'telegram-secret-token',
    TELEGRAM_ADMIN_CHAT_ID: '-1001234567890',
    DISCORD_ANNOUNCEMENTS_CHANNEL_ID: '123456789012345680',
    DISCORD_ANNOUNCER_ROLE_IDS: '123456789012345681,123456789012345682'
  });
  const summary = summarizeConfig(complete).join('\n');

  assert.equal(complete.telegramAdminChatId, '-1001234567890');
  assert.equal(complete.telegramAnnouncementsChatId, '-1001234567890');
  assert.deepEqual(complete.discordAnnouncerRoleIds, ['123456789012345681', '123456789012345682']);
  assert.match(summary, /Telegram notifications: enabled/);
  assert.doesNotMatch(summary, /telegram-secret-token/);
}

async function testSupportTicketConfig() {
  const config = createConfig({
    TOKEN: 'token', GUILD_ID: '123456789012345678', CHANNEL_ID: '123456789012345679',
    TICKET_CATEGORY_ID: '123456789012345680',
    TICKET_SUPPORT_ROLE_ID: '123456789012345681',
    TICKET_LOG_CHANNEL_ID: '123456789012345682',
    TICKET_PANEL_CHANNEL_ID: '123456789012345683',
    TICKET_PING_SUPPORT: 'false',
    TICKET_COOLDOWN_SECONDS: '45',
    TICKET_MAX_OPEN_PER_USER: '1',
    TICKET_DELETE_DELAY_SECONDS: '7'
  });
  assert.equal(config.supportTickets.categoryId, '123456789012345680');
  assert.equal(config.supportTickets.supportRoleId, '123456789012345681');
  assert.equal(config.supportTickets.pingSupport, false);
  assert.equal(config.supportTickets.cooldownSeconds, 45);
  assert.equal(config.supportTickets.deleteDelaySeconds, 7);
  assert.match(summarizeConfig(config).join('\n'), /support tickets: configured/);
}

async function testAfkLeaveConfig() {
  const config = createConfig({
    TOKEN: 'token', GUILD_ID: '123456789012345678', CHANNEL_ID: '123456789012345679',
    AFK_CHANNEL_ID: '123456789012345680',
    AFK_LOG_CHANNEL_ID: '123456789012345681',
    AFK_MANAGER_ROLE_ID: '123456789012345682',
    AFK_APPROVED_ROLE_ID: '123456789012345683',
    DISCORD_ONLINE_GUILD_ID: '123456789012345684',
    AFK_USE_MODAL: 'true', AFK_USE_MESSAGE_FORM: 'false', AFK_ALLOW_DM_NOTIFY: 'true',
    AFK_PIN_PANEL: 'false', AFK_PREVENT_DUPLICATE_PANEL: 'true'
  });
  assert.equal(config.afkLeave.channelId, '123456789012345680');
  assert.equal(config.afkLeave.approvedRoleId, '123456789012345683');
  assert.equal(config.discordOnlineGuildId, '123456789012345684');
  assert.equal(config.afkLeave.useModal, true);
  assert.equal(config.afkLeave.useMessageForm, false);
  assert.equal(config.afkLeave.pinPanel, false);
  assert.match(summarizeConfig(config).join('\n'), /AFK leave: configured/);
}

async function main() {
  await runTest('config validation fails when required env is missing', testMissingRequiredEnv);
  await runTest('config validation allows offline AI without API key', testAiEnabledWorksInOfflineModeWithoutKey);
  await runTest('config summary stays safe and readable', testSummaryContainsSafeHumanReadableFields);
  await runTest('config reads storage file path from env', testStorageFileEnvIsReadFromConfig);
  await runTest('application default role ignores legacy newbie role', testApplicationDefaultRoleIgnoresLegacyNewbieRole);
  await runTest('DeepSeek config keeps API key secret', testDeepSeekConfigKeepsKeySecret);
  await runTest('config validation catches invalid auto rank thresholds', testAutoRanksThresholdValidation);
  await runTest('Telegram config is paired and token stays secret', testTelegramConfigIsSafeAndRequiresBothValues);
  await runTest('support ticket config is parsed', testSupportTicketConfig);
  await runTest('AFK leave config is parsed', testAfkLeaveConfig);
  console.log('ALL CONFIG TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
