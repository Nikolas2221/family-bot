const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createAiBudget } = require('../dist-ts/services/ai-budget');
const { createDatabase } = require('../dist-ts/database');
const { createDataBackups, runtimeBackupSources } = require('../dist-ts/services/data-backups');
const { createDeepSeekService } = require('../dist-ts/services/deepseek');
const { AdminChanges, AdminChangeError } = require('../dist-ts/services/admin-changes');
const { MajesticApiClient } = require('../dist-ts/modules/majesticApi/client');
const { createRankService } = require('../dist-ts/ranks');
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'family-full-audit-'));
  try {
    const file = path.join(dir, 'budget.json');
    let now = Date.parse('2026-10-28T12:00:00Z');
    const options = { dailyTokens: 1000, userRequests: 1, channelRequests: 1, now: () => now };
    for (const requests of [[], 'bad', 5]) {
      fs.writeFileSync(file, JSON.stringify({ day: '2026-10-28', reserved: 0, actual: 0, requests }));
      let transmitted = false;
      const fetch = createAiBudget(file, options).guardedFetch(async () => { transmitted = true; return new Response('{}'); });
      await assert.rejects(fetch('https://invalid', {}), /unavailable/);
      assert.equal(transmitted, false);
    }
    fs.unlinkSync(file);
    const budget = createAiBudget(file, options);
    await budget.guardedFetch(async () => new Response('{}'))('https://invalid', { body: '{"max_tokens":900}' });
    assert.match(budget.healthLines().join(' '), /80%/);
    now += 86400000;
    assert.match(budget.healthLines().join(' '), /токены 0\/1000/);
    assert.doesNotMatch(budget.healthLines().join(' '), /80%/);
    const databaseFile = path.join(dir, 'database.json');
    fs.writeFileSync(databaseFile, '{broken');
    fs.writeFileSync(databaseFile + '.bak', '{"meta":{"version":999},"guilds":{}}');
    assert.throws(() => createDatabase({ dataFile: databaseFile }), /Неподдерживаемая/);
    assert.match(fs.readFileSync(databaseFile + '.bak', 'utf8'), /999/);
    fs.writeFileSync(databaseFile, '{"meta":{"version":1},"guilds":{}}');
    fs.unlinkSync(databaseFile + '.bak');
    const storeFile = path.join(dir, 'storage.json');
    fs.writeFileSync(storeFile, '{"members":{},"applications":[]}');
    fs.writeFileSync(storeFile + '.actions.json', '{"jobs":{},"pending":{}}');
    fs.writeFileSync(storeFile + '.ai-usage.json', '{}');
    const backups = createDataBackups(path.join(dir, 'backups'), runtimeBackupSources(storeFile, databaseFile));
    const names = backups.verify(backups.create()).files.map(file => file.name);
    assert.ok(names.includes('actions') && names.includes('ai-usage'));
    const output = execFileSync(process.execPath, ['scripts/data-maintenance.js', 'create', '--offline'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: { ...process.env, STORAGE_FILE: storeFile, DATABASE_FILE: databaseFile, DATA_BACKUP_DIR: path.join(dir, 'cli-backups') } });
    assert.match(output, /Создан архив/);
    const diskFailureTest = String.raw`const fs=require('fs');const {createDatabase}=require('./dist-ts/database');const db=createDatabase({dataFile:process.argv[1],saveDelayMs:5});db.flush();const rename=fs.renameSync;fs.renameSync=()=>{throw Error('disk full')};db.updateGuildSettings('g',{familyTitle:'Changed'});setTimeout(()=>{fs.renameSync=rename;if(!db.healthStatus().hasWriteError)process.exit(2);},25);`;
    execFileSync(process.execPath, ['-e', diskFailureTest, path.join(dir, 'disk-failure.json')], { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });
    const service = createDeepSeekService({ apiKey: 'fake', timeoutMs: 15, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
    await assert.rejects(service.answerLawQuestion('test', [{ excerpt: 'source' }]), /timeout after 15ms/);
    const majestic = new MajesticApiClient({ apiKey: 'fake', timeoutMs: 15, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
    await assert.rejects(majestic.get('/test'), /Majestic API timeout/);
    const denied = new MajesticApiClient({ apiKey: 'fake', fetchImpl: async () => new Response('private-provider-body', { status: 403 }) });
    await assert.rejects(denied.get('/test'), error => error.status === 403 && !error.message.includes('private-provider-body') && error.body === '');
    const journal = new AdminChanges(path.join(dir, 'admin.json'));
    await assert.rejects(journal.undo('guild', 'missing', 'actor', async () => ({}), async () => {}), error => error instanceof AdminChangeError && /не найдено/.test(error.message));
    const ranks = createRankService({ roles: [{ id: 'senior', key: 'elder', name: 'Senior' }, { id: 'junior', key: 'member', name: 'Junior' }], storage: { getActivityScore: () => 0 }, autoRanks: { enabled: false } });
    let roleWrites = 0;
    const member = { id: 'user', guild: { roles: { cache: new Map(), fetch: async () => null } }, roles: { cache: new Map([['junior', {}]]), add: async () => { roleWrites++; }, remove: async () => { roleWrites++; } } };
    await assert.rejects(ranks.promote(member), /role missing or inaccessible/);
    assert.equal(roleWrites, 0);
    const dockerignore = fs.readFileSync(path.resolve(__dirname, '../.dockerignore'), 'utf8');
    for (const entry of ['*.admin-changes.json*', '*.ai-usage.json*', 'data-backups']) assert.ok(dockerignore.includes(entry));
    console.log('PASS full audit regressions: quota schema/day, future backup, full archives/CLI, body timeout, rollback errors, missing rank role, Docker exclusions');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
module.exports = { main };
