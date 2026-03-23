const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createDatabase } = require('../database');

function createTempDatabase() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-db-'));
  const dataFile = path.join(tempDir, 'database.json');
  return createDatabase({ dataFile, saveDelayMs: 1 });
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

async function testSetupCreatesGuildRecord() {
  const database = createTempDatabase();

  const record = database.markSetupComplete('guild-1', {
    guildName: 'Test Guild',
    ownerId: 'owner-1',
    settings: {
      familyTitle: 'Test Family',
      channels: { panel: '1', applications: '2', welcome: '5', logs: '3', disciplineLogs: '4', reports: '6' },
      roles: { leader: '10', deputy: '11', elder: '12', member: '13', newbie: '14', autorole: '15' },
      access: { applications: ['21'], discipline: ['22'], ranks: ['23'] },
      visuals: { familyBanner: 'https://example.com/family.png', applicationsBanner: 'https://example.com/apply.png' },
      features: { aiEnabled: true, autoRanksEnabled: true, leakGuardEnabled: true, channelGuardEnabled: true },
      welcome: { enabled: true, dmEnabled: true, message: 'Welcome aboard' },
      reactionRoles: [{ messageId: '777', channelId: '1', roleId: '15', emoji: '🔥', emojiKey: '🔥' }],
      reportSchedule: {
        weekly: { enabled: true, channelId: '6' },
        monthly: { enabled: false, channelId: '6' }
      }
    }
  });

  assert.equal(record.setupCompleted, true);
  assert.equal(record.guildName, 'Test Guild');
  assert.equal(record.settings.channels.panel, '1');
  assert.equal(record.settings.channels.welcome, '5');
  assert.equal(record.settings.channels.reports, '6');
  assert.equal(record.settings.visuals.familyBanner, 'https://example.com/family.png');
  assert.equal(record.settings.roles.autorole, '15');
  assert.equal(record.settings.welcome.enabled, true);
  assert.equal(record.settings.welcome.dmEnabled, true);
  assert.equal(record.settings.welcome.message, 'Welcome aboard');
  assert.equal(record.settings.reactionRoles.length, 1);
  assert.equal(record.settings.reactionRoles[0].roleId, '15');
  assert.equal(record.settings.reportSchedule.weekly.enabled, true);
  assert.equal(record.settings.reportSchedule.monthly.channelId, '6');
}

async function testSubscriptionCanBeUpdated() {
  const database = createTempDatabase();

  database.setSubscription('guild-2', { plan: 'premium', assignedBy: 'owner-2' });

  assert.equal(database.getSubscription('guild-2'), 'premium');
  assert.equal(database.isPremium('guild-2'), true);
}

async function main() {
  await runTest('database setup creates guild record', testSetupCreatesGuildRecord);
  await runTest('database subscription can be updated', testSubscriptionCanBeUpdated);
  console.log('ALL DATABASE TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
