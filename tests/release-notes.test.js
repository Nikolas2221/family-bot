const assert = require('assert');

const packageMeta = require('../package.json');
const { getReleaseNotes } = require('../release-notes');

async function main() {
  const currentVersion = packageMeta.version;
  const notes = getReleaseNotes(currentVersion);

  assert(notes, `Для текущей версии ${currentVersion} не найдены release notes.`);

  const totalItems =
    (notes.added?.length || 0) +
    (notes.updated?.length || 0) +
    (notes.fixed?.length || 0);

  assert(totalItems > 0, `Release notes для версии ${currentVersion} пустые.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };
