const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStorage } = require('../dist-ts/storage');
const { createDatabase } = require('../dist-ts/database');

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-validation-'));
  try {
    for (const [name, factory, invalid, legacy] of [
      ['storage', createStorage, { applications: {} }, { members: {}, panelMessageId: 'legacy-panel' }],
      ['database', createDatabase, { guilds: { bad: { settings: { roleMenus: {} } } } }, { guilds: { legacy: { guildName: 'Legacy' } } }]
    ]) {
      const file = path.join(dir, `${name}.json`);
      const malformed = JSON.stringify(invalid);
      fs.writeFileSync(file, malformed);
      fs.writeFileSync(`${file}.bak`, '{broken');
      assert.throws(() => factory({ dataFile: file }), /no valid state copy/);
      assert.equal(fs.readFileSync(file, 'utf8'), malformed);
      assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), '{broken');
      assert.ok(fs.readdirSync(dir).some(entry => entry.startsWith(`${name}.json.corrupt-`)));
      fs.writeFileSync(`${file}.bak`, JSON.stringify(legacy));
      const recovered = factory({ dataFile: file });
      recovered.flush();
      const roundtrip = factory({ dataFile: file });
      if (name === 'storage') {
        assert.equal(roundtrip.getStore().panelMessageId, 'legacy-panel');
        assert.deepEqual(roundtrip.getStore().applications, []);
      } else {
        assert.equal(roundtrip.getGuild('legacy').guildName, 'Legacy');
        assert.ok(roundtrip.getGuild('legacy').settings.channels);
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
module.exports = { main };
