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
  const sessionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'family-bot-session-'));
  const sessionPath = path.join(sessionDirectory, 'storage-state.json');
  const previousSession = { cookies: [{ name: 'old', value: 'expired' }], origins: [] };
  const currentSession = { cookies: [{ name: 'current', value: 'valid' }], origins: [] };
  fs.writeFileSync(sessionPath, JSON.stringify(previousSession));
  const previousEncodedSession = process.env.CABINET_SESSION_B64;
  process.env.CABINET_SESSION_B64 = Buffer.from(JSON.stringify(currentSession), 'utf8').toString('base64');
  __familyCabinetScraperInternals.resetSessionEnvImportState();
  assert.equal(__familyCabinetScraperInternals.restoreSessionFromEnv(sessionPath), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(sessionPath, 'utf8')), currentSession);
  fs.writeFileSync(sessionPath, JSON.stringify(previousSession));
  assert.equal(__familyCabinetScraperInternals.restoreSessionFromEnv(sessionPath), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(sessionPath, 'utf8')), previousSession);
  __familyCabinetScraperInternals.resetSessionEnvImportState();
  assert.equal(__familyCabinetScraperInternals.restoreSessionFromEnv(sessionPath), false, 'restart must preserve refreshed file');
  process.env.CABINET_SESSION_B64 = Buffer.from(JSON.stringify({ cookies: [], origins: [] })).toString('base64');
  assert.equal(__familyCabinetScraperInternals.restoreSessionFromEnv(sessionPath), true, 'new export must replace old session');
  let initScript;
  let initPayload;
  await __familyCabinetScraperInternals.installSessionStorageRestore({ addInitScript: async (fn, payload) => { initScript = fn; initPayload = payload; } }, {
    origins: [{ origin: 'https://example.test', sessionStorage: [{ name: 'auth', value: 'old' }] }]
  });
  const previousWindow = global.window;
  const values = new Map();
  global.window = { location: { origin: 'https://example.test' }, sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } };
  try {
    initScript(initPayload);
    values.set('auth', 'refreshed');
    initScript(initPayload);
    assert.equal(values.get('auth'), 'refreshed', 'navigation must preserve refreshed authentication');
  } finally { global.window = previousWindow; }
  if (previousEncodedSession === undefined) delete process.env.CABINET_SESSION_B64;
  else process.env.CABINET_SESSION_B64 = previousEncodedSession;
  fs.rmSync(sessionDirectory, { recursive: true, force: true });

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
  const brokenConfig = baseConfig(brokenDir, scraperModulePath);
  fs.writeFileSync(brokenConfig.dataFile, '{broken');
  const recoveredBackup = createFamilyCabinetService(client, brokenConfig);
  assert.match(recoveredBackup.statusLines().join('\n'), /Ожидает доставки: 2/u);
  fs.writeFileSync(`${brokenConfig.dataFile}.backup`, '{broken');
  const unavailable = createFamilyCabinetService(client, brokenConfig);
  assert.equal(unavailable.isEnabled(), false);
  const unavailableRun = await unavailable.runSync('manual');
  assert.equal(unavailableRun.status, 'failed');
  assert.match(unavailableRun.errorMessage, /Очередь не перезаписана/u);
  unavailable.startAutoSync();
  assert.equal(unavailable.timer, null);
  assert.equal(fs.readFileSync(brokenConfig.dataFile, 'utf8'), '{broken');
  recoveredBackup.saveState();
  const recovered = createFamilyCabinetService(client, baseConfig(brokenDir, scraperModulePath));
  const retry = await recovered.runSync('manual');
  assert.equal(retry.logsCreated, 0, 'persisted history must not be reimported');
  assert.equal(retry.logsDelivered, 2, 'failed delivery must survive restart');
  assert.equal((await recovered.runSync('manual')).logsDelivered, 0, 'delivered queue must be cleared');

  const cardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-cabinet-card-'));
  let cards = 0;
  let edits = 0;
  const cardClient = { channels: { fetch: async id => id === 'log-channel'
    ? { send: async () => { cards++; return { id: 'status-card' }; }, messages: { fetch: async () => ({ edit: async () => { edits++; } }) } }
    : { send: async () => ({ id: 'log' }) } } };
  await createFamilyCabinetService(cardClient, baseConfig(cardDir, scraperModulePath)).runSync('auto');
  await createFamilyCabinetService(cardClient, baseConfig(cardDir, scraperModulePath)).runSync('auto');
  assert.equal(cards, 1, 'status message identity must survive restart');
  assert.equal(edits, 1, 'subsequent sync must edit the existing card');

  const slowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-cabinet-slow-'));
  const slowService = createFamilyCabinetService(client, baseConfig(slowDir, writeSlowScraperModule(slowDir)));
  const beforeAutoSkipSummaryCount = logMessages.length;
  const running = slowService.runSync('manual');
  const skippedAuto = await slowService.runSync('auto');
  assert.equal(skippedAuto.status, 'skipped');
  assert.equal(logMessages.length, beforeAutoSkipSummaryCount);
  const completed = await running;
  assert.equal(completed.status, 'ok');

  const authService = createFamilyCabinetService(client, baseConfig(slowDir, scraperModulePath));
  authService.scrape = async () => { throw new Error('Сессия кабинета истекла.'); };
  const noticeCount = logMessages.length;
  await authService.runSync('auto');
  await authService.runSync('auto');
  assert.equal(logMessages.length, noticeCount + 1, 'same authentication error must not spam Discord');
  await authService.runSync('manual');
  assert.equal(logMessages.length, noticeCount + 2, 'manual request must always return status');
  authService.stop();
  authService.scheduleNextAutoSync();
  assert.equal(authService.timer, null, 'stopped scheduler must not restart itself');

  console.log('ALL FAMILY CABINET TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
