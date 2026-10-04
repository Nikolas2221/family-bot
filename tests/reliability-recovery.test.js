const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ActionJournal } = require('../dist-ts/services/action-journal');
const { createStorage } = require('../dist-ts/storage');
const { createDatabase } = require('../dist-ts/database');
const { writeSnapshot } = require('../dist-ts/services/file-persistence');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-recovery-'));
  try {
    const file = path.join(dir, 'actions.json');
    const journal = new ActionJournal(file);
    const confirmations = journal.confirmations();
    confirmations.set('ABCDEF', { code: 'ABCDEF', expiresAt: Date.now() + 60000, guildId: 'guild', actorId: 'actor', action: 'inactive_dm', risk: 'medium', targetId: 'channel', reason: '', summary: 'test' });
    journal.start('job', 'guild', 'inactive_dm');
    journal.recipient('job', 'a', 'delivered');
    journal.recipient('job', 'b', 'sending');
    journal.recipient('job', 'c', 'failed');
    const restarted = new ActionJournal(file);
    assert.equal(restarted.list()[0].status, 'interrupted');
    assert.equal(restarted.recentlySent('guild', 'inactive_dm', 'a'), true);
    assert.equal(restarted.recentlySent('guild', 'inactive_dm', 'b'), true, 'unknown delivery must not be duplicated');
    assert.equal(restarted.recentlySent('guild', 'inactive_dm', 'c'), false);
    assert.equal(restarted.recentlySent('another-guild', 'inactive_dm', 'a'), false);
    assert.equal(restarted.confirmations().has('ABCDEF'), true);
    restarted.confirmations().delete('ABCDEF');
    assert.equal(new ActionJournal(file).confirmations().size, 0, 'consumed confirmation must stay consumed after restart');
    assert.throws(() => restarted.start('job', 'guild', 'inactive_dm'), /already exists/);
    fs.writeFileSync(file, '{}');
    const restored = new ActionJournal(file);
    assert.equal(restored.isAvailable(), true);
    assert.equal(restored.list()[0].id, 'job');
    assert.equal(restored.confirmations().size, 0);
    assert.equal(restored.recentlySent('guild', 'inactive_dm', 'new-user'), true, 'backup recovery must account for potentially lost deliveries');
    fs.writeFileSync(file, '{broken');
    fs.writeFileSync(`${file}.bak`, '{}');
    const damaged = new ActionJournal(file);
    assert.equal(damaged.isAvailable(), false);
    assert.equal(damaged.confirmations().size, 0);
    assert.throws(() => damaged.start('unsafe', 'guild', 'inactive_dm'), /unavailable/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken', 'unrecoverable state must not be overwritten');

    const timedFile = path.join(dir, 'timed.json');
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
      const timed = new ActionJournal(timedFile);
      timed.start('timed', 'guild', 'inactive_dm');
      timed.recipient('timed', 'first', 'delivered');
      now += 23 * 3600000;
      timed.recipient('timed', 'second', 'delivered');
      now += 2 * 3600000;
      const reloaded = new ActionJournal(timedFile);
      assert.equal(reloaded.recentlySent('guild', 'inactive_dm', 'first'), false);
      assert.equal(reloaded.recentlySent('guild', 'inactive_dm', 'second'), true);
    } finally { Date.now = realNow; }

    const dataFile = path.join(dir, 'state.json');
    const storage = createStorage({ dataFile });
    storage.flush();
    const saved = fs.readFileSync(dataFile, 'utf8');
    assert.equal(storage.healthStatus().writable, true);
    assert.equal(fs.readFileSync(dataFile, 'utf8'), saved, 'health probe must not modify user data');
    const rename = fs.renameSync;
    try {
      fs.renameSync = () => { throw Object.assign(new Error('disk unavailable'), { code: 'ENOSPC' }); };
      const failed = createStorage({ dataFile });
      assert.equal(failed.healthStatus().writable, false, 'permissions alone must not report a writable disk');
    } finally { fs.renameSync = rename; }
    assert.equal(fs.readdirSync(dir).some(name => name.includes('.health-')), false);
    const atomicFile = path.join(dir, 'atomic.json');
    writeSnapshot(atomicFile, '{"version":1}');
    try {
      fs.renameSync = (source, target) => {
        if (target === `${atomicFile}.bak`) throw new Error('backup rename interrupted');
        return rename(source, target);
      };
      assert.throws(() => writeSnapshot(atomicFile, '{"version":2}'), /interrupted/);
      assert.deepEqual(JSON.parse(fs.readFileSync(atomicFile, 'utf8')), { version: 2 });
      assert.deepEqual(JSON.parse(fs.readFileSync(`${atomicFile}.bak`, 'utf8')), { version: 1 });
    } finally { fs.renameSync = rename; }
    const db = createDatabase({ dataFile: path.join(dir, 'database.json') });
    try {
      fs.renameSync = () => { throw new Error('disk error'); };
      assert.throws(() => db.flush(), /disk error/);
      assert.equal(db.healthStatus().hasWriteError, true);
    } finally { fs.renameSync = rename; }
    db.flush();
    assert.equal(db.healthStatus().hasWriteError, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { trackWork, trackListener, drainWork, isStopping } = require('./dist-ts/services/shutdown');
    (async () => {
      let finish;
      let completed = false;
      const handler = trackListener(() => new Promise(resolve => { finish = () => { completed = true; resolve(); }; }));
      const task = handler();
      const drained = drainWork(1000);
      assert.equal(isStopping(), true);
      await trackWork(async () => { throw new Error('new work started while stopping'); });
      await trackListener(() => { throw new Error('event started while stopping'); })();
      assert.equal(completed, false);
      finish();
      assert.equal(await drained, true);
      await task;
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });
  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { trackWork, drainWork } = require('./dist-ts/services/shutdown');
    void trackWork(() => new Promise(() => {}));
    drainWork(10).then(result => assert.equal(result, false)).catch(() => { process.exitCode = 1; });
  `], { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });
}

module.exports = { main };
