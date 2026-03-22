const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createStorage } = require('../storage');

function createTempStorage() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-storage-'));
  const dataFile = path.join(tempDir, 'storage.json');
  return createStorage({ dataFile, saveDelayMs: 1 });
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

async function testCommendsIncreasePointsUpToHundred() {
  const storage = createTempStorage();

  for (let index = 0; index < 120; index += 1) {
    storage.addCommend({ userId: 'user-1', moderatorId: 'mod-1', reason: 'good' });
  }

  assert.equal(storage.pointsScore('user-1'), 100);
}

async function testWarnsDoNotDropPointsBelowZero() {
  const storage = createTempStorage();

  storage.addWarn({ userId: 'user-2', moderatorId: 'mod-1', reason: 'bad' });
  storage.addWarn({ userId: 'user-2', moderatorId: 'mod-1', reason: 'bad' });

  assert.equal(storage.pointsScore('user-2'), 0);
}

async function testVoiceMinutesAccumulate() {
  const storage = createTempStorage();

  storage.addVoiceMinutes('user-3', 25);
  storage.addVoiceMinutes('user-3', 35);

  assert.equal(storage.voiceMinutes('user-3'), 60);
}

async function testStoredGuildPanelMessageIdOverridesLegacyFixedId() {
  const storage = createTempStorage();

  storage.setGuildPanelMessageId('guild-1', 'new-panel-id', 'old-fixed-id');

  assert.equal(storage.getGuildPanelMessageId('guild-1', 'old-fixed-id'), 'new-panel-id');
}

async function main() {
  await runTest('commends increase points up to 100', testCommendsIncreasePointsUpToHundred);
  await runTest('warns do not drop points below zero', testWarnsDoNotDropPointsBelowZero);
  await runTest('voice minutes accumulate', testVoiceMinutesAccumulate);
  await runTest('stored guild panel id overrides legacy fixed id', testStoredGuildPanelMessageIdOverridesLegacyFixedId);
  console.log('ALL STORAGE TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
