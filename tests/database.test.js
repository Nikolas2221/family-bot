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
      channels: { panel: '1', applications: '2', logs: '3', disciplineLogs: '4' },
      roles: { leader: '10', deputy: '11', elder: '12', member: '13', newbie: '14' },
      access: { applications: ['21'], discipline: ['22'], ranks: ['23'] },
      visuals: { familyBanner: 'https://example.com/family.png', applicationsBanner: 'https://example.com/apply.png' },
      features: { aiEnabled: true, autoRanksEnabled: true, leakGuardEnabled: true, channelGuardEnabled: true }
    }
  });

  assert.equal(record.setupCompleted, true);
  assert.equal(record.guildName, 'Test Guild');
  assert.equal(record.settings.channels.panel, '1');
  assert.equal(record.settings.visuals.familyBanner, 'https://example.com/family.png');
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
