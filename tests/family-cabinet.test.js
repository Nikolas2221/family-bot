const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFamilyCabinetService } = require('../dist-ts/modules/familyCabinet');
const { __familyCabinetScraperInternals } = require('../dist-ts/modules/familyCabinet/scraper');

function writeScraperModule(dir) {
  const file = path.join(dir, 'cabinet-scraper.js');
  fs.writeFileSync(file, `
exports.scrapeFamilyLogs = async () => [
  {
    externalLogId: 'log-1',
    datetime: '2026-08-07T10:00:00.000Z',
    actionRaw: 'Выполнен контракт',
    actionType: 'contract_complete',
    member: { nickname: 'Ovik', staticId: 123 },
    initiator: { nickname: 'Nik', staticId: 456 },
    status: 'parsed'
  },
  {
    externalLogId: 'log-2',
    datetime: '2026-08-07T10:05:00.000Z',
    actionRaw: 'Пополнение склада',
    actionType: 'finance_deposit',
    member: { nickname: 'Nick', staticId: 789 },
    initiator: null,
    status: 'parsed'
  }
];
`, 'utf8');
  return file;
}

function writeSlowScraperModule(dir) {
  const file = path.join(dir, 'slow-cabinet-scraper.js');
  fs.writeFileSync(file, `
exports.scrapeFamilyLogs = async () => {
  await new Promise(resolve => setTimeout(resolve, 50));
  return [];
};
`, 'utf8');
  return file;
}

function baseConfig(dir, scraperModulePath, patch = {}) {
  return {
    enabled: true,
    email: '',
    password: '',
    familyUrl: 'https://id.majestic-rp.ru/RU14/test/family',
    loginUrl: 'https://id.majestic-rp.ru/login',
    syncEnabled: true,
    syncChannelId: 'sync-channel',
    logChannelId: 'log-channel',
    syncIntervalMs: 60000,
    dataFile: path.join(dir, 'family-cabinet.json'),
    scraperModulePath,
    sessionStoragePath: path.join(dir, 'session.json'),
    logsFetchTarget: 200,
    financeTabEnabled: false,
    financeFetchTarget: 0,
    ...patch
  };
}

async function main() {
  const parsedActions = __familyCabinetScraperInternals.parseTextDump(`
08.08.2026, 18:22
Вернул авто speedtail владельцу
—
Luffy Klaiz #206656
08.08.2026, 00:26
Премия $100000
Slyflower Klaiz #15717
Luffy Klaiz #206656
  `);
  assert.equal(parsedActions.length, 2);
  assert.equal(parsedActions[0].actionType, 'transport_added');
  assert.equal(parsedActions[1].actionType, 'bonus');

  const parsedFinance = __familyCabinetScraperInternals.parseTextDump(`
08.08.2026, 18:22
-$2 000 000
$2 364 000,39
Взято из баланса семьи
Luffy Klaiz #206656
08.08.2026, 00:10
$10 000 000
$14 464 000,39
Пополнен баланс семьи
Luffy Klaiz #206656
  `, true);
  assert.equal(parsedFinance.length, 2);
  assert.equal(parsedFinance[0].actionType, 'finance_withdraw');
  assert.equal(parsedFinance[0].amount, -2000000);
  assert.equal(parsedFinance[1].actionType, 'finance_deposit');
  assert.equal(parsedFinance[1].balanceAfter, 14464000.39);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-cabinet-'));
  const scraperModulePath = writeScraperModule(dir);
  const syncMessages = [];
  const logMessages = [];
  const client = {
    channels: {
      fetch: async id => {
        if (id === 'sync-channel') return { id, send: async payload => syncMessages.push(payload) };
        if (id === 'log-channel') return { id, send: async payload => logMessages.push(payload) };
        return null;
      }
    }
  };

  const service = createFamilyCabinetService(client, baseConfig(dir, scraperModulePath));
  const first = await service.runSync('manual');
  assert.equal(first.status, 'ok');
  assert.equal(first.logsReceived, 2);
  assert.equal(first.logsCreated, 2);
  assert.equal(first.logsDelivered, 2);
  assert.equal(syncMessages.length, 2);
  assert.equal(logMessages.length, 1);

  const second = await service.runSync('manual');
  assert.equal(second.logsCreated, 0);
  assert.equal(second.logsDelivered, 0);
  assert.equal(syncMessages.length, 2);
  assert.equal(logMessages.length, 2);

  const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-cabinet-broken-'));
  const brokenService = createFamilyCabinetService({
    channels: {
      fetch: async id => (id === 'log-channel' ? { id, send: async payload => logMessages.push(payload) } : null)
    }
  }, baseConfig(brokenDir, scraperModulePath));
  const broken = await brokenService.runSync('manual');
  assert.equal(broken.logsCreated, 2);
  assert.equal(broken.logsDelivered, 0);
  assert.match(broken.errorMessage, /FAMILY_CABINET_SYNC_CHANNEL_ID/u);

  const slowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-cabinet-slow-'));
  const slowService = createFamilyCabinetService(client, baseConfig(slowDir, writeSlowScraperModule(slowDir)));
  const beforeAutoSkipSummaryCount = logMessages.length;
  const running = slowService.runSync('manual');
  const skippedAuto = await slowService.runSync('auto');
  assert.equal(skippedAuto.status, 'skipped');
  assert.equal(logMessages.length, beforeAutoSkipSummaryCount);
  const completed = await running;
  assert.equal(completed.status, 'ok');

  console.log('ALL FAMILY CABINET TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
