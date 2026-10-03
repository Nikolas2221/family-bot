const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ActionJournal } = require('../dist-ts/services/action-journal');
const { createStorage } = require('../dist-ts/storage');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-recovery-'));
  try {
    const file = path.join(dir, 'actions.json');
    const journal = new ActionJournal(file);
    const confirmations = journal.confirmations();
    confirmations.set('ABCDEF', { code: 'ABCDEF', expiresAt: Date.now() + 60000, guildId: 'guild', actorId: 'actor' });
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
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }

  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { trackWork, drainWork, isStopping } = require('./dist-ts/services/shutdown');
    (async () => {
      let finish;
      let completed = false;
      const task = trackWork(() => new Promise(resolve => { finish = () => { completed = true; resolve(); }; }));
      const drained = drainWork(1000);
      assert.equal(isStopping(), true);
      await trackWork(async () => { throw new Error('new work started while stopping'); });
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
