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

async function testLegacyMemberDataMigratesIntoGuildRecord() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-storage-legacy-'));
  const dataFile = path.join(tempDir, 'storage.json');
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      members: {
        'user-legacy': {
          messageCount: 42,
          lastSeenAt: 1700000000000,
          warns: 1,
          commends: 4,
          points: 17,
          voiceMinutes: 90,
          afkWarningSentAt: ''
        }
      },
      applications: [],
      cooldowns: {},
      warns: [],
      commends: [],
      blacklist: [],
      panelMessageId: '',
      panelMessageIds: {}
    }),
    'utf8'
  );

  const storage = createStorage({ dataFile, saveDelayMs: 1 });
  const member = storage.ensureGuildMember('guild-legacy', 'user-legacy');

  assert.equal(member.messageCount, 42);
  assert.equal(storage.guildPointsScore('guild-legacy', 'user-legacy'), 17);
  assert.equal(storage.guildVoiceMinutes('guild-legacy', 'user-legacy'), 90);
  assert.equal(storage.getStore().members['user-legacy'], undefined);
}

async function testLegacyMemberDataMergesIntoExistingGuildRecord() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-storage-legacy-merge-'));
  const dataFile = path.join(tempDir, 'storage.json');
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      members: {
        'guild-merge:user-merge': {
          guildId: 'guild-merge',
          userId: 'user-merge',
          messageCount: 0,
          lastSeenAt: 1700000000100,
          warns: 0,
          commends: 0,
          points: 0,
          voiceMinutes: 0,
          afkWarningSentAt: ''
        },
        'user-merge': {
          messageCount: 12,
          lastSeenAt: 1700000000200,
          warns: 2,
          commends: 5,
          points: 9,
          voiceMinutes: 45,
          afkWarningSentAt: ''
        }
      },
      applications: [],
      cooldowns: {},
      warns: [],
      commends: [],
      blacklist: [],
      panelMessageId: '',
      panelMessageIds: {}
    }),
    'utf8'
  );

  const storage = createStorage({ dataFile, saveDelayMs: 1 });
  const member = storage.ensureGuildMember('guild-merge', 'user-merge');

  assert.equal(member.messageCount, 12);
  assert.equal(member.warns, 2);
  assert.equal(member.commends, 5);
  assert.equal(storage.guildPointsScore('guild-merge', 'user-merge'), 9);
  assert.equal(storage.guildVoiceMinutes('guild-merge', 'user-merge'), 45);
  assert.equal(storage.getStore().members['user-merge'], undefined);
}

async function testGuildActivityPersistsAcrossRestart() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-storage-persist-'));
  const dataFile = path.join(tempDir, 'storage.json');
  const storage = createStorage({ dataFile, saveDelayMs: 1 });

  storage.trackGuildMessage('guild-persist', 'user-persist');
  storage.addGuildCommend({
    guildId: 'guild-persist',
    userId: 'user-persist',
    moderatorId: 'mod-1',
    reason: 'good'
  });
  storage.addGuildVoiceMinutes('guild-persist', 'user-persist', 75);
  storage.flush();

  const restartedStorage = createStorage({ dataFile, saveDelayMs: 1 });

  assert.equal(restartedStorage.ensureGuildMember('guild-persist', 'user-persist').messageCount, 1);
  assert.equal(restartedStorage.guildPointsScore('guild-persist', 'user-persist'), 1);
  assert.equal(restartedStorage.guildVoiceMinutes('guild-persist', 'user-persist'), 75);
}

async function testStorageCreatesNestedDirectoryOnFlush() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-storage-nested-'));
  const dataFile = path.join(tempDir, 'nested', 'storage.json');
  const storage = createStorage({ dataFile, saveDelayMs: 1 });

  storage.trackGuildMessage('guild-nested', 'user-nested');
  storage.flush();

  assert.equal(fs.existsSync(dataFile), true);
}

async function testStorageRestoresFromBackupWhenPrimaryIsInvalid() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-storage-backup-'));
  const dataFile = path.join(tempDir, 'storage.json');
  fs.writeFileSync(`${dataFile}.bak`, JSON.stringify({
    members: {
      'guild-backup:user-backup': {
        guildId: 'guild-backup',
        userId: 'user-backup',
        messageCount: 3,
        lastSeenAt: 1700000000000,
        warns: 0,
        commends: 2,
        points: 2,
        voiceMinutes: 30,
        afkWarningSentAt: ''
      }
    },
    applications: [],
    cooldowns: {},
    warns: [],
    commends: [],
    blacklist: [],
    panelMessageId: '',
    panelMessageIds: {}
  }), 'utf8');
  fs.writeFileSync(dataFile, '{broken json', 'utf8');

  const storage = createStorage({ dataFile, saveDelayMs: 1 });

  assert.equal(storage.guildPointsScore('guild-backup', 'user-backup'), 2);
  assert.equal(storage.guildVoiceMinutes('guild-backup', 'user-backup'), 30);
}

async function testStoragePrefersBackupWhenPrimaryLooksEmpty() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-storage-empty-primary-'));
  const dataFile = path.join(tempDir, 'storage.json');
  fs.writeFileSync(dataFile, JSON.stringify({
    members: {},
    applications: [],
    cooldowns: {},
    warns: [],
    commends: [],
    blacklist: [],
    panelMessageId: '',
    panelMessageIds: {}
  }), 'utf8');
  fs.writeFileSync(`${dataFile}.bak`, JSON.stringify({
    members: {
      'guild-pref:user-pref': {
        guildId: 'guild-pref',
        userId: 'user-pref',
        messageCount: 5,
        lastSeenAt: 1700000000000,
        warns: 1,
        commends: 4,
        points: 4,
        voiceMinutes: 15,
        afkWarningSentAt: ''
      }
    },
    applications: [],
    cooldowns: {},
    warns: [],
    commends: [],
    blacklist: [],
    panelMessageId: '',
    panelMessageIds: {}
  }), 'utf8');

  const storage = createStorage({ dataFile, saveDelayMs: 1 });

  assert.equal(storage.ensureGuildMember('guild-pref', 'user-pref').messageCount, 5);
  assert.equal(storage.guildPointsScore('guild-pref', 'user-pref'), 4);
}

async function main() {
  await runTest('commends increase points up to 100', testCommendsIncreasePointsUpToHundred);
  await runTest('warns do not drop points below zero', testWarnsDoNotDropPointsBelowZero);
  await runTest('voice minutes accumulate', testVoiceMinutesAccumulate);
  await runTest('stored guild panel id overrides legacy fixed id', testStoredGuildPanelMessageIdOverridesLegacyFixedId);
  await runTest('legacy member data migrates into guild record', testLegacyMemberDataMigratesIntoGuildRecord);
  await runTest('legacy member data merges into existing guild record', testLegacyMemberDataMergesIntoExistingGuildRecord);
  await runTest('guild activity persists across restart', testGuildActivityPersistsAcrossRestart);
  await runTest('storage creates nested directory on flush', testStorageCreatesNestedDirectoryOnFlush);
  await runTest('storage restores from backup when primary is invalid', testStorageRestoresFromBackupWhenPrimaryIsInvalid);
  await runTest('storage prefers backup when primary looks empty', testStoragePrefersBackupWhenPrimaryLooksEmpty);
  console.log('ALL STORAGE TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
