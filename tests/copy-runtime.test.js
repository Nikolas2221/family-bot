const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function main() {
  const distCopyPath = path.resolve(__dirname, '..', 'dist-ts', 'copy.js');
  if (!fs.existsSync(distCopyPath)) {
    console.log('SKIP COPY RUNTIME TESTS (dist-ts/copy.js missing)');
    return;
  }

  delete require.cache[distCopyPath];
  const { copy } = require(distCopyPath);

  assert.strictEqual(
    copy.stats.voiceLine(0, { id: '42' }, 1.5, 10),
    '1. <@42> • 1.5 ч • 10/100'
  );
  assert.strictEqual(
    copy.stats.leaderboardLine(0, { id: '42' }, 'Заместители', 14, 0),
    '1. Заместители • <@42> • 14/100 • 0.0 ч'
  );

  console.log('ALL COPY RUNTIME TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
